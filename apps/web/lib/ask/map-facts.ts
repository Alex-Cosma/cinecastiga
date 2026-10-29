import type { DbSql } from "@seap/db";
import { txAggFragment } from "./compile";
import { andAll, fullValueUnion, groupPredicates, rowPredicates, seatOf, type PredicateCtx } from "./predicates";
import { COUNTY_POPULATION, type PerCapitaPopulations } from "./per-capita";
import { LOCAL_ADMIN_KIND, type Dataset } from "./spec";

/*
 * The map's county facts (F5, plan §4.4, map final §3.7–§3.11): beside each
 * county's value and records, the split of both by the seat of the winning
 * firm against the county („Firme din județ”), the largest buyer with its
 * share („Cel mai mare cumpărător”, with „Scoate din calcul”), the number of
 * buyers, the largest record („Cea mai mare înregistrare”) and, beside a firm
 * or a person, the same selection without them („Cota firmei”). Asked once
 * the map is drawn (POST /api/ask/facets, part `map`), so they never delay it;
 * every lens then switches on them with no request.
 *
 * One grouping of the selection by county, buyer, seat class and channel,
 * from agg_map_year where it answers (a year, a channel, a purchase kind, a
 * kind of institution, the local administrations, institutions left out),
 * else live on the answer's own records with the firm's profile; the
 * county's facts are assembled from it in the same statement (≤ 43 rows), so
 * the rollup and the live query give the same figures (map-facts.integration
 * test). The map of „Primăriile și consiliile județene” groups by the county
 * each one administers (per-capita.ts: CJ Ilfov at Ilfov).
 */

type Fragment = ReturnType<DbSql>;

/** The seat classes of a row (packages/db firm-seat.ts), as agg_map_year stores them: bucuresti is the part of other in București. */
export const MAP_SEATS = ["same", "other", "bucuresti", "foreign", "unknown"] as const;
export type MapSeat = (typeof MAP_SEATS)[number];

export interface MapCountyFacts {
  /** The county's value and records in the facts' own grouping (= the answer's). */
  value: number;
  count: number;
  /**
   * By the seat of the firm against the county: same + other + foreign + unknown = the county; bucuresti is the part
   * of other whose firm sits in București (map final §3.9). Absent before the seat column is filled.
   */
  seat?: Record<MapSeat, { value: number; count: number }>;
  /** The largest buyer (ties: the lower id), with its value and records in the county; null when no record has a buyer. */
  buyer: { id: string; name: string; value: number; count: number } | null;
  /** How many institutions bought in the county. */
  buyers: number;
  /** The largest record of the county (ties: a contract before a DA, then the lower buyer id); its sources open on it. */
  record: { value: number; src: "da" | "contracts" } | null;
  /** „Cota firmei”: the county's value and records of the same selection without the firm or the person's firms. */
  base?: { value: number; count: number };
}

export interface MapFacts {
  part: "map";
  /** By county (the marts' spelling, as the answer's rows). */
  counties: Record<string, MapCountyFacts>;
  /** The seat split is of the seat column (ONRC, then SEAP); false before it is filled: „Firme din județ” waits. */
  seat: boolean;
  /** „Cota firmei” is computed (a firm or a person's firms on the question). */
  share: boolean;
  checkpoint: string | null;
  tookMs: number;
}

/** What agg_map_year answers (see the header): the rest of the selection reads the records live. */
export interface MapRollupFilters {
  dataset: Dataset;
  yearFrom: number | null;
  yearTo: number | null;
  county: string | null;
  purchaseKind: PredicateCtx["purchaseKind"];
  kindIds: readonly string[] | null;
  excludeAuthorities: readonly string[];
}

/**
 * The conditions of `ctx` on agg_map_year's columns, or null where a condition is not one of them (a domain term,
 * months, a procedure, a size, an entity, a firm's attribute, a threshold, a precise selection other than leaving
 * institutions out…). Fails closed: a condition it does not name keeps the live query.
 */
