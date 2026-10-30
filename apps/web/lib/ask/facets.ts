import type { DbSql } from "@seap/db";
import { FORCE_CUSTOM_PLANS } from "../plan-cache";
import { canonicalAskIdentities } from "./canonical-identities";
import { namedKind, NEWER_VERSION_LINK, unimplementedSpecKeys, AUTHORITY_KINDS, type AskSpec, type NewScope } from "./spec";
import { ground, type Grounding } from "./ground";
import {
  andAll, asksWinners, employeesBounds, fold, fullValueUnion, groupPredicates, newFirmCond, ownCountySql, predicateContext, profileMinDas, profilePredicates, rowPredicates, seatOf, trendYearsPredicate,
  type PredicateCtx,
} from "./predicates";
import { authorityKindExpression, authorityKindIds, readAuthorityKinds } from "./authority-kind";
import { coveragePeriods, daCoverageYears, REGISTERED_YEAR_MISSING, txAggFragment, uatUnmappedError } from "./compile";
import { buyerRowsSql, dominantIdsSql, rankedFacts, RELATION_MIN_RECORDS, RELATION_SHARE, resolveWinners } from "./winners";
import { partialMonths, sameMonthsWindow, WHOLE_YEAR, type MonthsWindow } from "./months-window";
import { isHistoricalProfile, unsupportedPopulationView } from "./population";
import { retarget } from "./filters/retarget";
import { cpvCoverReady, kindRollupReady, monthRollupReady, planRollup, rollupRows, rollupsReady, type RollupNeed } from "./rollups";
import { DOMAIN_GROUP_ROWS, domainOnIndex } from "./map-facts";
import { mixRollupReady, mixWhere } from "./series-rollups";
import { countyDisplay } from "./resolved-spec";
import { martColumns } from "./mart-columns";
import { trendCacheStamp } from "./group-ids";
import { PROCEDURE_ORDER, PROCEDURE_TYPES, PURCHASE_KIND_ORDER, VALUE_RANGES } from "./purchase";
import { retiredChoicesText } from "./retired-terms";
import { questionKey, type QuestionSpec } from "./question-ui";
import {
  ABROAD, countyOfFolded, EMPLOYEE_BAND_BOUNDS, FACET_REST, facetSpec, isFacetPart, LOCATE_MATCHES, relativeSeat, ROWS_MAX, SEAT_UNCOMPARED, winnerOption,
  type CountPart, type FacetCount, type FacetCounts, type FacetPart, type FacetUnit, type LocateMatch, type LocateResult, type RowsResult,
} from "./facet-parts";
import { newScopesOf, newYearsOf } from "./filters/defs/winners";
import { formOf } from "./filters/context";
import type { FilterSpec } from "./filters/types";

/*
 * The counts of the builder's windows and "Unde e …?" (plan §2.5
 * "Fațetele", kit R5 and component 20), behind POST /api/ask/facets. A part
 * counts the options of one window on the draft without the window's own key
 * (facet-parts.ts facetSpec): the same conditions as the answer
 * (predicates.ts, rollups.ts), so the number beside an option is the answer
 * after choosing it.
 *
 * Kept apart from the answers: the route reads them on its own small pool
 * (three connections), at most three at a time in the process, each in a
 * read-only transaction with an 8 s limit, and drops a request whose window
 * closed (the client aborts; a running query is cancelled). Counts are kept
 * for 10 minutes on the draft, the part, the data checkpoint and the marts
 * build (the file nodes of the transaction marts and of entity_profile,
 * group-ids.ts trendCacheStamp): a rebuild never serves the counts of the
 * previous data, whatever the order the checkpoint is published in.
 *
 * Every part reads the nightly rollups when the planner can answer exactly
 * (rollups.ts planRollup), else the live slim union. The kinds of institution
 * are counted per institution (grouped on its id, then classified with the
 * lists of authority-kind.ts), never per record. "Unde e …?" ranks the
 * answer's own grouping once and keeps the rank vector (ids, values, places)
 * without the text searched, so typing matches names against it without
 * grouping again; the national ranking over every year ranks straight from
 * entity_profile (total_ron_split: the rollups' sums, 0 differences on every
 * institution and firm, 26 Oct 2026).
 */

type Fragment = ReturnType<DbSql>;
type Role = "authority" | "supplier";
type Dataset = "all" | "da" | "contracts";

/** The limit of one part's statements (plan §2.5): the window shows its options without numbers past it. */
export const FACET_TIMEOUT = "8s";
/** Parts read at the same time in a process (plan §2.5: "semafor global, 3 în paralel"); the pool has as many connections. */
export const FACET_SLOTS = 3;
export const FACET_TTL_MS = 600_000;
/** Counts kept at most (a window's options are a few dozen numbers). */
export const FACET_ENTRIES = 500;
/** Ids held by the rank vectors at most (typed arrays): about six national firm rankings. */
export const LOCATE_ID_LIMIT = 1_000_000;

export type FacetFailure = { error: string } | { timeout: true } | { precompute: string };
/** Why a comparison's windows have no numbers with „Doar clienții comuni” (facetCounts). */
export const SHARED_PARTNERS_COUNTS = "Cu „Doar clienții comuni”, clienții comuni se schimbă cu fiecare alegere: ferestrele nu au numere.";

/** What a part needs of the question once grounded (runRows' checks, without its notes). */
export interface Prepared {
  spec: AskSpec;
  ctx: PredicateCtx;
  dataset: Dataset;
  profile: boolean;
  /** A trend counts its two years (and their same months), not the period between them. */
  trend: { yearA: number; yearB: number } | null;
}

