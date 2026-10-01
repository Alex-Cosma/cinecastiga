import { NextResponse } from "next/server";
import { getCoverage } from "@/lib/coverage";
import { getProcessingFreshness } from "@/lib/processing-freshness";
import type { PublicCoverage } from "@/lib/coverage-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [coverage, freshness] = await Promise.all([getCoverage(), getProcessingFreshness()]);
    const result: PublicCoverage = {
      sources: (coverage?.observations ?? []).map(({ dataset, observation, calculated_at }) => ({
        dataset, from: observation.date_from, to: observation.date_to, inventoriedAt: calculated_at,
      })),
      dataAt: freshness?.dataAt ?? null,
      riskAt: freshness?.riskAt ?? null,
    };
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Perioadele disponibile nu pot fi citite acum." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