export function mapRollupFilters(ctx: PredicateCtx, dataset: Dataset): MapRollupFilters | null {
  if (ctx.comparison || ctx.shared || ctx.minimumRecords || ctx.cpvPrefixes.length || ctx.cpvExclude.length) return null;
  if (ctx.monthFrom !== null || ctx.monthTo !== null || ctx.trendMonths || ctx.seriesMonths || ctx.singleBidder || ctx.procedure) return null;
  if (ctx.purchaseValueMin !== null || ctx.purchaseValueMax !== null) return null;
  if (ctx.authorityId || ctx.supplierId || ctx.uatSiruta !== null || ctx.uatAuthorityIds.length || ctx.adminSupplierIds) return null;
  if (ctx.minEmployees !== null || ctx.maxEmployees !== null || ctx.firmSeat || ctx.seatCounty || ctx.newFirms || ctx.mainClient || ctx.dominantSupplier || ctx.winners) return null;
  if (ctx.kind && !ctx.kindIds) return null;
  const excluded = authorityExclusions(ctx.population);
  if (!excluded) return null;
  return {
    dataset, yearFrom: ctx.yearFrom, yearTo: ctx.yearTo, county: ctx.county, purchaseKind: ctx.purchaseKind,
    kindIds: ctx.kind ? ctx.kindIds : null, excludeAuthorities: excluded,
  };
}

/** The institutions a population leaves out, when that is all it does („Scoate din calcul”, F4); else null. */
function authorityExclusions(population: PredicateCtx["population"]): string[] | null {
  if (!population) return [];
  if (population.operator !== "and" && population.groups.length > 1) return null;
  const out: string[] = [];
  for (const group of population.groups) {
    if (group.operator !== "and" && group.conditions.length > 1) return null;
    for (const c of group.conditions) {
      if (c.field !== "authority" || c.op !== "not_in") return null;
      out.push(...c.values);
    }
  }
  return out;
}

/** A row's seat class from the firm's profile `ep` against the county `county` (as buildAskMapRollup writes it). */
export function seatClassSql(sql: DbSql, filled: boolean, county: Fragment): Fragment {
  if (!filled) return sql`'unknown'::text`;
  const s = seatOf(sql, true);
  return sql`(case when ${s.foreign} then 'foreign' when ${s.county} is null then 'unknown' when ${s.county} = ${county} then 'same'
    when ${s.county} = 'Bucuresti' then 'bucuresti' else 'other' end)`;
}

/** The map's own county of each local administration (per-capita.ts `counties`), as a relation to join on. */
const administered = (sql: DbSql, p: Pick<PerCapitaPopulations, "ids" | "counties">): Fragment =>
  sql`unnest(${sql.array(p.ids)}::bigint[], ${sql.array(p.counties)}::text[]) la(id, county)`;

/**
 * The selection's rows (c, a, s, src, v, n, mx: county, buyer, seat class, channel, value, records, largest record).
 * From agg_map_year with `rolled`, its own rows, which the statement groups twice (a parallel scan of 78 MB each;
 * one grouping of every class held 73k groups in a sort: 0.6 s more nationally); else the live records grouped once,
 * read again from that grouping (`grouped`). `local`: the map of the local administrations, by the county each
 * administers.
 */