export async function prepare(sql: DbSql, input: AskSpec, grounding: Grounding): Promise<Prepared | { error: string }> {
  // Read first, write later (plan F0a): a key this release does not apply is refused here too.
  if (unimplementedSpecKeys(input).length) return { error: NEWER_VERSION_LINK };
  const canonical = await canonicalAskIdentities(sql, input, grounding);
  let spec = canonical.spec;
  grounding = canonical.grounding;
  // "Cine conduce?" on value is the ranking's first row (runSpec): its selection is the ranking's.
  if (spec.block === "entity_card" && spec.rankBy === "value") spec = { ...retarget(spec, "table"), measure: "value" };
  const unsupported = unsupportedPopulationView(spec);
  if (unsupported) return { error: unsupported };
  const f = spec.filters;
  if (f.cpvTerm && !grounding.cpv?.prefixes.length) {
    const retired = grounding.cpv?.retired;
    return { error: retired ? `${retired.message} ${retiredChoicesText(retired)}` : `Nu am găsit CPV pentru „${f.cpvTerm}”.` };
  }
  if ((f.authorityName || f.authorityId) && !grounding.authority?.entityId) return { error: `Nu am găsit autoritatea „${f.authorityName ?? f.authorityId}”.` };
  if ((f.supplierName || f.supplierId) && !grounding.supplier?.entityId) return { error: `Nu am găsit firma „${f.supplierName ?? f.supplierId}”.` };
  if (spec.block === "compare" && !grounding.compare?.entityId) return { error: `Nu am găsit a doua entitate din comparație („${f.compareWith}”).` };
  if (f.county && !grounding.county?.canonical) return { error: `Nu recunosc județul „${f.county}”.` };
  if (f.seatCounty && !grounding.seatCounty?.canonical) return { error: `Nu recunosc județul „${f.seatCounty}”.` };
  if ((f.adminPersonKey || f.adminName) && (!grounding.admin?.personKey || grounding.admin.supplierIds.length === 0))
    return { error: "Nu am găsit firmele persoanei în date (filtrul «conduse azi de»)." };
  if (f.uatSiruta && !grounding.uat?.authorityIds?.length) return { error: uatUnmappedError(f.uatName ?? grounding.uat?.name ?? `UAT ${f.uatSiruta}`) };
  const profile = isHistoricalProfile(spec);
  const dataset: Dataset = profile ? "da" : spec.dataset ?? "all";
  // The period clamped to the archive, as the answer clamps it.
  let yearFrom = f.yearFrom ?? null, yearTo = f.yearTo ?? null;
  let maxY = 2026, minY = 2018;
  if (!profile) {
    const covered = dataset === "contracts" ? await daCoverageYears(sql, "award") : dataset === "da" ? await daCoverageYears(sql, "da")
      : [...new Set([...(await daCoverageYears(sql, "da")), ...(await daCoverageYears(sql, "award"))])].sort((a, b) => a - b);
    minY = covered[0] ?? minY;
    maxY = covered.at(-1) ?? maxY;
    if (yearFrom !== null || yearTo !== null) {
      const from = yearFrom ?? minY, to = yearTo ?? maxY;
      if (to < minY || from > maxY) return { error: `Perioada cerută este în afara datelor disponibile (${minY}–${maxY}).` };
      yearFrom = Math.max(from, minY);
      yearTo = Math.min(to, maxY);
    }
  }
  // A trend's months, and an evolution's same months (F3), by the answer's function at this checkpoint (sameMonthsWindow).
  let window: MonthsWindow = WHOLE_YEAR;
  const months = spec.block === "trend" ? spec.trend?.months : spec.block === "timeseries" ? spec.timeseries?.months : undefined;
  if (months !== undefined) {
    const resolved = sameMonthsWindow(await coveragePeriods(sql), dataset, yearTo ?? maxY, months);
    if ("error" in resolved) return { error: resolved.error };
    window = resolved;
  }
  const kindIds = await authorityKindIds(sql, f.authorityKind);
  const columns = await martColumns(sql);
  const ctx = predicateContext(sql, spec, grounding, {
    dataset, yearFrom, yearTo, kindIds, trendMonths: partialMonths(window), seriesMonths: partialMonths(window), seat: columns.seat,
  });
  // F5: „Înmatriculate” waits for the register year; the relations of the ranked winners are lists, read as the answer reads them.
  if (ctx.newFirms?.scope === "registry" && !columns.registeredYear) return { error: REGISTERED_YEAR_MISSING };
  if (!profile && asksWinners(ctx))
    await resolveWinners(sql, ctx, { source: txAggFragment(sql, dataset, false, fullValueUnion(ctx)) as unknown as Fragment, rollups: await rollupsReady(sql) });
  return { spec, ctx, dataset, profile, trend: spec.block === "trend" && !profile ? { yearA: yearFrom ?? minY, yearB: yearTo ?? maxY } : null };
}

/**
 * No condition on the records, over every year: the profiles' sums are the answer's. `firm`: firms are counted, and
 * their own attributes (the employees, F5's year in the archive or the register) are conditions on their profile
 * rows (firmAttrs); elsewhere those select records. A relation of the ranked winners (winners.ts) is a list of ids.
 */
function everyRecord(p: Prepared, firm = false): boolean {
  const w = p.ctx;
  return p.dataset === "all" && !p.trend && !p.spec.population && !p.spec.minimumRecords &&
    (firm || w.minEmployees === null && w.maxEmployees === null && !w.newFirms) && !w.mainClient && !w.dominantSupplier && w.newFirms?.scope !== "buyer" &&
    !w.county && w.cpvPrefixes.length === 0 && w.cpvExclude.length === 0 && !w.kind && !w.authorityId && !w.supplierId &&
    w.uatSiruta === null && !w.singleBidder && w.adminSupplierIds === null && !w.comparison &&
    !w.purchaseKind && !w.procedure && w.purchaseValueMin === null && w.purchaseValueMax === null && !w.firmSeat && !w.seatCounty &&
    w.yearFrom === null && w.yearTo === null && w.monthFrom === null && w.monthTo === null && !w.seriesMonths;
}
/** A firm's own attributes on its profile row `ep` (everyRecord with `firm`): its band, its year in the archive or the register. */
function firmAttrs(sql: DbSql, w: PredicateCtx): Fragment {
  const parts: Fragment[] = [];
  if (w.minEmployees !== null || w.maxEmployees !== null) parts.push(employeesBounds(sql, w.minEmployees, w.maxEmployees));
  if (w.newFirms && w.newFirms.scope !== "buyer") parts.push(newFirmCond(sql, w.newFirms.scope, w.newFirms.since, sql`ep.entity_id`));
  return parts.length ? sql`and ${andAll(sql, parts)}` : sql``;
}

/** The selection's records, from a rollup or live, with the columns a part groups by and the two aggregates. */
interface Rows {
  from: Fragment;
  where: Fragment;
  /** sum of the value, number of records. */
  v: Fragment;
  n: Fragment;
  src: Fragment;
  y: Fragment;
  county: Fragment;
  /** The CPV code (agg_cpv_year, or the records); null on a rollup without it. */
  cpv: Fragment | null;
  id: (role: Role) => Fragment | null;
  /** Read from the transaction marts, not a rollup. */
  live: boolean;
}

/**
 * The rows a part groups: the rollup the planner picks for `need` when the
 * nightly build has the rollups (and `live` is not asked), else the slim union
 * with the answer's conditions (rowPredicates, the record threshold).
 */
async function rowsOf(sql: DbSql, p: Prepared, need: RollupNeed | null, ready: Ready, opts: { full?: boolean } = {}): Promise<Rows> {
  const { ctx, trend } = p;
  // A trend's same months read agg_entity_month / agg_county_month once a build has made them (as its answer).
  const plan = need && ready.rollups ? planRollup(ctx, need, { months: ready.months, kinds: ready.kinds }) : null;
  if (plan && "source" in plan) {
    const r = rollupRows(sql, plan, "p", { years: !trend });
    const where: Fragment = trend ? sql`${r.where} and p.y in (${String(trend.yearA)}, ${String(trend.yearB)})` : r.where;
    return {
      from: r.from, where, v: sql`coalesce(sum(p.v), 0)`, n: sql`coalesce(sum(p.n), 0)`,
      src: sql`p.src`, y: sql`p.y`, county: sql`p.county`, cpv: r.cpv, id: r.id, live: false,
    };
  }
  const full = opts.full === true || fullValueUnion(ctx);
  const source = txAggFragment(sql, p.dataset, false, full) as unknown as Fragment;
  const base = andAll(sql, [...rowPredicates(ctx, { years: !trend }), ...(trend ? [trendYearsPredicate(sql, trend.yearA, trend.yearB, ctx.trendMonths, ctx)] : [])]);
  const where = andAll(sql, [base, ...groupPredicates(ctx, source, base)]);
  return {
    from: sql`${source} d`, where, v: sql`coalesce(sum(d.closing_value), 0)`, n: sql`count(*)`,
    src: p.dataset === "all" ? sql`d.src` : sql`${p.dataset}::text`, y: sql`substr(d.finalization_date, 1, 4)`, county: sql`d.county`,
    cpv: sql`d.cpv_code`, id: (role) => role === "authority" ? sql`d.authority_id` : sql`d.supplier_id`, live: true,
  };
}

/** The rollups the nightly build has made (probed with the pool, before the transaction: rollups.ts, series-rollups.ts). */
export interface Ready { rollups: boolean; months: boolean; mix: boolean; kinds: boolean; cpvCover: boolean }
const NO_ROLLUPS: Ready = { rollups: false, months: false, mix: false, kinds: false, cpvCover: false };
export async function readyOf(sql: DbSql): Promise<Ready> {
  const rollups = await rollupsReady(sql);
  return { rollups, months: rollups && await monthRollupReady(sql), mix: await mixRollupReady(sql), kinds: rollups && await kindRollupReady(sql),
    cpvCover: rollups && await cpvCoverReady(sql) };
}

