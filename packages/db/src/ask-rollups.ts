import type { DbSql } from "./client.js";
import { SEAT_BUCURESTI } from "./firm-seat.js";

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
 * - agg_map_year (src, y, county, authority_id, seat, kind): the map's county
 *   facts (plan §4.4, F5; map final §3.7–§3.11): every row by its buyer and
 *   buyer county, the seat of its firm against that county and the purchase
 *   kind of its code, with the largest record (mx). seat is one class per row:
 *   same, other, bucuresti (another county, and the firm sits in București:
 *   the final's „din care din București”, so other + bucuresti is „Firme din
 *   alte județe”), foreign, unknown (no firm, no profile or no seat), the
 *   classes of agg_map_county (firm-seat.ts); kind is lucrari, servicii or
 *   produse by the division (purchaseKindCond of the web), null without a
 *   code. The lens „Firme din județ”, the county card's largest buyer and
 *   record and the per-inhabitant map of the local administrations
 *   (local_admin, a list of authority ids) of a year, a channel, a kind, a kind
 *   of institution or with institutions left out read it (national map facts
 *   of 2025, live: 3.4–4.2 s). Needs the seats the marts stage writes on
 *   entity_profile. See buildAskMapRollup.
 * - agg_da_year_keys (y, k0, k1, n, odd_codes): the first and last key
 *   (sicap_da_id) of the direct acquisitions of each year, over every row of
 *   da_transactions (the analysis population is inside them), their number,
 *   and how many of their codes are not SEAP's form, "DA" and digits (0 on the
 *   local copy of 30 October 2026: a drawer's search reads a word as part of a
 *   DA code only in that form while it stays 0, apps/web/lib/ask/source-search.ts). The source
 *   page of a trend's „Toate” (plan F2; PRECOMPUTE, S5 PRE-trend) walks the
 *   primary key from the last key of its years instead of reading the whole
 *   covering index of the two years (4.6M entries, 2.5–3.2 s); bounded by
 *   k0..k1 the walk is exact (no record of those years lies outside). Its
 *   endpoints are those of the table, which the web checks before using it
 *   (a stale table would hide records). See buildAskYearKeys.
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
export const ASK_ROLLUP_TABLES = ['agg_entity_year', 'agg_pair_year', 'agg_cpv_year', 'agg_entity_month', 'agg_county_month', 'agg_months', 'agg_national_mix', 'agg_map_year', 'agg_da_year_keys'] as const;
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
  /** How long agg_map_year took (F5): the nightly cost of the map's county facts. */
  mapYearMs: number;
  /** How long agg_da_year_keys took (S5 PRE-trend): the nightly cost of the bounded „Toate” page. */
  yearKeysMs: number;
}

/** Build the three rollups from the loaded transaction marts. Call inside the
 * build transaction, after da_transactions is final (da_split stamped). */
export async function buildAskRollups(q: Query): Promise<AskRollupsReport> {
  await q`drop table if exists marts.agg_entity_year, marts.agg_pair_year, marts.agg_cpv_year, marts.agg_entity_month, marts.agg_county_month, marts.agg_months, marts.agg_national_mix, marts.agg_map_year, marts.agg_da_year_keys`;
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
  const started = Date.now();
  const map = await buildAskMapRollup(q);
  const mapYearMs = Date.now() - started;
  const keysStarted = Date.now();
  const keys = await buildAskYearKeys(q);
  return {
    rows: { agg_entity_year: entity.count, agg_pair_year: pair.count, agg_cpv_year: cpv.count, agg_entity_month: month.count, agg_county_month: county.count, ...mix, agg_map_year: map, agg_da_year_keys: keys },
    mapYearMs, yearKeysMs: Date.now() - keysStarted,
  };
}

/**
 * agg_da_year_keys (see the header): one row per year of da_transactions (and
 * one for the undated), from every row, so min(k0) and max(k1) are the
 * table's own first and last key. Part of buildAskRollups, in the transaction
 * that loads da_transactions; callable alone on marts that are not being
 * rebuilt (its first build).
 */
export async function buildAskYearKeys(q: Query): Promise<number> {
  await q`drop table if exists marts.agg_da_year_keys`;
  const created = await q`
    create table marts.agg_da_year_keys as
    select substr(finalization_date, 1, 4) y, min(sicap_da_id) k0, max(sicap_da_id) k1, count(*)::bigint n,
           count(*) filter (where da_code is null or da_code !~ '^DA[0-9]+$')::bigint odd_codes
    from marts.da_transactions
    group by 1
  `;
  return created.count;
}

/**
 * agg_map_year (see the header), from the loaded transaction marts and the
 * firms' seats on marts.entity_profile (the marts stage writes them before
 * this one), with the population of every Ask aggregate. Part of
 * buildAskRollups, so it is of the same build as the other rollups (the web
 * proves it: the same transaction created both, mapRollupReady); callable
 * alone on marts that are not being rebuilt (its first build). One statement
 * over the union: 817,927 rows from 20.7M on the local copy of 30 October
 * 2026 (18 s read-only, at load 12).
 */
export async function buildAskMapRollup(q: Query): Promise<number> {
  await q`drop table if exists marts.agg_map_year`;
  const created = await q`
    create table marts.agg_map_year as
    select x.src, substr(x.finalization_date, 1, 4) y, x.county, x.authority_id,
           (case when ep.seat_source = 'foreign' then 'foreign'
                 when ep.seat_county is null then 'unknown'
                 when ep.seat_county = x.county then 'same'
                 when ep.seat_county = ${SEAT_BUCURESTI}::text then 'bucuresti'
                 else 'other' end) seat,
           (case when x.cpv_code like '45%' then 'lucrari' when x.cpv_code >= '50' then 'servicii'
                 when x.cpv_code < '45' or (x.cpv_code >= '48' and x.cpv_code < '50') then 'produse' end) kind,
           sum(x.closing_value) v, count(*) n, max(x.closing_value) mx
    from (
      select authority_id, supplier_id, county, cpv_code, finalization_date, closing_value, 'da'::text src
      from marts.da_transactions where closing_value > 0 and closing_value <= 2000000
      union all
      select authority_id, supplier_id, county, cpv_code, finalization_date, closing_value, 'contracts'
      from marts.contract_transactions where closing_value > 0
    ) x
    left join marts.entity_profile ep on ep.entity_id = x.supplier_id and ep.role = 'supplier'
    group by 1, 2, 3, 4, 5, 6
  `;
  await q`analyze marts.agg_map_year`;
  return created.count;
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
