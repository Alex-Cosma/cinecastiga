import type { DbSql } from "./client.js";

type Query = DbSql | Parameters<Parameters<DbSql['begin']>[1]>[0];

/**
 * Rollups for the Ask questions that scan the 20M-row transaction marts
 * (plan "filtre pe întrebare" D2; slow cases of 24 October 2026: national
 * trends, the paged and filtered national rankings, the minimum-records
 * threshold, breakdowns). Each holds the population of every Ask aggregate,
 * so an answer read from it equals the live one: accepted DAs with
 * 0 < closing_value <= DA_PLAFOND_RON (the analysis ceiling of
 * apps/web/lib/ask/compile.ts, which binds every DA aggregate) and contract
 * allocations with closing_value > 0 (the 1 bn lei contract ceiling is applied
 * when contract_transactions is built). Sums are exact numeric sums, so
 * summing groups again gives the live total to the last decimal.
 *
 * Grain (y = substr(finalization_date, 1, 4), null when undated; county =
 * the buying institution's county, the transaction's own d.county):
 * - agg_pair_year (authority_id, supplier_id, y, src, county): rows of one
 *   pair. Questions that filter or count one side and rank the other
 *   (suppliers of hospitals, institutions buying from firms with 1–9
 *   employees, the minimum-records threshold). Unknown ids stay as null.
 * - agg_entity_year (role, eid, y, src, county): one entity on one side,
 *   grouped from agg_pair_year (the same sums and counts, without a second
 *   scan of the 20.7M rows); nm is core.entities.name_display, the name both
 *   transaction marts carry for the id. Rankings and trends of one role, with
 *   filters on that role, the buyer county, years and channel.
 * - agg_cpv_year (src, y, county, cpv_code): all rows by full CPV code, with
 *   the first and last finalization date (d0, d1). Breakdowns at any depth,
 *   and totals, years, counties and the source drawer's totals and period
 *   without an entity filter.
 * - agg_entity_month (role, eid, y, m, src, county): agg_entity_year with the
 *   month (m = substr(finalization_date, 6, 2)), for the trend's same months
 *   of two years (plan F2, owner-D2-rollups: the live national query was over
 *   the speed bar). agg_pair_year and agg_entity_year are grouped from the
 *   month grain (a temporary pair-month table), equal to grouping the union:
 *   0 differences on the local copy of 25 October 2026 (4,966,873 and
 *   1,907,017 rows), for about 40 s more per build and 713 MB.
 * So the build reads the union twice (pair month, CPV), not once per rollup.
 *
 * Rebuilt with the agg_* shortcuts (DROP + CREATE AS) in the transaction that
 * loads da_transactions, so they always agree with it. contract_transactions
 * is loaded earlier, by the marts stage: until the next transactions stage
 * the rollups and agg_* keep the contracts of the previous build while the
 * live queries read the new ones. In a nightly run the public site is closed
 * (503) between the two stages (on a weekly run flags and flag-marts run in
 * between); after a manual marts-only rebuild, or a failed transactions
 * stage, the gap lasts until the next transactions stage. Not
 * migration-owned: readers probe for them (apps/web/lib/ask/rollups.ts) and
 * fall back to the live query until the first build with this code.
 */
export const ASK_ROLLUP_TABLES = ['agg_entity_year', 'agg_pair_year', 'agg_cpv_year', 'agg_entity_month'] as const;
export type AskRollupTable = (typeof ASK_ROLLUP_TABLES)[number];

/** The DA ceiling written (as a literal, like the agg_* builds) into the three
 * statements below; equal to DA_PLAFOND_RON in apps/web/lib/ask/compile.ts,
 * which the parity test checks. */
export const ASK_ROLLUP_DA_CEILING = 2_000_000;

export interface AskRollupsReport {
  /** Rows written per rollup. */
  rows: Record<AskRollupTable, number>;
}

