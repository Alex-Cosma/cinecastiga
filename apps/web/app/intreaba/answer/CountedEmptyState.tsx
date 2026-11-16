"use client";

import { useEffect, useState, type ReactNode } from "react";
import { countWords } from "../../../lib/ask/answer-text";
import type { FacetCounts } from "../../../lib/ask/facet-parts";
import type { AskSpec } from "../../../lib/ask/spec";
import EmptyState, { MAX_RELAX } from "./EmptyState";

/*
 * The empty answer with its wider questions counted (UX audit Z3-29): „Toți anii · 12 înregistrări”, so leaving zero is
 * an informed choice. The counts are the builder windows' own (POST /api/ask/facets, part `channel`: the records of
 * the wider question on each channel), asked lazily once the empty answer is drawn, at most three; a button is ready
 * before its count and keeps its plain words when the count cannot be read.
 */

export interface CountedRelaxation { id: string; label: string; spec: AskSpec; onClick: () => void }

/** The records of a wider question from its channel counts: its own channel's, or both. */
export function relaxRecords(spec: Pick<AskSpec, "dataset">, counts: Pick<FacetCounts, "options" | "total">): number {
  const channel = spec.dataset === "da" || spec.dataset === "contracts" ? counts.options.find((o) => o.value === spec.dataset) : null;
  return channel ? channel.n : counts.total.n;
}

export default function CountedEmptyState({ message, relax, titleId, children }: { message: string; relax: readonly CountedRelaxation[]; titleId?: string; children?: ReactNode }) {
  const shown = relax.slice(0, MAX_RELAX);
  const key = JSON.stringify(shown.map((r) => r.spec));
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    setCounts({});
    const controller = new AbortController();
    for (const r of shown) {
      void fetch("/api/ask/facets", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ spec: r.spec, part: "channel" }) })
        .then(async (response) => (await response.json().catch(() => null)) as ({ ok: boolean } & FacetCounts) | null)
        .then((answer) => { if (answer?.ok && !controller.signal.aborted) setCounts((c) => ({ ...c, [r.id]: relaxRecords(r.spec, answer) })); })
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- `shown` changes with `key` only
  return <EmptyState message={message} {...(titleId ? { titleId } : {})} relax={shown.map((r) => ({
    id: r.id, onClick: r.onClick,
    label: counts[r.id] === undefined ? r.label : `${r.label} · ${countWords(counts[r.id]!, "înregistrare", "înregistrări")}`,
  }))}>{children}</EmptyState>;
}