export function mapRows(sql: DbSql, o: {
  ctx: PredicateCtx; dataset: Dataset; rolled: MapRollupFilters | null; seat: boolean; local: Pick<PerCapitaPopulations, "ids" | "counties"> | null;
}): { rows: Fragment; grouped: boolean } {
  const { ctx, dataset, rolled, local } = o;
  if (rolled) {
    const parts: Fragment[] = [];
    if (rolled.dataset !== "all") parts.push(sql`p.src = ${rolled.dataset}`);
    if (rolled.yearFrom !== null) parts.push(sql`p.y >= ${String(rolled.yearFrom)}`);
    if (rolled.yearTo !== null) parts.push(sql`p.y <= ${String(rolled.yearTo)}`);
    if (rolled.county) parts.push(sql`p.county = ${rolled.county}`);
    if (rolled.purchaseKind) parts.push(sql`p.kind = ${rolled.purchaseKind}`);
    if (rolled.kindIds && !local) parts.push(sql`p.authority_id = any(${sql.array([...rolled.kindIds])}::bigint[])`);
    if (rolled.excludeAuthorities.length) parts.push(sql`not coalesce(p.authority_id = any(${sql.array([...rolled.excludeAuthorities])}::bigint[]), false)`);
    const where = parts.length ? andAll(sql, parts) : sql`true`;
    // Before the seat column, a row's class is unknown, as live (seatClassSql).
    const seat = o.seat ? sql`p.seat` : sql`'unknown'::text`;
    return {
      rows: local
        ? sql`select la.county c, p.authority_id a, ${seat} s, p.src, p.v, p.n, p.mx
            from marts.agg_map_year p join ${administered(sql, local)} on la.id = p.authority_id where ${where}`
        : sql`select p.county c, p.authority_id a, ${seat} s, p.src, p.v, p.n, p.mx from marts.agg_map_year p where ${where}`,
      grouped: false,
    };
  }
  const source = txAggFragment(sql, dataset, false, fullValueUnion(ctx)) as unknown as Fragment;
  const base = andAll(sql, rowPredicates(ctx));
  const where = andAll(sql, [base, ...groupPredicates(ctx, source, base)]);
  const src: Fragment = dataset === "all" ? sql`d.src` : sql`${dataset}::text`;
  const county: Fragment = local ? sql`la.county` : sql`d.county`;
  const join: Fragment = local ? sql`join ${administered(sql, local)} on la.id = d.authority_id` : sql``;
  return {
    rows: sql`
      select ${county} c, d.authority_id a, ${seatClassSql(sql, o.seat, sql`d.county`)} s, ${src} src,
             sum(d.closing_value) v, count(*) n, max(d.closing_value) mx
      from ${source} d ${join}
      left join marts.entity_profile ep on ep.entity_id = d.supplier_id and ep.role = 'supplier'
      where ${where}
      group by 1, 2, 3, 4`,
    grouped: true,
  };
}

/** A county's row of the facts' statement. */
export interface MapFactsRow {
  c: string; v: string; n: string;
  v_same: string; n_same: string; v_other: string; n_other: string; v_bucuresti: string; n_bucuresti: string;
  v_foreign: string; n_foreign: string; v_unknown: string; n_unknown: string;
  buyer_id: string | null; buyer_name: string | null; buyer_v: string | null; buyer_n: string | null; buyers: string;
  record_v: string | null; record_src: "da" | "contracts" | null;
}

/**
 * The county facts of a selection's rows (mapRows), one row per county with records: the totals and the seat split,
 * the largest buyer (ties: the lower id) and the number of buyers, the largest record (ties: a contract before a DA,
 * then the lower buyer). Two groupings: by county and seat class, by county, buyer and channel. The buyer's name is
 * core.entities.name_display, the name the transaction rows carry.
 */