/** Build the three rollups from the loaded transaction marts. Call inside the
 * build transaction, after da_transactions is final (da_split stamped). */
export async function buildAskRollups(q: Query): Promise<AskRollupsReport> {
  await q`drop table if exists marts.agg_entity_year, marts.agg_pair_year, marts.agg_cpv_year, marts.agg_entity_month`;
  // One pass over the union at the month grain (9,965,281 groups on the local copy of
  // 25 October 2026, 21 s); the yearly pairs and both entity rollups are grouped from it.
  await q`drop table if exists pg_temp.ask_pair_month`;
  await q`
    create temp table ask_pair_month on commit drop as
    select x.authority_id, x.supplier_id, substr(x.finalization_date, 1, 4) y, substr(x.finalization_date, 6, 2) m, x.src, x.county,
           sum(x.closing_value) v, count(*) n
    from (
      select authority_id, supplier_id, county, finalization_date, closing_value, 'da'::text src
      from marts.da_transactions where closing_value > 0 and closing_value <= 2000000
      union all
      select authority_id, supplier_id, county, finalization_date, closing_value, 'contracts'
      from marts.contract_transactions where closing_value > 0
    ) x
    group by x.authority_id, x.supplier_id, substr(x.finalization_date, 1, 4), substr(x.finalization_date, 6, 2), x.src, x.county
  `;
  const pair = await q`
    create table marts.agg_pair_year as
    select authority_id, supplier_id, y, src, county, sum(v) v, sum(n)::bigint n
    from pg_temp.ask_pair_month
    group by authority_id, supplier_id, y, src, county
  `;
  // Each pair row once as its authority and once as its supplier: the same groups,
  // names and types as grouping the union (6,574,205 months, then 1,907,017 years,
  // sum(n) 41,437,684 on the local copy), without another pass over the 20.7M rows.
  const month = await q`
    create table marts.agg_entity_month as
    select g.role, g.eid, g.y, g.m, g.src, g.county, e.name_display nm, g.v, g.n
    from (
      select r.role, r.eid, p.y, p.m, p.src, p.county, sum(p.v) v, sum(p.n)::bigint n
      from pg_temp.ask_pair_month p
      cross join lateral (values ('authority'::text, p.authority_id), ('supplier'::text, p.supplier_id)) r(role, eid)
      where r.eid is not null
      group by r.role, r.eid, p.y, p.m, p.src, p.county
    ) g
    left join core.entities e on e.id = g.eid
  `;
  const entity = await q`
    create table marts.agg_entity_year as
    select role, eid, y, src, county, nm, sum(v) v, sum(n)::bigint n
    from marts.agg_entity_month
    group by role, eid, y, src, county, nm
  `;
  await q`drop table pg_temp.ask_pair_month`;
  const cpv = await q`
    create table marts.agg_cpv_year as
    select x.src, substr(x.finalization_date, 1, 4) y, x.county, x.cpv_code,
           sum(x.closing_value) v, count(*) n,
           min(x.finalization_date) d0, max(x.finalization_date) d1
    from (
      select county, cpv_code, finalization_date, closing_value, 'da'::text src
      from marts.da_transactions where closing_value > 0 and closing_value <= 2000000
      union all
      select county, cpv_code, finalization_date, closing_value, 'contracts'
      from marts.contract_transactions where closing_value > 0
    ) x
    group by x.src, substr(x.finalization_date, 1, 4), x.county, x.cpv_code
  `;
  // Read right after the build: without statistics the planner misjudges the
  // semi-joins (measured 1.27 s before, 0.79 s after, on the national threshold).
  await q`analyze marts.agg_entity_year`;
  await q`analyze marts.agg_pair_year`;
  await q`analyze marts.agg_cpv_year`;
  await q`analyze marts.agg_entity_month`;
  return { rows: { agg_entity_year: entity.count, agg_pair_year: pair.count, agg_cpv_year: cpv.count, agg_entity_month: month.count } };
}