/**
 * The procedures and the sizes of a selection agg_national_mix holds (series-rollups.ts mixWhere: a county, a kind of
 * purchase, the channel, whole years; no entity, months or size typed in): their counts to the leu without the live
 * pass over the records (S4 review: the national sizes of 2025, 2.76 s live). A trend's two years are not a range.
 */
const mixOf = (sql: DbSql, p: Prepared, ready: Ready): Fragment | null => {
  if (!ready.mix || p.trend || p.profile) return null;
  const mixed = mixWhere(sql, p.ctx, "p");
  return "where" in mixed ? mixed.where : null;
};

/**
 * A selection no index anchors (no named or compared entity, locality,
 * person's firms, county or kind of institution) on the direct acquisitions:
 * grouped live per institution or firm it reads millions of records (a
 * domain nationally, 2025: 3–5 s, S4 F3-facets). Its windows show their
 * options without numbers (PRECOMPUTE.md, ENTITY_LIVE) unless a rollup answers
 * them (a kind or a size: agg_entity_kind_year) or the code's covering index
 * bounds its domain (domainBound, S5 PRE-answers); the contracts alone (1.1M
 * records) stay counted.
 */
export function nationalLive(p: Prepared): boolean {
  const w = p.ctx;
  return p.dataset !== "contracts" && !w.authorityId && !w.supplierId && w.uatSiruta === null && w.adminSupplierIds === null
    && !w.comparison && !w.county && !w.kind;
}
/** The PRECOMPUTE.md entry the national live entity counts wait on. */
export const ENTITY_LIVE = "Numerele ferestrelor pe instituții și firme, cu domeniu, național";
/**
 * A national selection (nationalLive) whose domain the code's covering index bounds (S5 PRE-answers): at most `limit`
 * records of the domain in its years and channel (agg_cpv_year, an upper bound of the selection's; map-facts.ts
 * DOMAIN_GROUP_ROWS, DOMAIN_LIVE_ROWS), once the index is built (`cover`: cpvCoverReady). Its parts are then counted
 * live like an anchored selection's.
 */
export async function domainBound(sql: DbSql, p: Pick<Prepared, "ctx" | "dataset">, cover: boolean, limit: number = DOMAIN_GROUP_ROWS): Promise<boolean> {
  return cover && p.ctx.cpvPrefixes.length > 0 && await domainOnIndex(sql, p.ctx, p.dataset, limit);
}
/** Whether a part of a national selection waits on PRECOMPUTE.md: no index anchors it and no small domain bounds it. */
async function waitsOnRollup(sql: DbSql, p: Prepared, ready: Ready): Promise<boolean> {
  return nationalLive(p) && !(await domainBound(sql, p, ready.cpvCover));
}

/** A grouped row: the group's key (null: no option holds it), the value and the count; `f`, a seat's foreign flag. */
interface Grouped { k: string | null; v: string; n: string; f?: boolean }

/** The purchase kind of a code (purchase.ts divisionKind, predicates.ts purchaseKindCond), null without one. */
export const kindOfCode = (sql: DbSql, c: Fragment): Fragment =>
  sql`(case when ${c} like '45%' then 'lucrari' when ${c} >= '50' then 'servicii' when ${c} < '45' or (${c} >= '48' and ${c} < '50') then 'produse' end)`;

/** A firm's band of employees (kit §4), null without a filing ("Fără bilanț"). */
const bandOf = (sql: DbSql, employees: Fragment): Fragment => {
  const cases = EMPLOYEE_BAND_BOUNDS.map((band) => band.max === null
    ? sql`when ${employees} >= ${band.min} then ${band.value}`
    : sql`when ${employees} between ${band.min} and ${band.max} then ${band.value}`).reduce((a, b) => sql`${a} ${b}`);
  return sql`(case ${cases} end)`;
};

/** A procedure of the window from a SEAP type (purchase.ts PROCEDURE_TYPES; "altele" is the rest, an empty one too). */
export const procedureOf = (sql: DbSql, type: Fragment): Fragment => {
  const named = (["deschisa", "simplificata", "negociere_fara_publicare"] as const)
    .map((procedure) => sql`when ${type} = any(${sql.array([...PROCEDURE_TYPES[procedure]])}::text[]) then ${procedure}`).reduce((a, b) => sql`${a} ${b}`);
  return sql`(case ${named} else 'altele' end)`;
};

/** The size range of a purchase (purchase.ts VALUE_RANGES, [min, max)), its index as text. */
export const sizeOf = (sql: DbSql, value: Fragment): Fragment => {
  const cases = VALUE_RANGES.map((range, i): Fragment | null => range.purchaseValueMax === undefined ? null : sql`when ${value} < ${range.purchaseValueMax}::numeric then ${String(i)}`)
    .filter((c): c is Fragment => c !== null).reduce((a, b) => sql`${a} ${b}`);
  return sql`(case ${cases} else ${String(VALUE_RANGES.length - 1)} end)`;
};

/**
 * Counts of the transaction parts, grouped as each window lists its options. `whole`: the draft's own count where
 * the options overlap (the seat classes of a ranking of firms), which the first row shows instead of their sum.
 */