export function mapFactsSql(sql: DbSql, source: { rows: Fragment; grouped: boolean }): Fragment {
  const part = (seat: MapSeat) => sql`coalesce(sum(t.v) filter (where t.s = ${seat}), 0)::text ${sql(`v_${seat}`)},
    coalesce(sum(t.n) filter (where t.s = ${seat}), 0)::bigint::text ${sql(`n_${seat}`)}`;
  // Live, the records are grouped once (materialized) and both groupings read it; the rollup's rows are read twice.
  const head = source.grouped ? sql`with g as materialized (${source.rows}),` : sql`with`;
  const rows = (alias: string): Fragment => source.grouped ? sql`g ${sql(alias)}` : sql`(${source.rows}) ${sql(alias)}`;
  return sql`
    ${head}
    seat as (select r.c, r.s, sum(r.v) v, sum(r.n) n from ${rows("r")} where r.c is not null group by r.c, r.s),
    ca as materialized (
      select r.c, r.a, r.src, sum(r.v) v, sum(r.n) n, max(r.mx) mx from ${rows("r")} where r.c is not null group by r.c, r.a, r.src
    ),
    county as (
      select t.c, sum(t.v)::text v, sum(t.n)::bigint::text n, ${part("same")}, ${part("other")}, ${part("bucuresti")}, ${part("foreign")}, ${part("unknown")}
      from seat t group by t.c
    ),
    buyers as (select ca.c, count(distinct ca.a)::text buyers from ca group by ca.c),
    buyer as (
      select distinct on (b.c) b.c, b.a, b.v, b.n
      from (select ca.c, ca.a, sum(ca.v) v, sum(ca.n) n from ca where ca.a is not null group by ca.c, ca.a) b
      order by b.c, b.v desc, b.a
    ),
    record as (
      select distinct on (ca.c) ca.c, ca.src, ca.mx from ca where ca.mx is not null
      order by ca.c, ca.mx desc, ca.src, ca.a nulls last
    )
    select county.*, coalesce(k.buyers, '0') buyers, b.a::text buyer_id, e.name_display buyer_name, b.v::text buyer_v, b.n::bigint::text buyer_n,
           r.mx::text record_v, r.src record_src
    from county
    left join buyers k on k.c = county.c
    left join buyer b on b.c = county.c
    left join core.entities e on e.id = b.a
    left join record r on r.c = county.c
  `;
}

/** The county facts from the statement's rows; `seat`: the seat column is filled. */
export function assembleMapFacts(rows: readonly MapFactsRow[], seat: boolean): Record<string, MapCountyFacts> {
  const out: Record<string, MapCountyFacts> = {};
  for (const r of rows) {
    const pair = (s: MapSeat) => ({ value: Number(r[`v_${s}`]), count: Number(r[`n_${s}`]) });
    // other holds bucuresti (map final §3.9 „din care din București”): the classes are exclusive in the rows.
    const other = { value: pair("other").value + pair("bucuresti").value, count: pair("other").count + pair("bucuresti").count };
    out[r.c] = {
      value: Number(r.v), count: Number(r.n),
      ...(seat ? { seat: { same: pair("same"), other, bucuresti: pair("bucuresti"), foreign: pair("foreign"), unknown: pair("unknown") } } : {}),
      buyer: r.buyer_id ? { id: r.buyer_id, name: r.buyer_name ?? `Instituția #${r.buyer_id}`, value: Number(r.buyer_v), count: Number(r.buyer_n) } : null,
      buyers: Number(r.buyers),
      record: r.record_v !== null && r.record_src ? { value: Number(r.record_v), src: r.record_src } : null,
    };
  }
  return out;
}

/** The map of the local administrations (map final §3.3): grouped by the county each administers. */
export const localAdminMap = (ctx: Pick<PredicateCtx, "kind">): boolean => ctx.kind === LOCAL_ADMIN_KIND;

/**
 * agg_map_year present and of the rows the other rollups hold. Built inside buildAskRollups, it can still be the
 * table of an older build where a build of the code before F5 (a revert) rebuilt the others and left it behind: its
 * records must be agg_cpv_year's (the sum of n, 20.7M on the local copy; 0.2–0.3 s, once per 10 minutes in the
 * process). Until then the facts read the records live. Call it with the pool, before the transaction.
 */
let mapReady: { ok: boolean; at: number } | null = null;
export async function mapRollupReady(sql: DbSql): Promise<boolean> {
  if (mapReady && Date.now() - mapReady.at < 600_000) return mapReady.ok;
  const [present] = (await sql`select to_regclass('marts.agg_map_year') is not null and to_regclass('marts.agg_cpv_year') is not null ok`) as unknown as { ok: boolean }[];
  const [same] = present?.ok
    ? (await sql`select (select sum(n) from marts.agg_map_year) = (select sum(n) from marts.agg_cpv_year) ok`) as unknown as { ok: boolean | null }[]
    : [];
  mapReady = { ok: Boolean(same?.ok), at: Date.now() };
  return mapReady.ok;
}
/** Tests: probe again. */
export function forgetMapRollup(): void { mapReady = null; }

