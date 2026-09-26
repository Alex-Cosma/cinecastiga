import { runMonitoredCli } from "../monitoring/cli.js";
import { createDb, riskThresholds } from "@seap/db";
import { DA_CEILING_SEED_ROWS } from "@seap/domain";
import { inArray } from "drizzle-orm";

/**
 * Seed the date-aware DA legal ceilings (red-flags DEC-006). Art. 7(5) Legea
 * 98/2016 changed twice, so three eras (net of VAT, produse/servicii · lucrări):
 * 2016: 132.519 · 441.730 → OUG 45/2018 (4 iun. 2018): 135.060 · 450.200 →
 * Legea 208/2022 (10 sept. 2022): 270.120 · 900.400. Statistical thresholds
 * (rapid-hours, HHI cutoffs) are calibrated against the data distribution.
 *
 *   pnpm --filter ingestion seed-thresholds
 */
const BASE = new Date("2000-01-01T00:00:00Z"); // open window for statistical cutoffs

// Ceiling keys are wiped + reinserted below: era boundaries moved across
// versions, and a (key, valid_from) upsert would leave stale overlapping windows.
const ROWS = [
  // Legal DA ceilings (net VAT), date-aware.
  ...DA_CEILING_SEED_ROWS.map((r) => ({ ...r,
    validFrom: new Date(`${r.validFrom}T00:00:00Z`),
    validTo: r.validTo ? new Date(`${r.validTo}T00:00:00Z`) : null,
  })),
  // Statistical cutoffs, calibrated against the 2020 DA distribution (2026-07-13).
  { key: "da_max_plausible", validFrom: BASE, validTo: null, valueNum: "2000000", note: "exclude corrupt closing values >2M (>4x works ceiling)" },
  { key: "da_rapid_hours", validFrom: BASE, validTo: null, valueNum: "0.1667", note: "10 min — DAs are inherently fast, so tight cutoff (~8.5%)" },
  { key: "da_conc_top_pct", validFrom: BASE, validTo: null, valueNum: "0.6", note: "top supplier >=60% of authority DA spend" },
  { key: "da_conc_min_suppliers", validFrom: BASE, validTo: null, valueNum: "3", note: "min distinct suppliers to call it a choice" },
  { key: "da_conc_min_total", validFrom: BASE, validTo: null, valueNum: "100000", note: "materiality floor" },
  { key: "da_dep_top_pct", validFrom: BASE, validTo: null, valueNum: "0.85", note: "supplier >=85% revenue from one authority" },
  { key: "da_dep_min_total", validFrom: BASE, validTo: null, valueNum: "50000", note: "materiality floor" },
  { key: "da_split_min_count", validFrom: BASE, validTo: null, valueNum: "3", note: "min sub-ceiling DAs in a pair-year" },
  { key: "da_round_floor_pct", validFrom: BASE, validTo: null, valueNum: "0.9", note: ">=90% of applicable ceiling" },
  { key: "da_year_end_share", validFrom: BASE, validTo: null, valueNum: "0.35", note: "December >=35% of annual (vs 8.3% uniform)" },
  { key: "da_year_end_min_total", validFrom: BASE, validTo: null, valueNum: "100000", note: "materiality floor" },
];

async function main(): Promise<void> {
  const { db, sql } = createDb();
  await runMonitoredCli(sql, "seed-thresholds", async () => {
    await db.transaction(async (tx) => {
      // Replace all eras atomically: a reader must never see a partially seeded table.
      await tx.delete(riskThresholds).where(inArray(riskThresholds.key, ["da_ceiling_goods_services", "da_ceiling_works"]));
      for (const r of ROWS) {
        await tx
        .insert(riskThresholds)
        .values(r)
        .onConflictDoUpdate({
          target: [riskThresholds.key, riskThresholds.validFrom],
          set: { validTo: r.validTo, valueNum: r.valueNum, note: r.note },
        });
      }
    });
    const all = await sql`select key, valid_from, valid_to, value_num from core.risk_thresholds order by key, valid_from`;
    console.log(JSON.stringify(all, null, 2));
  });
}

main().catch((err) => {
  console.error("seed-thresholds crashed:", err);
  process.exit(1);
});