async function transactionCounts(sql: DbSql, p: Prepared, part: CountPart, ready: Ready, run: Runner, opts: { relative?: boolean } = {}):
  Promise<{ rows: Grouped[]; unit: FacetUnit; whole?: number } | { error: string } | { precompute: string }> {
  // The channel, the county and the years group any rollup's rows (src, y and county are on all of them);
  // asked "by county", the planner also finds agg_county_month for a trend's same months.
  const byCounty: RollupNeed = { by: "county" };
  switch (part) {
    case "channel": {
      // The national draft over every year: the totals of the nightly build (runSpec's `bare`).
      if (everyRecord(p) && p.ctx.minEmployees === null && p.ctx.maxEmployees === null)
        return { unit: "records", rows: await run<Grouped>(sql`select src k, v_plaf::text v, n_plaf::text n from marts.agg_national`) };
      const r = await rowsOf(sql, p, byCounty, ready);
      return { unit: "records", rows: await run<Grouped>(sql`select ${r.src} k, ${r.v} v, ${r.n} n from ${r.from} where ${r.where} group by 1`) };
    }
    case "procedure": {
      // The procedure is a column of the contract records agg_national_mix keeps (the draft counts the contracts).
      const mixed = mixOf(sql, p, ready);
      if (mixed) return { unit: "records", rows: await run<Grouped>(sql`
        select ${procedureOf(sql, sql`p.procedure_type`)} k, coalesce(sum(p.v), 0) v, coalesce(sum(p.n), 0) n from marts.agg_national_mix p where ${mixed} group by 1`) };
      const r = await rowsOf(sql, p, null, NO_ROLLUPS);
      return { unit: "records", rows: await run<Grouped>(sql`select ${procedureOf(sql, sql`d.procedure_type`)} k, ${r.v} v, ${r.n} n from ${r.from} where ${r.where} group by 1`) };
    }
    case "domain": {
      // The code is on agg_cpv_year only: a selection with an entity condition counts live.
      const rolled = await rowsOf(sql, p, { by: "cpv" }, ready);
      const r = rolled.cpv ? rolled : await rowsOf(sql, p, null, NO_ROLLUPS);
      return { unit: "records", rows: await run<Grouped>(sql`select ${kindOfCode(sql, r.cpv!)} k, ${r.v} v, ${r.n} n from ${r.from} where ${r.where} group by 1`) };
    }
    case "size": {
      // The whole purchase's value (purchaseValueConds): a contract's contract_value_full, a direct acquisition's own;
      // agg_national_mix keeps its range (ASK_MIX_SIZE_BOUNDS, the same as VALUE_RANGES).
      const mixed = mixOf(sql, p, ready);
      if (mixed) return { unit: "records", rows: await run<Grouped>(sql`
        select p.size::text k, coalesce(sum(p.v), 0) v, coalesce(sum(p.n), 0) n from marts.agg_national_mix p where ${mixed} group by 1`) };
      const r = await rowsOf(sql, p, null, NO_ROLLUPS, { full: true });
      const value: Fragment = p.ctx.plafond === "strict" ? sql`d.closing_value` : sql`coalesce(d.contract_value_full, d.closing_value)`;
      return { unit: "records", rows: await run<Grouped>(sql`select ${sizeOf(sql, value)} k, ${r.v} v, ${r.n} n from ${r.from} where ${r.where} group by 1`) };
    }
    case "years": {
      if (p.trend) return { error: "Anii schimbării se aleg în propoziție." };
      const r = await rowsOf(sql, p, byCounty, ready);
      return { unit: "records", rows: await run<Grouped>(sql`select ${r.y} k, ${r.v} v, ${r.n} n from ${r.from} where ${r.where} group by 1 order by 1`) };
    }
    case "county": {
      const r = await rowsOf(sql, p, byCounty, ready);
      return { unit: "records", rows: await run<Grouped>(sql`select ${r.county} k, ${r.v} v, ${r.n} n from ${r.from} where ${r.where} group by 1`) };
    }
    case "kind": {
      // Per institution, then its kind (plan §2.5: 16 s on the records, a few hundred ms grouped).
      const r = await rowsOf(sql, p, { by: "authority" }, ready);
      if (r.live && await waitsOnRollup(sql, p, ready)) return { precompute: ENTITY_LIVE };
      const id = r.id("authority") ?? sql`d.authority_id`;
      const kinds = await readAuthorityKinds(sql);
      return { unit: "institutions", rows: await run<Grouped>(sql`
        select ${authorityKindExpression(sql, kinds, sql`g.id`)} k, coalesce(sum(g.v), 0) v, count(*) n
        from (select ${id} id, ${r.v} v from ${r.from} where ${r.where} and ${id} is not null group by 1) g
        group by 1
      `) };
    }
    case "seat": case "employees": {
      // A seat is the county (folded and named after, countyOfFolded) with the firm's foreign flag: a Romanian
      // county first, then a foreign seat, the rest unknown (seatOf: the seat column, or the SEAP county before
      // it is filled). A band is the firm's latest filing.
      const seat = seatOf(sql, p.ctx.seatColumn);
      if (part === "seat" && opts.relative) return await seatClasses(sql, p, ready, run);
      const key: Fragment = part === "employees" ? sql`${bandOf(sql, sql`ep.employees`)} k, false f` : sql`${seat.county} k, coalesce(${seat.foreign}, false) f`;
      // Every record, both channels, every year: the firms' own profiles hold their sums (plan §2.5, "calea rapidă pe atribute").
      if (everyRecord(p, true)) {
        const size = firmAttrs(sql, p.ctx);
        return { unit: "firms", rows: await run<Grouped>(sql`
          select ${key}, coalesce(sum(ep.total_ron_split), 0) v, count(*) n
          from marts.entity_profile ep
          where ep.role = 'supplier' and ep.total_ron_split > 0 ${size}
          group by 1, 2
        `) };
      }
      const r = await rowsOf(sql, p, { by: "supplier" }, ready);
      if (r.live && await waitsOnRollup(sql, p, ready)) return { precompute: ENTITY_LIVE };
      const id = r.id("supplier") ?? sql`d.supplier_id`;
      return { unit: "firms", rows: await run<Grouped>(sql`
        select ${key}, coalesce(sum(g.v), 0) v, count(*) n
        from (select ${id} id, ${r.v} v from ${r.from} where ${r.where} and ${id} is not null group by 1) g
        left join marts.entity_profile ep on ep.entity_id = g.id and ep.role = 'supplier'
        group by 1, 2
      `) };
    }
    // F5: counted on its own (winnersCounts), with the draft's other chips.
    case "winners": return { error: "Numerele câștigătorilor se citesc separat." };
  }
}

/**
 * The seat window of a ranking of firms (relativeSeat): each record's firm
 * against the record's buyer county, as firmSeatCond selects it ("same",
 * "other", "abroad"; the rest, a seat or a buyer county nobody knows, is
 * "Nu se poate compara", SEAT_UNCOMPARED). Per class the firms and the value of
 * the records, grouped once per firm and buyer county; a rollup with a firm id
 * has both. One firm can sell in its county and elsewhere, so the classes
 * overlap: the draft's own firms (`whole`, the answer's) are counted apart, in
 * the same grouping (S4 review: national 2025, 14,459 by the classes' sum
 * against 11,722 firms ranked).
 */
async function seatClasses(sql: DbSql, p: Prepared, ready: Ready, run: Runner): Promise<{ rows: Grouped[]; unit: FacetUnit; whole: number } | { precompute: string }> {
  const r = await rowsOf(sql, p, { by: "supplier" }, ready);
  if (r.live && await waitsOnRollup(sql, p, ready)) return { precompute: ENTITY_LIVE };
  const id = r.id("supplier") ?? sql`d.supplier_id`;
  const seat = seatOf(sql, p.ctx.seatColumn);
  const rows = await run<Grouped & { t: boolean }>(sql`
    select x.k, coalesce(sum(x.v), 0) v, count(distinct x.id) n, false f, grouping(x.k) = 1 t
    from (
      select case when ${seat.foreign} then 'abroad' when ${seat.county} is null or g.county is null then null
                  when ${seat.county} = g.county then 'same' else 'other' end k, g.id, g.v
      from (select ${id} id, ${r.county} county, ${r.v} v from ${r.from} where ${r.where} and ${id} is not null group by 1, 2) g
      left join marts.entity_profile ep on ep.entity_id = g.id and ep.role = 'supplier'
    ) x
    group by grouping sets ((x.k), ())
  `);
  const whole = rows.find((row) => row.t);
  return { unit: "firms", rows: rows.filter((row) => !row.t), whole: whole ? Number(whole.n) : 0 };
}

/**
 * Counts of a profile question (the risk cloud, "Cine conduce?" on the
 * index): its profiles (profilePredicates), by kind or by county (a firm's
 * seat on firm profiles: its profile row's, F4). A distribution's group is its own window (F6a,
 * /api/ask/peers); the other parts are conditions on records, which a
 * profile does not take.
 */
async function profileCounts(sql: DbSql, p: Prepared, part: CountPart, run: Runner): Promise<{ rows: Grouped[]; unit: FacetUnit } | { error: string }> {
  const { spec, ctx } = p;
  const role: Role = spec.dim === "supplier" ? "supplier" : "authority";
  const offered = spec.block !== "distribution" && (part === "county" || (part === "kind" && role === "authority") || (part === "seat" && role === "supplier"));
  if (!offered) return { error: "Profilurile istorice nu se numără după această condiție." };
  const parts: Fragment[] = [...profilePredicates(ctx, role, profileMinDas(spec.block))];
  if (spec.block === "scatter") parts.push(sql`ef.cri is not null`);
  const where = andAll(sql, parts);
  const seat: Fragment = role === "supplier" && ctx.seatColumn
    ? sql`(select ep.seat_county from marts.entity_profile ep where ep.entity_id = ef.entity_id and ep.role = 'supplier')` : sql`ef.county`;
  const key: Fragment = part === "kind" ? authorityKindExpression(sql, await readAuthorityKinds(sql), sql`ef.entity_id`) : seat;
  return { unit: "profiles", rows: await run<Grouped>(sql`
    select ${key} k, coalesce(sum(ef.total_ron), 0) v, count(*) n from marts.entity_flags ef where ${where} group by 1
  `) };
}

