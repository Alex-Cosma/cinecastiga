"use client";

import { useEffect, useState } from "react";
import type { CoveragePeriods } from "../../../lib/ask/months-window";
import type { CoverageSpan } from "./window-model";

/*
 * The archive's coverage (/api/data-coverage), asked once per page for the
 * whole builder (plan §2.6 "Acoperirea la montare"): the span the period
 * presets say, and the engine's own periods per channel (coveragePeriods), for
 * a new trend's years and the months "Aceleași luni" counts. The builder works
 * without it and fills in when it comes.
 */

export interface BuilderCoverage { span: CoverageSpan; periods: CoveragePeriods | null }

interface Body {
  sources?: { dataset: string; from: string; to: string }[];
  periods?: CoveragePeriods | null;
}

let request: Promise<BuilderCoverage | null> | null = null;

export function readCoverage(): Promise<BuilderCoverage | null> {
  request ??= fetch("/api/data-coverage").then(async (r) => {
    if (!r.ok) return null;
    const body = await r.json() as Body;
    const da = body.sources?.find((s) => s.dataset === "da"), ctr = body.sources?.find((s) => s.dataset === "contracts");
    const to = [da?.to, ctr?.to].filter((d): d is string => Boolean(d)).sort()[0];
    const first = [da?.from, ctr?.from].filter((d): d is string => Boolean(d)).sort()[0];
    const span: CoverageSpan = { ...(da?.from ? { from: da.from } : {}), ...(to ? { to } : {}), ...(first ? { first } : {}) };
    return { span, periods: body.periods ?? null };
  }).catch(() => { request = null; return null; });
  return request;
}

/** The coverage once it has come (null until then, or when it cannot be read). */
export function useCoverage(): BuilderCoverage | null {
  const [coverage, setCoverage] = useState<BuilderCoverage | null>(null);
  useEffect(() => { let live = true; void readCoverage().then((value) => { if (live) setCoverage(value); }); return () => { live = false; }; }, []);
  return coverage;
}