/**
 * The map of „Primăriile și consiliile județene” (map final §3.3, §3.8), beside its counties: each county's resident
 * population (INS RPL 2021, per-capita.ts COUNTY_POPULATION), the counties whose county council the strict list does
 * not hold yet (no per-inhabitant figure there: their value lacks the council's), and the list's size.
 */
export interface MapLocal {
  population: Record<string, number>;
  /** The counties (marts spelling) without their county council in the list; București has none to hold. */
  missing: string[];
  towns: number;
  sectors: number;
  councils: number;
}

/** The local map's facts from the strict list. */
export function mapLocal(p: Pick<PerCapitaPopulations, "councils" | "local" | "sector" | "county">): MapLocal {
  return {
    population: Object.fromEntries(COUNTY_POPULATION),
    missing: [...COUNTY_POPULATION.keys()].filter((county) => county !== "Bucuresti" && !p.councils.has(county)).sort(),
    towns: p.local, sectors: p.sector, councils: p.county,
  };
}

/**
 * The local map's counties (case "map" of runSpec): the strict list's records by the county each administers, from
 * agg_map_year where it answers, else live on the list's ids. No record is without a county there.
 */
export function localMapSql(sql: DbSql, o: { ctx: PredicateCtx; dataset: Dataset; rolled: MapRollupFilters | null; local: Pick<PerCapitaPopulations, "ids" | "counties"> }): Fragment {
  const rows = mapRows(sql, { ...o, seat: false });
  return sql`select x.c, coalesce(sum(x.v), 0) v, sum(x.n) n from (${rows.rows}) x group by 1 order by v desc limit 200`;
}

/**
 * The records a national domain reads at most for its county facts to stay in the bar on the code indexes: medicines
 * 2024–2025 (396k records) took 1.4–2.0 s at load 10 and over the 8 s limit at load 15–25 on the local copy (S5
 * F5-map), so a domain that large waits for a rollup (PRECOMPUTE.md); a fifth of it reads in well under a second.
 */
export const MAP_DOMAIN_ROWS = 150_000;

/**
 * Whether a national selection's facts can be read live on the CPV code index: a domain (a term's prefixes), whose
 * records in agg_cpv_year (its years and channel, before the selection's other conditions: an upper bound) are at
 * most MAP_DOMAIN_ROWS. Without a domain (months, a size alone) or above it: no (PRECOMPUTE.md).
 */
export async function domainOnIndex(sql: DbSql, ctx: PredicateCtx, dataset: Dataset): Promise<boolean> {
  if (!ctx.cpvPrefixes.length) return false;
  const parts: Fragment[] = [sql`(${ctx.cpvPrefixes.map((x) => sql`p.cpv_code like ${x + "%"}`).reduce((a, b) => sql`${a} or ${b}`)})`];
  if (ctx.cpvExclude.length) parts.push(sql`not (${ctx.cpvExclude.map((x) => sql`p.cpv_code like ${x + "%"}`).reduce((a, b) => sql`${a} or ${b}`)})`);
  if (dataset !== "all") parts.push(sql`p.src = ${dataset}`);
  if (ctx.yearFrom !== null) parts.push(sql`p.y >= ${String(ctx.yearFrom)}`);
  if (ctx.yearTo !== null) parts.push(sql`p.y <= ${String(ctx.yearTo)}`);
  const [row] = (await sql`select coalesce(sum(p.n), 0)::bigint::text n from marts.agg_cpv_year p where ${andAll(sql, parts)}`) as unknown as { n: string }[];
  return Number(row?.n ?? 0) <= MAP_DOMAIN_ROWS;
}