/** The options of a part, in the window's order (the counties and years as found); null maps a group to the rest. */
function optionOf(part: CountPart, key: string | null, foreign = false): string | null {
  // A ranking of firms counts the classes of firmSeat (seatClasses); elsewhere a seat is a county, or abroad.
  if (part === "seat") return key === "same" || key === "other" || key === ABROAD ? key : countyOfFolded(key) ?? (foreign ? ABROAD : null);
  if (key === null) return null;
  switch (part) {
    case "county": return countyOfFolded(key);
    case "years": return /^\d{4}$/.test(key) ? key : null;
    case "kind": return (AUTHORITY_KINDS as readonly string[]).includes(key) ? key : null;
    default: return key;
  }
}
const FIXED_OPTIONS: Partial<Record<CountPart, readonly string[]>> = {
  channel: ["da", "contracts"],
  procedure: PROCEDURE_ORDER,
  domain: PURCHASE_KIND_ORDER,
  size: VALUE_RANGES.map((_, i) => String(i)),
  kind: AUTHORITY_KINDS,
  employees: EMPLOYEE_BAND_BOUNDS.map((band) => band.value),
};

/**
 * The grouped rows as the window's options and rest, with each share of the value (of the profiles on a profile
 * question). `whole`: the draft's count where the options overlap (seatClasses), instead of their sum; `relative`,
 * the seat classes' rest (SEAT_UNCOMPARED).
 */
export function assembleCounts(part: CountPart, unit: FacetUnit, rows: readonly Grouped[], meta: { checkpoint: string | null; tookMs: number; firmProfiles?: boolean; whole?: number; relative?: boolean }): FacetCounts {
  const sums = new Map<string, { n: number; v: number }>();
  const rest = { n: 0, v: 0 };
  for (const row of rows) {
    const option = optionOf(part, row.k, row.f === true), n = Number(row.n), v = Number(row.v);
    if (option === null) { rest.n += n; rest.v += v; continue; }
    const at = sums.get(option) ?? { n: 0, v: 0 };
    sums.set(option, { n: at.n + n, v: at.v + v });
  }
  const total = { n: rest.n, value_ron: rest.v };
  for (const { n, v } of sums.values()) { total.n += n; total.value_ron += v; }
  // Each record is in one class, so the value adds up; a firm can be in several, so its count is the draft's own.
  if (meta.whole !== undefined) total.n = meta.whole;
  const share = (n: number, v: number) => unit === "profiles" ? (total.n ? n / total.n : 0) : total.value_ron ? v / total.value_ron : 0;
  const fixed = FIXED_OPTIONS[part];
  const values = fixed ? [...fixed] : [...sums.keys()].sort(part === "years" ? undefined : (a, b) => sums.get(b)!.v - sums.get(a)!.v || a.localeCompare(b));
  const options: FacetCount[] = values.map((value) => {
    const at = sums.get(value) ?? { n: 0, v: 0 };
    return { value, n: at.n, value_ron: at.v, share: share(at.n, at.v) };
  });
  const label = part === "county" && meta.firmProfiles ? FACET_REST.seat : part === "seat" && meta.relative ? SEAT_UNCOMPARED : FACET_REST[part];
  return {
    part, unit, options,
    rest: label && (rest.n > 0 || part === "kind" || part === "seat" || part === "employees") ? { label, n: rest.n, value_ron: rest.v, share: share(rest.n, rest.v) } : null,
    total, checkpoint: meta.checkpoint, tookMs: meta.tookMs,
  };
}

/** A query run under the request's signal: a closed window cancels the statement it waits on. */
export type Runner = <T>(query: Fragment) => Promise<T[]>;
export function runner(signal: AbortSignal | undefined): Runner {
  return async <T,>(query: Fragment): Promise<T[]> => {
    signal?.throwIfAborted();
    const cancel = () => { (query as unknown as { cancel?: () => void }).cancel?.(); };
    signal?.addEventListener("abort", cancel, { once: true });
    try { return (await query) as unknown as T[]; } finally { signal?.removeEventListener("abort", cancel); }
  };
}

let refreshesTable: { ok: boolean; at: number } | null = null;
/** The data checkpoint (the last ready refresh), null without one. */
async function dataCheckpoint(sql: DbSql): Promise<string | null> {
  if (!refreshesTable || Date.now() - refreshesTable.at > FACET_TTL_MS) {
    const [row] = (await sql`select to_regclass('app.monitoring_refreshes') is not null ok`) as unknown as { ok: boolean }[];
    refreshesTable = { ok: Boolean(row?.ok), at: Date.now() };
  }
  if (!refreshesTable.ok) return null;
  const [ready] = (await sql`select id::text id from app.monitoring_refreshes where status = 'ready' order by version desc limit 1`) as unknown as { id: string }[];
  return ready?.id ?? null;
}

/** What a kept answer is valid for: the marts build (null when a mart is missing: nothing is kept) and the checkpoint. */
export async function facetStamp(sql: DbSql): Promise<{ build: string | null; checkpoint: string | null }> {
  const [build, checkpoint] = await Promise.all([trendCacheStamp(sql), dataCheckpoint(sql)]);
  return { build, checkpoint };
}

/** The key of a part's counts (plan §2.5): the draft without the part's key, the part, the checkpoint and the marts build. */
export function facetKey(spec: AskSpec, part: FacetPart, stamp: { build: string; checkpoint: string | null }): string {
  const asked = part === "locate" ? rankingSpec(spec) : facetSpec(spec, part);
  return JSON.stringify([stamp.build, stamp.checkpoint, part, questionKey(asked as unknown as QuestionSpec)]);
}

const counted = new Map<string, { value: FacetCounts; at: number }>();
const pending = new Map<string, Shared>();
let stats = { hits: 0, misses: 0, grouped: 0 };

function keep(key: string, value: FacetCounts): void {
  counted.delete(key);
  counted.set(key, { value, at: Date.now() });
  for (const oldest of counted.keys()) {
    if (counted.size <= FACET_ENTRIES) break;
    counted.delete(oldest);
  }
}

/** Tests and ask-perf: forget every kept count and rank vector, and the counters. */
export function forgetFacets(): void {
  counted.clear(); pending.clear(); vectors.clear(); held = 0; refreshesTable = null;
  stats = { hits: 0, misses: 0, grouped: 0 };
}
export const facetStats = () => ({ ...stats, entries: counted.size, vectors: vectors.size, held });

/** Inside the facet transaction: read-only, the plans of the values, the 8 s limit. */
export async function inFacetTransaction<T>(sql: DbSql, work: (tx: DbSql) => Promise<T>): Promise<T> {
  return await sql.begin("read only", async (tx) => {
    await tx.unsafe(FORCE_CUSTOM_PLANS);
    await tx.unsafe(`set local statement_timeout = '${FACET_TIMEOUT}'`);
    return await work(tx as unknown as DbSql);
  }) as T;
}

export const timedOut = (e: unknown) => e instanceof Error && e.message.includes("statement timeout");
/**
 * A request whose window closed: its signal's reason (AbortError, or Next's
 * ResponseAborted), or a query cancelled for it.
 */
export const aborted = (e: unknown): boolean =>
  e instanceof Error && (e.name === "AbortError" || e.name === "ResponseAborted" || e.message.includes("due to user request"));
