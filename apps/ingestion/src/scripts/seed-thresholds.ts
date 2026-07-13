import { createDb, riskThresholds } from "@seap/db";

/**
 * Seed the date-aware DA legal ceilings (red-flags DEC-006). Values from Legea
 * 98/2016 art. 7(5), net of VAT: 132.519 / 441.730 for 2016→2023, raised to
 * 270.120 / 900.400 afterwards. Statistical thresholds (rapid-hours, HHI cutoffs)
 * are seeded in the flag-rules phase, calibrated against the data distribution.
 *
 *   pnpm --filter ingestion seed-thresholds
 */
const RAISE = new Date("2023-01-01T00:00:00Z"); // boundary for the post-2023 raise
const L98 = new Date("2016-05-19T00:00:00Z"); // Legea 98/2016 in force
const BASE = new Date("2000-01-01T00:00:00Z"); // open window for statistical cutoffs

const ROWS = [
  // Legal DA ceilings (net VAT), date-aware.
  { key: "da_ceiling_goods_services", validFrom: L98, validTo: RAISE, valueNum: "132519", note: "L98/2016 art.7(5) produse/servicii" },
  { key: "da_ceiling_goods_services", validFrom: RAISE, validTo: null, valueNum: "270120", note: "post-2023 raise" },
  { key: "da_ceiling_works", validFrom: L98, validTo: RAISE, valueNum: "441730", note: "L98/2016 art.7(5) lucrări" },
  { key: "da_ceiling_works", validFrom: RAISE, validTo: null, valueNum: "900400", note: "post-2023 raise" },
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
  for (const r of ROWS) {
    await db
      .insert(riskThresholds)
      .values(r)
      .onConflictDoUpdate({
        target: [riskThresholds.key, riskThresholds.validFrom],
        set: { validTo: r.validTo, valueNum: r.valueNum, note: r.note },
      });
  }
  const all = await sql`select key, valid_from, valid_to, value_num from core.risk_thresholds order by key, valid_from`;
  console.log(JSON.stringify(all, null, 2));
  await sql.end();
}

main().catch((err) => {
  console.error("seed-thresholds crashed:", err);
  process.exit(1);
});
