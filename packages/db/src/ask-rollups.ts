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
 * - agg_entity_year (role, eid, y, src, county): one entity on one side; nm is
 *   the transaction name (one per id in the marts). Rankings and trends of one
 *   role, with filters on that role, the buyer county, years and channel.
 * - agg_pair_year (authority_id, supplier_id, y, src, county): rows of one
 *   pair. Questions that filter or count one side and rank the other
 *   (suppliers of hospitals, institutions buying from firms with 1–9
 *   employees, the minimum-records threshold). Unknown ids stay as null.
 * - agg_cpv_year (src, y, county, cpv_code): all rows by full CPV code.
 *   Breakdowns at any depth, and totals, years and counties without an entity
 *   filter.
 *
 * Rebuilt with the agg_* shortcuts (DROP + CREATE AS) in the same transaction
 * as da_transactions, so they never disagree with it. Not migration-owned:
 * readers probe for them (apps/web/lib/ask/rollups.ts) and fall back to the
 * live query until the first build with this code.
 */
export const ASK_ROLLUP_TABLES = ['agg_entity_year', 'agg_pair_year', 'agg_cpv_year'] as const;
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
  await q`drop table if exists marts.agg_entity_year, marts.agg_pair_year, marts.agg_cpv_year`;
  // Every row once as its authority and once as its supplier: one pass.
  const entity = await q`
    create table marts.agg_entity_year as
    select r.role, r.eid, substr(x.finalization_date, 1, 4) y, x.src, x.county,
           max(r.nm) nm, sum(x.closing_value) v, count(*) n
    from (
      select authority_id, authority_name, supplier_id, supplier_name, county, finalization_date, closing_value, 'da'::text src
      from marts.da_transactions where closing_value > 0 and closing_value <= 2000000
      union all
      select authority_id, authority_name, supplier_id, supplier_name, county, finalization_date, closing_value, 'contracts'
      from marts.contract_transactions where closing_value > 0
    ) x
    cross join lateral (values ('authority'::text, x.authority_id, x.authority_name),
                               ('supplier'::text, x.supplier_id, x.supplier_name)) r(role, eid, nm)
    where r.eid is not null
    group by r.role, r.eid, substr(x.finalization_date, 1, 4), x.src, x.county
  `;
  const pair = await q`
    create table marts.agg_pair_year as
    select x.authority_id, x.supplier_id, substr(x.finalization_date, 1, 4) y, x.src, x.county,
           sum(x.closing_value) v, count(*) n
    from (
      select authority_id, supplier_id, county, finalization_date, closing_value, 'da'::text src
      from marts.da_transactions where closing_value > 0 and closing_value <= 2000000
      union all
      select authority_id, supplier_id, county, finalization_date, closing_value, 'contracts'
      from marts.contract_transactions where closing_value > 0
    ) x
    group by x.authority_id, x.supplier_id, substr(x.finalization_date, 1, 4), x.src, x.county
  `;
  const cpv = await q`
    create table marts.agg_cpv_year as
    select x.src, substr(x.finalization_date, 1, 4) y, x.county, x.cpv_code,
           sum(x.closing_value) v, count(*) n
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
  return { rows: { agg_entity_year: entity.count, agg_pair_year: pair.count, agg_cpv_year: cpv.count } };
}