const closed = () => Object.assign(new Error("The window closed."), { name: "AbortError" });

/**
 * One count shared by every request asking the same thing at the same time
 * (a window reopened, React's development effects run twice). Its query is
 * cancelled only when every request waiting on it has gone.
 */
interface Shared { key: string | null; work: Promise<FacetCounts | FacetFailure>; controller: AbortController; waiters: number }

function waitFor(shared: Shared, signal: AbortSignal | undefined): Promise<FacetCounts | FacetFailure> {
  shared.waiters++;
  return new Promise((resolve, reject) => {
    let settled = false;
    const leave = () => {
      if (settled) return;
      settled = true;
      // The last one gone: cancel, and let the next request count afresh rather than join a cancelled count.
      if (--shared.waiters === 0) {
        if (shared.key && pending.get(shared.key) === shared) pending.delete(shared.key);
        shared.controller.abort();
      }
      reject(closed());
    };
    if (signal?.aborted) { leave(); return; }
    signal?.addEventListener("abort", leave, { once: true });
    shared.work.then((value) => { if (!settled) { settled = true; shared.waiters--; resolve(value); } },
      (e: unknown) => { if (!settled) { settled = true; shared.waiters--; reject(e); } })
      .finally(() => signal?.removeEventListener("abort", leave));
  });
}

/**
 * The counts of one window on a draft (validated by the caller): kept, or
 * counted once for every request asking the same thing at the same time.
 */
export async function facetCounts(sql: DbSql, draft: AskSpec, part: CountPart, opts: { signal?: AbortSignal } = {}): Promise<FacetCounts | FacetFailure> {
  // F4: the shared clients (P) are found on the whole draft, so every option of a window would have its own P; a count
  // on the draft's P would not be the answer after choosing it (kit R5). The window shows its options without numbers.
  if (draft.block === "compare" && draft.filters.sharedPartners) return { error: SHARED_PARTNERS_COUNTS };
  const base = facetSpec(draft, part);
  const stamp = await facetStamp(sql);
  // F5: the winners' chips count with the draft's other chips (winnersCounts), so they are kept on the draft itself.
  const key = stamp.build ? facetKey(part === "winners" ? draft : base, part, { build: stamp.build, checkpoint: stamp.checkpoint }) : null;
  const kept = key ? counted.get(key) : undefined;
  if (key && kept && Date.now() - kept.at <= FACET_TTL_MS) {
    stats.hits++;
    keep(key, kept.value);
    return { ...kept.value, tookMs: 0 };
  }
  const running = key ? pending.get(key) : undefined;
  if (running) return await waitFor(running, opts.signal);
  stats.misses++;
  const controller = new AbortController();
  const work = (async (): Promise<FacetCounts | FacetFailure> => {
    const started = Date.now();
    try {
      const grounding = await ground(sql, base.filters, base.population);
      // The rollups are probed with the pool, before the transaction (rollups.ts).
      const ready = await readyOf(sql);
      await martColumns(sql);
      const result = await inFacetTransaction(sql, async (tx) => {
        const p = await prepare(tx, base, grounding);
        if ("error" in p) return p;
        stats.grouped++;
        const run = runner(controller.signal);
        // F5: the ranked winners' chips, each conditioned on the others the draft has set.
        if (part === "winners") return await winnersCounts(tx, p, draft, ready, run, { checkpoint: stamp.checkpoint, started });
        const grouped = p.profile ? await profileCounts(tx, p, part, run) : await transactionCounts(tx, p, part, ready, run, { relative: relativeSeat(draft) });
        if ("error" in grouped || "precompute" in grouped) return grouped;
        const whole = (grouped as { whole?: number }).whole;
        const counts = assembleCounts(part, grouped.unit, grouped.rows, {
          checkpoint: stamp.checkpoint, tookMs: Date.now() - started, firmProfiles: p.profile && p.spec.dim === "supplier",
          ...(whole !== undefined ? { whole, relative: true } : {}),
        });
        // Around an institution its county names the option „În județul …” (a county of the draft would filter the centre).
        const centre = part === "seat" && (draft.block === "network" || draft.block === "sankey") && draft.dim === "authority" ? grounding.authority?.county : null;
        return centre ? { ...counts, centreCounty: countyDisplay(centre) } : counts;
      });
      if ("options" in result && key) keep(key, result);
      return result;
    } catch (e) {
      if (timedOut(e)) return { timeout: true };
      throw e;
    }
  })();
  const shared: Shared = { key, work, controller, waiters: 0 };
  if (key) pending.set(key, shared);
  void work.catch(() => {}).finally(() => { if (key && pending.get(key) === shared) pending.delete(key); });
  return await waitFor(shared, opts.signal);
}

// --- F5, the ranked winners (part=winners: the chips' counts; part=rows: the facts of the rows shown)

/**
 * The counts of the ranked winners' chips (plan §4.2 P6, final table §4 "Răspunsul"): on firms each year of each
 * sense of „Firme noi” and „Principalul lor client public”, on institutions „O firmă ia peste jumătate”. One
 * grouping of the selection without any chip (facetSpec), each firm's years and its relation with the named buyer
 * beside it; an option counts the firms it keeps with the other chips the draft has set (the band, the other
 * key), so its number is the list after that click. Shares are of the whole selection's value, as the answer's.
 */
