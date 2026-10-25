import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { getCoverage } from "@/lib/coverage";
import { getProcessingFreshness } from "@/lib/processing-freshness";
import { coveragePeriods } from "@/lib/ask/compile";
import type { PublicCoverage } from "@/lib/coverage-summary";

export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __seapAskSql?: DbSql };
const db = (): DbSql => g.__seapAskSql ??= createDb().sql;

export async function GET() {
  try {
    // `periods` is the engine's own coverage (coveragePeriods, keyed on the data checkpoint):
    // the builder's default years and a trend's same months read what the answer will read.
    const [coverage, freshness, periods] = await Promise.all([getCoverage(), getProcessingFreshness(), coveragePeriods(db())]);
    const result: PublicCoverage = {
      sources: (coverage?.observations ?? []).map(({ dataset, observation, calculated_at }) => ({
        dataset, from: observation.date_from, to: observation.date_to,
        ...(observation.complete_until === undefined ? {} : { completeUntil: observation.complete_until }),
        inventoriedAt: calculated_at,
      })),
      dataAt: freshness?.dataAt ?? null,
      riskAt: freshness?.riskAt ?? null,
      periods,
    };
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Perioadele disponibile nu pot fi citite acum." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
