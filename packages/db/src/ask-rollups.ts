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
 * - The pair and entity rollups also keep the first and last day of their
 *   rows (d0, d1: left(finalization_date, 10), byte order, which is the
 *   calendar order of that one format): the source drawer of a trend's group
 *   reads its records, value and period from the answer's grouping instead of
 *   a scan of its members' rows (national growths: 13 s live; plan F2, T3).
 *   About +17 s per build and +314 MB on the local copy of 25 October 2026.
 * - agg_county_month (src, y, m, county): every row by the buyer's county
 *   and month, with d0/d1, grouped from agg_entity_month's authorities and
 *   the pair months without an authority (8,985 rows, ~1 MB, 2.8 s on the
 *   local copy of 25 October 2026; 15–17 s from the temporary table alone,
 *   which parallel workers cannot read): the county trend on the same months,
 *   whose live query was over the speed bar (3–6 s nationally; F2 review,
 *   under owner-D2-rollups). Rows without an authority are in it, as in the
 *   union; 0 differences with the live grouping.
 * So the build reads the union twice (pair month, CPV), not once per rollup.
 * The whole build, measured on the same copy: 115 s (127–132 s with the
 * county months from the temporary table; 43 s before F2), so F2 adds ~70 s
 * a night.
 * - agg_months (src, y, m, county, cpv2): every row by month, buyer county and
 *   CPV division (the first two digits, null without a code), with the largest
 *   record (mx). The evolution's months, its split by channel or domain, its
 *   same months and each bar's largest record (plan §4.3, F3; owner-D2-rollups:
 *   the live national series by domain on the same months took 6.4 s, the
 *   largest record of each year 2.2 s). The purchase kind is a function of the
 *   division (45 works, 50 and above services, the rest goods), so a kind is
 *   answered here too; a domain term is not (its prefixes are finer).
 * - agg_national_mix (src, y, county, cpv2, procedure_type, size, offers): the
 *   composition of a total (stat's „Din care”, plan §4.1, F3): the procedure as
 *   SEAP writes it (null on a DA), the size range of the whole purchase
 *   (ASK_MIX_SIZE_BOUNDS on coalesce(contract_value_full, closing_value), a
 *   DA's own value) and the number of offers (is_single_bidder, null when
 *   unknown and on a DA). Live, the national composition read every DA (2.2 s,
 *   3.4 s with the contracts). Both read the union once more (one statement
 *   each); see buildAskMixRollups.
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
export const ASK_ROLLUP_TABLES = ['agg_entity_year', 'agg_pair_year', 'agg_cpv_year', 'agg_entity_month', 'agg_county_month', 'agg_months', 'agg_national_mix'] as const;
export type AskRollupTable = (typeof ASK_ROLLUP_TABLES)[number];
/** The F3 rollups (plan §4.1, §4.3): built by buildAskMixRollups, probed apart by the web (mixRollupReady). */
export const ASK_MIX_TABLES = ['agg_months', 'agg_national_mix'] as const satisfies readonly AskRollupTable[];

/** The DA ceiling written (as a literal, like the agg_* builds) into the three
 * statements below; equal to DA_PLAFOND_RON in apps/web/lib/ask/compile.ts,
 * which the parity test checks. */
export const ASK_ROLLUP_DA_CEILING = 2_000_000;

/**
 * The lower bounds of the size ranges after the first (lei, [min, max)):
 * range 0 is under 10.000 lei, range 3 from 1 mil. lei. Equal to the bounds of
 * VALUE_RANGES in apps/web/lib/ask/purchase.ts (the web's test checks it).
 */
export const ASK_MIX_SIZE_BOUNDS = [10_000, 100_000, 1_000_000] as const;

export interface AskRollupsReport {
  /** Rows written per rollup. */
  rows: Record<AskRollupTable, number>;
}

/** Build the three rollups from the loaded transaction marts. Call inside the
 * build transaction, after da_transactions is final (da_split stamped). */
export async function buildAskRollups(q: Query): Promise<AskRollupsReport> {
  await q`drop table if exists marts.agg_entity_year, marts.agg_pair_year, marts.agg_cpv_year, marts.agg_entity_month, marts.agg_county_month, marts.agg_months, marts.agg_national_mix`;
  // One pass over the union at the month grain (9,965,281 groups on the local copy of
  // 25 October 2026, 21 s; 26 s plain and 32 s with d0/d1 measured side by side at load 7);
  // the yearly pairs and both entity rollups are grouped from it.
  await q`drop table if exists pg_temp.ask_pair_month`;
  await q`
    create temp table ask_pair_month on commit drop as
    select x.authority_id, x.supplier_id, substr(x.finalization_date, 1, 4) y, substr(x.finalization_date, 6, 2) m, x.src, x.county,
           sum(x.closing_value) v, count(*) n,
           min(left(x.finalization_date, 10) collate "C") d0, max(left(x.finalization_date, 10) collate "C") d1
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
    select authority_id, supplier_id, y, src, county, sum(v) v, sum(n)::bigint n, min(d0) d0, max(d1) d1
    from pg_temp.ask_pair_month
    group by authority_id, supplier_id, y, src, county
  `;
  // Each pair row once as its authority and once as its supplier: the same groups,
  // names and types as grouping the union (6,574,205 months, then 1,907,017 years,
  // sum(n) 41,437,684 on the local copy), without another pass over the 20.7M rows.
  const month = await q`
    create table marts.agg_entity_month as
    select g.role, g.eid, g.y, g.m, g.src, g.county, e.name_display nm, g.v, g.n, g.d0, g.d1
    from (
      select r.role, r.eid, p.y, p.m, p.src, p.county, sum(p.v) v, sum(p.n)::bigint n, min(p.d0) d0, max(p.d1) d1
      from pg_temp.ask_pair_month p
      cross join lateral (values ('authority'::text, p.authority_id), ('supplier'::text, p.supplier_id)) r(role, eid)
      where r.eid is not null
      group by r.role, r.eid, p.y, p.m, p.src, p.county
    ) g
    left join core.entities e on e.id = g.eid
  `;
  const entity = await q`
    create table marts.agg_entity_year as
    select role, eid, y, src, county, nm, sum(v) v, sum(n)::bigint n, min(d0) d0, max(d1) d1
    from marts.agg_entity_month
    group by role, eid, y, src, county, nm
  `;
  // From the authorities' months, which parallel workers can scan (the temporary pair months are
  // read by one process: 15–17 s, against 2.8 s), and the rows without an authority, which no
  // entity month holds: the same sums, counts and days as grouping every pair month.
  const county = await q`
    create table marts.agg_county_month as
    select src, y, m, county, sum(v) v, sum(n)::bigint n, min(d0) d0, max(d1) d1
    from (
      select src, y, m, county, v, n, d0, d1 from marts.agg_entity_month where role = 'authority'
      union all
      select src, y, m, county, v, n, d0, d1 from pg_temp.ask_pair_month where authority_id is null
    ) x
    group by src, y, m, county
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
  await q`analyze marts.agg_county_month`;
  const mix = await buildAskMixRollups(q);
  return { rows: { agg_entity_year: entity.count, agg_pair_year: pair.count, agg_cpv_year: cpv.count, agg_entity_month: month.count, agg_county_month: county.count, ...mix } };
}

/**
 * The F3 rollups, agg_months and agg_national_mix (see the header), from the
 * loaded transaction marts, with the population of every Ask aggregate. Part of
 * buildAskRollups; callable alone on marts that are not being rebuilt (a
 * first build of these two). Each one statement over the union.
 */
export async function buildAskMixRollups(q: Query): Promise<Record<(typeof ASK_MIX_TABLES)[number], number>> {
  await q`drop table if exists marts.agg_months, marts.agg_national_mix`;
  const months = await q`
    create table marts.agg_months as
    select x.src, substr(x.finalization_date, 1, 4) y, substr(x.finalization_date, 6, 2) m, x.county, substr(x.cpv_code, 1, 2) cpv2,
           sum(x.closing_value) v, count(*) n, max(x.closing_value) mx
    from (
      select county, cpv_code, finalization_date, closing_value, 'da'::text src
      from marts.da_transactions where closing_value > 0 and closing_value <= 2000000
      union all
      select county, cpv_code, finalization_date, closing_value, 'contracts'
      from marts.contract_transactions where closing_value > 0
    ) x
    group by 1, 2, 3, 4, 5
  `;
  const [b0, b1, b2] = ASK_MIX_SIZE_BOUNDS;
  // The size of the whole purchase: a contract's whole value (never null in the mart), a DA's own.
  const mix = await q`
    create table marts.agg_national_mix as
    select x.src, substr(x.finalization_date, 1, 4) y, x.county, substr(x.cpv_code, 1, 2) cpv2, x.procedure_type,
           (case when x.full_value < ${b0}::numeric then 0 when x.full_value < ${b1}::numeric then 1 when x.full_value < ${b2}::numeric then 2 else 3 end)::smallint size,
           x.offers, sum(x.closing_value) v, count(*) n
    from (
      select county, cpv_code, finalization_date, closing_value, 'da'::text src, null::text procedure_type, closing_value full_value, null::boolean offers
      from marts.da_transactions where closing_value > 0 and closing_value <= 2000000
      union all
      select county, cpv_code, finalization_date, closing_value, 'contracts', procedure_type, coalesce(contract_value_full, closing_value), is_single_bidder
      from marts.contract_transactions where closing_value > 0
    ) x
    group by 1, 2, 3, 4, 5, 6, 7
  `;
  await q`analyze marts.agg_months`;
  await q`analyze marts.agg_national_mix`;
  return { agg_months: months.count, agg_national_mix: mix.count };
}