async function winnersCounts(sql: DbSql, p: Prepared, draft: AskSpec, ready: Ready, run: Runner, meta: { checkpoint: string | null; started: number }): Promise<FacetCounts | FacetFailure> {
  if (p.profile || p.spec.block !== "table" || (p.spec.dim !== "supplier" && p.spec.dim !== "authority")) return { error: "Numerele se calculează doar pe clasamente." };
  const done = (unit: FacetUnit, options: FacetCount[], total: { n: number; v: number }): FacetCounts =>
    ({ part: "winners", unit, options, rest: null, total: { n: total.n, value_ron: total.v }, checkpoint: meta.checkpoint, tookMs: Date.now() - meta.started });
  const share = (v: number, total: number) => total ? v / total : 0;
  if (p.spec.dim === "authority") {
    const r = await rowsOf(sql, p, { by: "authority" }, ready);
    if (r.live && await waitsOnRollup(sql, p, ready)) return { precompute: ENTITY_LIVE };
    const id = r.id("authority") ?? sql`d.authority_id`;
    const dominant = dominantIdsSql(sql, p.ctx, { source: txAggFragment(sql, p.dataset, false, fullValueUnion(p.ctx)) as unknown as Fragment, rollups: ready.rollups });
    // The institutions once (a materialized list), then both sums over the grouped selection.
    const [row] = await run<{ dn: string; dv: string; n: string; v: string }>(sql`
      with dom as materialized (${dominant}), g as (select ${id} id, ${r.v} v from ${r.from} where ${r.where} and ${id} is not null group by 1)
      select count(dom.authority_id) dn, coalesce(sum(g.v) filter (where dom.authority_id is not null), 0) dv, count(*) n, coalesce(sum(g.v), 0) v
      from g left join dom on dom.authority_id = g.id
    `);
    const total = { n: Number(row?.n ?? 0), v: Number(row?.v ?? 0) };
    return done("institutions", [{ value: "dominant", n: Number(row?.dn ?? 0), value_ron: Number(row?.dv ?? 0), share: share(Number(row?.dv ?? 0), total.v) }], total);
  }
  // The firms of the selection: their profiles over every record, else grouped from the rollups or the records.
  let grouped: Fragment;
  if (everyRecord(p, true)) grouped = sql`select ep.entity_id id, ep.total_ron_split v from marts.entity_profile ep where ep.role = 'supplier' and ep.total_ron_split > 0`;
  else {
    const r = await rowsOf(sql, p, { by: "supplier" }, ready);
    if (r.live && await waitsOnRollup(sql, p, ready)) return { precompute: ENTITY_LIVE };
    const id = r.id("supplier") ?? sql`d.supplier_id`;
    grouped = sql`select ${id} id, ${r.v} v from ${r.from} where ${r.where} and ${id} is not null group by 1`;
  }
  // The other chips of the draft (its band, its sense of „Firme noi”, its main client), each applied to the other options.
  const f = draft.filters;
  const band = f.minEmployees !== undefined || f.maxEmployees !== undefined
    ? sql`coalesce(${employeesBounds(sql, f.minEmployees ?? null, f.maxEmployees ?? null)}, false)` : sql`true`;
  const buyer = p.ctx.buyerIds.length > 0;
  const scope = f.newScope as NewScope | undefined, since = f.newSince !== undefined ? Number(f.newSince) : null;
  const isNew = since === null || !scope ? sql`true`
    : scope === "archive" ? sql`coalesce(a.fa >= ${String(since)}, false)` : scope === "registry" ? sql`coalesce(a.ry >= ${since}, false)`
      : buyer ? sql`coalesce(a.bf >= ${String(since)}, false)` : sql`false`;
  const main = f.mainClient === true ? sql`a.main_ok` : sql`true`;
  const rows = await run<{ s: string; y: string | null; n: string; v: string }>(sql`
    with g as (${grouped}), a as (
      select g.id, g.v, ${band} band_ok, substr(ep.first_activity, 1, 4) fa, ep.registered_year ry,
             ${buyer ? sql`substr(b.f, 1, 4)` : sql`null::text`} bf,
             ${buyer ? sql`coalesce(ep.n_das + ep.n_contracts >= ${RELATION_MIN_RECORDS} and b.v >= ${RELATION_SHARE} * ep.total_ron_split, false)` : sql`false`} main_ok
      from g left join marts.entity_profile ep on ep.entity_id = g.id and ep.role = 'supplier'
      ${buyer ? sql`left join ${buyerRowsSql(sql, p.ctx.buyerIds)} b on b.supplier_id = g.id` : sql``}
    )
    select 'archive' s, a.fa y, count(*) n, coalesce(sum(a.v), 0) v from a where a.band_ok and ${main} group by a.fa
    union all select 'registry', a.ry::text, count(*), coalesce(sum(a.v), 0) from a where a.band_ok and ${main} group by a.ry
    ${buyer ? sql`union all select 'buyer', a.bf, count(*), coalesce(sum(a.v), 0) from a where a.band_ok and ${main} group by a.bf` : sql``}
    union all select 'main', null, count(*), coalesce(sum(a.v), 0) from a where a.band_ok and a.main_ok and ${isNew}
    union all select 'all', null, count(*), coalesce(sum(a.v), 0) from a
  `);
  const all = rows.find((r) => r.s === "all");
  const total = { n: Number(all?.n ?? 0), v: Number(all?.v ?? 0) };
  const ctx = { form: formOf(draft as unknown as FilterSpec), year: new Date().getFullYear() };
  const options: FacetCount[] = [];
  for (const sense of newScopesOf(draft as unknown as FilterSpec, ctx)) {
    const years = rows.filter((r) => r.s === sense && r.y !== null && /^\d{4}$/.test(r.y));
    for (const year of newYearsOf(draft as unknown as FilterSpec, ctx, sense)) {
      const from = years.filter((r) => Number(r.y) >= year);
      const n = from.reduce((sum, r) => sum + Number(r.n), 0), v = from.reduce((sum, r) => sum + Number(r.v), 0);
      options.push({ value: winnerOption(sense, year), n, value_ron: v, share: share(v, total.v) });
    }
  }
  const mainRow = rows.find((r) => r.s === "main");
  if (buyer) options.push({ value: "main", n: Number(mainRow?.n ?? 0), value_ron: Number(mainRow?.v ?? 0), share: share(Number(mainRow?.v ?? 0), total.v) });
  return done("firms", options, total);
}

/**
 * The facts of the rows an answer shows (plan §4.2 P8; final table §3.3–§3.7: why a row is there), asked once the
 * ranking is drawn so they never delay it: lib/ask/winners.ts rankedFacts on the ids shown, with the question's
 * conditions (an institution's largest firm is the selection's).
 */
export async function rowFacts(sql: DbSql, spec: AskSpec, ids: readonly string[], opts: { signal?: AbortSignal } = {}): Promise<RowsResult | FacetFailure> {
  if (spec.block !== "table" || (spec.dim !== "supplier" && spec.dim !== "authority")) return { error: "Faptele rândurilor sunt ale clasamentelor de firme sau instituții." };
  const started = Date.now();
  try {
    const stamp = await facetStamp(sql);
    const grounding = await ground(sql, spec.filters, spec.population);
    const ready = await readyOf(sql);
    return await inFacetTransaction(sql, async (tx) => {
      const p = await prepare(tx, spec, grounding);
      if ("error" in p) return p;
      opts.signal?.throwIfAborted();
      const facts = await rankedFacts(tx, p.ctx, {
        dim: spec.dim as "supplier" | "authority", ids, rollups: ready.rollups,
        source: txAggFragment(tx, p.dataset, false, fullValueUnion(p.ctx)) as unknown as Fragment,
      });
      return { part: "rows" as const, facts, checkpoint: stamp.checkpoint, tookMs: Date.now() - started };
    });
  } catch (e) {
    if (timedOut(e)) return { timeout: true };
    throw e;
  }
}

// --- "Unde e …?" (component 20, part=locate)

/** The ranking a search places names in: the question without its length (a place past the first N is still a place, final table §5). */
function rankingSpec(spec: AskSpec): AskSpec {
  const { topN: _top, ...rest } = spec;
  return rest;
}

/**
 * The rank vector of a ranking: its ids in their places (value or records
 * descending, then the id, as the answer orders them), and the same ids
 * sorted with their places, for a binary search.
 */
interface RankVector { ids: Float64Array; values: Float64Array; counts: Float64Array; sorted: Float64Array; places: Int32Array; size: number }
const vectors = new Map<string, { vector: RankVector; at: number }>();
let held = 0;

export function rankVector(rows: readonly { id: string; v: string; n: string }[]): RankVector {
  const ids = Float64Array.from(rows, (r) => Number(r.id)), values = Float64Array.from(rows, (r) => Number(r.v)), counts = Float64Array.from(rows, (r) => Number(r.n));
  const order = Array.from(ids.keys()).sort((a, b) => ids[a]! - ids[b]!);
  return { ids, values, counts, sorted: Float64Array.from(order, (i) => ids[i]!), places: Int32Array.from(order, (i) => i + 1), size: ids.length };
}
/** The place of an id in the vector, or null when the ranking does not hold it. */
export function placeOf(vector: Pick<RankVector, "sorted" | "places">, id: number): number | null {
  let lo = 0, hi = vector.sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, at = vector.sorted[mid]!;
    if (at === id) return vector.places[mid]!;
    if (at < id) lo = mid + 1; else hi = mid - 1;
  }
  return null;
}
function keepVector(key: string, vector: RankVector): void {
  const old = vectors.get(key);
  if (old) { vectors.delete(key); held -= old.vector.size; }
  if (vector.size > LOCATE_ID_LIMIT) return;
  vectors.set(key, { vector, at: Date.now() });
  held += vector.size;
  for (const [oldest, { vector: v }] of vectors) {
    if (held <= LOCATE_ID_LIMIT) break;
    vectors.delete(oldest);
    held -= v.size;
  }
}

/** The text searched as a LIKE pattern on folded names. */
const namePattern = (q: string) => `%${fold(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * "Unde e o firmă?" / "Unde e o instituție?" on a ranking of firms or
 * institutions (value or records): the names matching `q` and their places.
 * The national ranking over every record reads entity_profile (a count of the
 * profiles above each match); any other ranking groups once and keeps its
 * rank vector, which the next searches on the same question reuse.
 */
export async function locate(sql: DbSql, spec: AskSpec, q: string, opts: { signal?: AbortSignal } = {}): Promise<LocateResult | FacetFailure> {
  if (spec.block !== "table" || (spec.dim !== "supplier" && spec.dim !== "authority")) return { error: "„Unde e …?” caută într-un clasament de firme sau de instituții." };
  if (spec.measure !== "value" && spec.measure !== "count") return { error: "„Unde e …?” nu se aplică valorii pe locuitor." };
  const role: Role = spec.dim, measure = spec.measure;
  const asked = rankingSpec(spec);
  const started = Date.now();
  try {
    const stamp = await facetStamp(sql);
    const key = stamp.build ? facetKey(asked, "locate", { build: stamp.build, checkpoint: stamp.checkpoint }) : null;
    const grounding = await ground(sql, asked.filters, asked.population);
    const ready = await readyOf(sql);
    return await inFacetTransaction(sql, async (tx) => {
      const run = runner(opts.signal);
      const p = await prepare(tx, asked, grounding);
      if ("error" in p) return p;
      const pattern = namePattern(q);
      const done = (total: number, matches: LocateMatch[]): LocateResult =>
        ({ part: "locate", total, measure, matches, checkpoint: stamp.checkpoint, tookMs: Date.now() - started });
      // Every record, both channels, every year (the firms' bands apart): each profile's sum is its place's
      // value, and a firm's records are n_das + n_contracts (an institution's profile counts a contract once).
      if (everyRecord(p, role === "supplier") && (measure === "value" || role === "supplier")) {
        const size = role === "supplier" ? firmAttrs(sql, p.ctx) : sql``;
        const by = (alias: string) => measure === "count" ? sql`${sql(alias)}.n_das + ${sql(alias)}.n_contracts` : sql`${sql(alias)}.total_ron_split`;
        const ranked = sql`ep.role = ${role} and ep.total_ron_split > 0 ${size}`;
        const [count] = await run<{ t: string }>(sql`select count(*) t from marts.entity_profile ep where ${ranked}`);
        const rows = await run<{ id: string; nm: string; co: string | null; v: string; n: string; place: string }>(sql`
          with m as (
            select ep.entity_id id, coalesce(ep.name_display, '(fără nume)') nm, ${ownCountySql(sql, role, p.ctx.seatColumn)} co, ep.total_ron_split v, ep.n_das + ep.n_contracts n, ${by("ep")} k
            from marts.entity_profile ep
            where ${ranked} and lower(unaccent(ep.name_display)) like ${pattern}
            order by ${by("ep")} desc, ep.entity_id
            limit ${LOCATE_MATCHES}
          )
          select m.id, m.nm, m.co, m.v, m.n, (
            select count(*) + 1 from marts.entity_profile ep
            where ${ranked} and (${by("ep")} > m.k or (${by("ep")} = m.k and ep.entity_id < m.id))
          ) place
          from m order by place
        `);
        return done(Number(count?.t ?? 0), rows.map((r) => ({ id: String(r.id), name: r.nm, county: r.co, rank: Number(r.place), value: Number(r.v), n: Number(r.n) })));
      }
      let vector = key ? vectors.get(key) : undefined;
      if (vector && Date.now() - vector.at > FACET_TTL_MS) { vectors.delete(key!); held -= vector.vector.size; vector = undefined; }
      if (!vector) {
        const r = await rowsOf(tx, p, { by: role }, ready);
        const id = r.id(role) ?? (role === "authority" ? sql`d.authority_id` : sql`d.supplier_id`);
        stats.grouped++;
        const rows = await run<{ id: string; v: string; n: string }>(sql`
          select ${id} id, ${r.v} v, ${r.n} n from ${r.from} where ${r.where} and ${id} is not null
          group by 1 order by ${measure === "count" ? sql`n` : sql`v`} desc, 1
        `);
        vector = { vector: rankVector(rows), at: Date.now() };
        if (key) keepVector(key, vector.vector);
      }
      const ranking = vector.vector;
      // Names apart (plan §2.5): the profiles whose name holds the text, placed by the vector.
      const names = await run<{ id: string; nm: string; co: string | null }>(sql`
        select ep.entity_id id, coalesce(ep.name_display, '(fără nume)') nm, ${ownCountySql(sql, role, p.ctx.seatColumn)} co
        from marts.entity_profile ep
        where ep.role = ${role} and lower(unaccent(ep.name_display)) like ${pattern}
        order by ep.total_ron_split desc nulls last, ep.entity_id
        limit 200
      `);
      const placed = names.map((r) => ({ r, place: placeOf(ranking, Number(r.id)) }));
      const inRanking = placed.filter((m) => m.place !== null).sort((a, b) => a.place! - b.place!).slice(0, LOCATE_MATCHES);
      // A name the ranking does not hold is said so ("nu intră în clasament"), only when no name is placed.
      const shown = inRanking.length ? inRanking : placed.slice(0, 3);
      return done(ranking.size, shown.map(({ r, place }) => ({
        id: String(r.id), name: r.nm, county: r.co, rank: place,
        value: place === null ? null : ranking.values[place - 1]!, n: place === null ? null : ranking.counts[place - 1]!,
      })));
    });
  } catch (e) {
    if (timedOut(e)) return { timeout: true };
    throw e;
  }
}

// --- the slots: at most FACET_SLOTS parts at a time in the process

let busy = 0;
const waiting: (() => void)[] = [];

/**
 * Run `work` in one of the FACET_SLOTS slots, waiting for a free one. A
 * request whose window closed while it waited is dropped without a query.
 */
export async function inFacetSlot<T>(signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
  while (busy >= FACET_SLOTS) {
    await new Promise<void>((resolve) => {
      // Woken by a slot that ends, or leaving the queue when the window closes (a stale entry would swallow the next wake-up).
      const go = () => { signal?.removeEventListener("abort", drop); resolve(); };
      const drop = () => { const at = waiting.indexOf(go); if (at >= 0) waiting.splice(at, 1); resolve(); };
      waiting.push(go);
      signal?.addEventListener("abort", drop, { once: true });
    });
    signal?.throwIfAborted();
  }
  signal?.throwIfAborted();
  busy++;
  try { return await work(); } finally {
    busy--;
    waiting.shift()?.();
  }
}
/** Tests: the slots in use and the requests waiting. */
export const facetSlots = () => ({ busy, waiting: waiting.length });

/** The part a request names, with its text for "Unde e …?" (plan §2.5: at least two characters). */
export function facetRequest(body: { part?: unknown; q?: unknown; ids?: unknown }): { part: FacetPart; q: string | null; ids?: string[] } | { error: string } {
  const part = body.part;
  if (!isFacetPart(part)) return { error: "Parte necunoscută." };
  // F5: the facts of the rows shown, by their ids (a page at most).
  if (part === "rows") {
    const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string" && /^\d{1,18}$/.test(id)) : [];
    if (!ids.length || ids.length > ROWS_MAX || ids.length !== (body.ids as unknown[]).length) return { error: "Rândurile cerute nu sunt valide." };
    return { part, q: null, ids };
  }
  if (part !== "locate") return { part, q: null };
  const q = typeof body.q === "string" ? body.q.trim().slice(0, 80) : "";
  if (fold(q).length < 2) return { error: "Scrie cel puțin două litere." };
  return { part: "locate", q };
}
