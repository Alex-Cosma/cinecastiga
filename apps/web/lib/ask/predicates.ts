import { SEAT_ABROAD_LABEL, type DbSql } from "@seap/db";
import type { Grounding } from "./ground";
import type { MinimumRecords, PopulationCondition, QueryPopulation } from "./population";
import { DEFAULT_TREND_MIN_BASE, namedKind, type AskSpec, type AuthorityKind, type Dataset, type FirmSeat, type MonthWindow, type TrendChange } from "./spec";
import { authorityKindCond, KIND_LABEL, KIND_SOURCE } from "./authority-kind";
import { countWords } from "./answer-text";
import { kindApplies, NAMED_PROCEDURE_TYPES, PROCEDURE_TYPES, PROCEDURE_WORDS, PURCHASE_KIND_WORDS, valueWords, type Procedure, type PurchaseKind } from "./purchase";

/*
 * One description of the conditions of a question (plan §2.5). The answer
 * (runSpec), its sources, the CSV export and the frozen captures (runRows) and
 * the "avansat" SQL text (buildDisplaySql) take every condition from here, so
 * a filter is written once and the figures always have their sources. Each
 * function is one engine level of the filter registry (filters/types.ts
 * EngineLevel): rowPredicates for `row` and `entityAttr` (a condition on the
 * record d.*, or a semi-join on the firm), groupPredicates for `group`
 * (computed over the rows grouped by entity), profilePredicates for
 * `profile` (marts.entity_flags), displayPredicates for the text.
 * predicates.test.ts checks the registry against them.
 */

type Fragment = ReturnType<DbSql>;

/** DA rows above this are treated as data-entry errors (legal DA thresholds are far lower). */
export const DA_PLAFOND_RON = 2_000_000;
/** Minimum DA count before an entity participates in risk-based blocks. */
export const RISK_MIN_DAS = 10;
/** "Cine conduce?" on the risk index ranks profiles with at least this many direct acquisitions. */
export const ENTITY_CARD_MIN_DAS = 20;
export const profileMinDas = (block: string): number => block === "entity_card" ? ENTITY_CARD_MIN_DAS : RISK_MIN_DAS;

/**
 * DA plausibility bound: "strict" filters every row (dataset da),
 * "da-branch" filters only the DA rows of the union (dataset all),
 * "none" for contracts. It applies to every measure: a count question shows
 * the same population (and the same RON total) as the value question.
 */
export type Plafond = "none" | "strict" | "da-branch";
export const plafondFor = (dataset: Dataset): Plafond =>
  dataset === "contracts" ? "none" : dataset === "da" ? "strict" : "da-branch";

export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** What runSpec resolved before its first query: the grounded anchors and the window of a question. */
export interface PredicateCtx {
  sql: DbSql;
  population: QueryPopulation | null;
  minimumRecords: MinimumRecords | null;
  cpvPrefixes: string[];
  /** Sub-trees of the subject left out (synonym exclusions): `and not (cpv_code like …)`. */
  cpvExclude: string[];
  county: string | null;
  kind: AuthorityKind | null;
  /** The institutions of that kind (authorityKindIds, D1), resolved by the caller before the first query. */
  kindIds: readonly string[] | null;
  authorityId: string | null;
  supplierId: string | null;
  /** Locality scope: the UAT's own local administration (grounding.uat). */
  uatSiruta: number | null;
  /** Strictly associated authority ids of that UAT (audit F15). */
  uatAuthorityIds: string[];
  /** dataset "contracts" only: keep rows with is_single_bidder = true. */
  singleBidder: boolean;
  /** Supplier size bounds (MF bilanț employees via marts.entity_profile). */
  minEmployees: number | null;
  maxEmployees: number | null;
  /** Clamped to the archive by the caller. */
  yearFrom: number | null;
  yearTo: number | null;
  /** 1–12; only applied together with the corresponding year bound. */
  monthFrom: number | null;
  monthTo: number | null;
  /** trend: the same months of both years (sameMonthsWindow, resolved by the caller); null for whole years. */
  trendMonths: MonthWindow | null;
  /** timeseries: the same months of every year („Aceleași luni”, F3; resolved by the caller as the trend's); null for whole years. */
  seriesMonths: MonthWindow | null;
  /** "Conduse de X": supplier ids of the person's firms (ONRC reps). */
  adminSupplierIds: string[] | null;
  /**
   * F3, the purchase kind from the CPV code (purchase.ts divisionKind); null when absent, or when it
   * does not meet the domain's codes (kindApplies: left out with a note, never an empty answer).
   */
  purchaseKind: PurchaseKind | null;
  /** F3, the procedure declared in SEAP (contracts only: parseSpec brings their stream). */
  procedure: Procedure | null;
  /** F3, the value of the whole purchase in lei, [min, max): never a winner's share (purchase.ts VALUE_RANGES). */
  purchaseValueMin: number | null;
  purchaseValueMax: number | null;
  /** F4, the seat of the record's firm against the record's buyer county (same, other) or abroad (firmSeatCond). */
  firmSeat: FirmSeat | null;
  /** F4, the firm's own county, grounded (seatCountyCond); on firm profiles a link's county is the same condition. */
  seatCounty: string | null;
  /**
   * The seat column is filled (mart-columns.ts `seat`, read by the caller): entity_profile.seat_county and
   * seat_source (ONRC, then SEAP; foreign apart). Before the first marts build that fills it, the SEAP county
   * (entity_profile.county, is_foreign) stands in, said in the answer's note (plan §2.5).
   */
  seatColumn: boolean;
  plafond: Plafond;
  /** compare: both entities, of the role of the first (the second replaces its own id condition). */
  comparison: { role: "authority" | "supplier"; focalId: string | null; compareId: string | null } | null;
}

/**
 * The conditions of `spec` once grounded. A filter counts when the spec has it
 * and the grounding resolved it (runSpec and runRows refuse an unresolved one
 * first); the CPV prefixes and the administrator's firms come from the
 * grounding alone (a peer group's sources carry a CPV division without a term).
 */
export function predicateContext(
  sql: DbSql,
  spec: AskSpec,
  grounding: Grounding,
  window: {
    dataset: Dataset; yearFrom: number | null; yearTo: number | null; kindIds?: readonly string[] | null; trendMonths?: MonthWindow | null; seriesMonths?: MonthWindow | null;
    /** The seat column is filled (martColumns(pool).seat, probed before the transaction). */
    seat: boolean;
  },
): PredicateCtx {
  const f = spec.filters;
  const kind = namedKind(f.authorityKind) ?? null;
  // The kind is a list of institution ids (authority-kind.ts): a caller that did not read it would drop the condition.
  if (kind && !window.kindIds) throw new Error(`predicateContext: the institutions of kind ${kind} were not read (authorityKindIds)`);
  const authorityId = f.authorityName || f.authorityId ? grounding.authority?.entityId ?? null : null;
  const supplierId = f.supplierName || f.supplierId ? grounding.supplier?.entityId ?? null : null;
  const uat = f.uatSiruta && grounding.uat?.authorityIds?.length ? grounding.uat : null;
  return {
    sql,
    population: spec.population ?? null,
    minimumRecords: spec.minimumRecords ?? null,
    cpvPrefixes: grounding.cpv?.prefixes ?? [],
    cpvExclude: grounding.cpv?.excludePrefixes ?? [],
    county: f.county ? grounding.county?.canonical ?? null : null,
    kind,
    kindIds: kind ? window.kindIds! : null,
    authorityId,
    supplierId,
    uatSiruta: uat?.siruta ?? null,
    uatAuthorityIds: uat?.authorityIds ?? [],
    singleBidder: window.dataset === "contracts" && f.singleBidder === true,
    minEmployees: f.minEmployees ?? null,
    maxEmployees: f.maxEmployees ?? null,
    yearFrom: window.yearFrom,
    yearTo: window.yearTo,
    monthFrom: f.monthFrom ?? null,
    monthTo: f.monthTo ?? null,
    trendMonths: spec.block === "trend" ? window.trendMonths ?? null : null,
    seriesMonths: spec.block === "timeseries" ? window.seriesMonths ?? null : null,
    adminSupplierIds: grounding.admin ? grounding.admin.supplierIds : null,
    purchaseKind: f.purchaseKind && kindApplies(f.purchaseKind, grounding) ? f.purchaseKind : null,
    procedure: f.procedure ?? null,
    purchaseValueMin: f.purchaseValueMin ?? null,
    purchaseValueMax: f.purchaseValueMax ?? null,
    firmSeat: f.firmSeat ?? null,
    seatCounty: f.seatCounty ? grounding.seatCounty?.canonical ?? null : null,
    seatColumn: window.seat,
    plafond: plafondFor(window.dataset),
    comparison: spec.block === "compare"
      ? { role: authorityId ? "authority" : "supplier", focalId: authorityId ?? supplierId, compareId: grounding.compare?.entityId ?? null }
      : null,
  };
}

/** `a and b and …` (the parts are never empty: rowPredicates starts with closing_value > 0). */
export const andAll = (sql: DbSql, parts: readonly Fragment[]): Fragment => parts.reduce((a, b) => sql`${a} and ${b}`);

/** Same alias and predicates for result, evidence, CSV and frozen captures. */
export function populationSql(sql: DbSql, population?: QueryPopulation | null): Fragment {
  if (!population) return sql`true`;
  const combine = (parts: Fragment[], operator: "and" | "or") => parts.reduce((a, b) => operator === "and" ? sql`(${a} and ${b})` : sql`(${a} or ${b})`);
  // Only included institutions and firms (a capture's entity, a relationship's pairs, chosen
  // buyers): the whole selection can be read from the id indexes. An included list is never
  // under a negation, so a missing id (null) leaves the row out as false does. Mixed with a
  // condition no index serves, the selection is scanned anyway and keeps the coalesce form
  // and its plans (measured: an OR with a county list got a slower page plan).
  const idLists = population.groups.every((g) => g.conditions.every((c) => (c.field === "authority" || c.field === "supplier") && c.op === "in"));
  const condition = (c: PopulationCondition): Fragment => {
    if (c.field === "date") {
      return c.op === "gte" ? sql`substr(d.finalization_date, 1, 10) >= ${c.value}` : sql`substr(d.finalization_date, 1, 10) <= ${c.value}`;
    }
    if (c.field === "value") return c.op === "gte" ? sql`d.closing_value >= ${c.value}::numeric` : sql`d.closing_value <= ${c.value}::numeric`;
    // Explicit exclusion retains unknowns: missing is not a match to an excluded identity.
    if ("values" in c) {
      let matches: Fragment;
      if (c.field === "cpv") matches = sql`coalesce(d.cpv_code like any(${sql.array(c.values.map(v => v + "%"))}::text[]), false)`;
      else if (c.field === "county") matches = sql`coalesce(lower(unaccent(d.county)) = any(${sql.array(c.values.map(v => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()))}::text[]), false)`;
      else {
        const column = c.field === "authority" ? sql`d.authority_id` : sql`d.supplier_id`;
        if (idLists) return sql`${column} = any(${sql.array(c.values)}::bigint[])`;
        matches = sql`coalesce(${column} = any(${sql.array(c.values)}::bigint[]), false)`;
      }
      return c.op === "not_in" ? sql`not (${matches})` : matches;
    }
    throw new Error("Unsupported population condition");
  };
  return combine(population.groups.map(g => combine(g.conditions.map(condition), g.operator)), population.operator);
}

/** A firm's size on its own profile row (`ep`): the latest MF filing, firms without one never in a band. */
export function employeesBounds(sql: DbSql, min: number | null, max: number | null): Fragment {
  const bounds =
    min !== null && max !== null
      ? sql`ep.employees between ${min} and ${max}`
      : min !== null
        ? sql`ep.employees >= ${min}`
        : sql`ep.employees <= ${max!}`;
  return sql`ep.employees is not null and ${bounds}`;
}

/** Supplier size bound → semi-join on the entity_profile employee snapshot (`column`: the firm id of the rows, or of a rollup). */
export function employeesCond(sql: DbSql, min: number | null, max: number | null, column: Fragment = sql`d.supplier_id`): Fragment {
  return sql`${column} in (
    select ep.entity_id from marts.entity_profile ep
    where ep.role = 'supplier' and ${employeesBounds(sql, min, max)}
  )`;
}

/**
 * A firm's seat on its profile row (plan §2.5, kit §5.4: one column, two
 * keys): entity_profile.seat_county once the marts build filled it (`filled`,
 * the column probe), else the SEAP county; a foreign firm is apart (seat_source
 * 'foreign', else is_foreign) and has no Romanian county.
 */
export function seatOf(sql: DbSql, filled: boolean, alias = "ep"): { county: Fragment; foreign: Fragment; romanian: Fragment } {
  const a = sql(alias);
  return filled
    ? { county: sql`${a}.seat_county`, foreign: sql`${a}.seat_source = 'foreign'`, romanian: sql`${a}.seat_source is distinct from 'foreign'` }
    : { county: sql`${a}.county`, foreign: sql`coalesce(${a}.is_foreign, false)`, romanian: sql`not coalesce(${a}.is_foreign, false)` };
}

/**
 * F4, the seat of a record's firm against the record's buyer county (plan
 * §2.5): `same` and `other` need a Romanian firm with a known seat and a buyer
 * with a known county; `abroad` is the firm's own attribute (a semi-join, as
 * the employees). The rest (a seat or a buyer county nobody knows, a record
 * without firm) is in no option: the window's "Sediu necunoscut". `row` names
 * the firm and buyer county columns: the record's, or a rollup's.
 */
export function firmSeatCond(sql: DbSql, seat: FirmSeat, filled: boolean,
  row: { supplier: Fragment; county: Fragment } = { supplier: sql`d.supplier_id`, county: sql`d.county` }): Fragment {
  const s = seatOf(sql, filled);
  if (seat === "abroad") return sql`${row.supplier} in (select ep.entity_id from marts.entity_profile ep where ep.role = 'supplier' and ${s.foreign})`;
  return sql`exists (select 1 from marts.entity_profile ep
    where ep.entity_id = ${row.supplier} and ep.role = 'supplier' and ${s.romanian}
      and ${s.county} ${seat === "same" ? sql`=` : sql`<>`} ${row.county})`;
}

/** The seat is this county (`county`, grounded) on a profile row; the SEAP county matches in any spelling, as a firm profile's county did. */
function seatIn(sql: DbSql, county: string, filled: boolean, alias = "ep"): Fragment {
  return filled ? sql`${sql(alias)}.seat_county = ${county}` : sql`lower(unaccent(${sql(alias)}.county)) = ${fold(county)}`;
}

/** F4, the firm's own county (seatCounty): a semi-join on its profile, as the employees (`column`: the firm id of the rows, or of a rollup). */
export function seatCountyCond(sql: DbSql, county: string, filled: boolean, column: Fragment = sql`d.supplier_id`): Fragment {
  return sql`${column} in (select ep.entity_id from marts.entity_profile ep where ep.role = 'supplier' and ${seatIn(sql, county, filled)})`;
}

/**
 * The county an answer shows beside an entity, from its profile row `alias`
 * (owner-seat-switch, F4): an institution's own county; a firm's seat (the
 * latest ONRC registration, then SEAP), "Străinătate" for a foreign one, null
 * when nobody knows it; before the seat column is filled, its SEAP county.
 * `role` is the entity's role, or a column holding it.
 */
export function ownCountySql(sql: DbSql, role: "authority" | "supplier" | Fragment, filled: boolean, alias = "ep"): Fragment {
  const a = sql(alias);
  const firm: Fragment = sql`(case when ${a}.seat_source = 'foreign' then ${SEAT_ABROAD_LABEL}::text else ${a}.seat_county end)`;
  if (role === "authority" || !filled) return sql`${a}.county`;
  if (role === "supplier") return firm;
  return sql`(case when ${role} = 'supplier' then ${firm} else ${a}.county end)`;
}

const cpvLike = (sql: DbSql, prefixes: readonly string[]) =>
  prefixes.map((p) => sql`d.cpv_code like ${p + "%"}`).reduce((a, b) => sql`${a} or ${b}`);

/**
 * The purchase kind on a CPV column (purchase.ts divisionKind, stat final
 * §3.3): works 45, services from 50, goods below 45 and 48–49. A record
 * without a code has no kind. `column` is d.cpv_code, or a rollup's.
 */
export function purchaseKindCond(sql: DbSql, kind: PurchaseKind, column: Fragment = sql`d.cpv_code`): Fragment {
  if (kind === "lucrari") return sql`${column} like '45%'`;
  if (kind === "servicii") return sql`${column} >= '50'`;
  return sql`(${column} < '45' or (${column} >= '48' and ${column} < '50'))`;
}

/** The procedure declared in SEAP (purchase.ts PROCEDURE_TYPES); "altele" is every other type, an empty one too. */
export function procedureCond(sql: DbSql, procedure: Procedure, column: Fragment = sql`d.procedure_type`): Fragment {
  if (procedure === "altele") return sql`not (coalesce(${column}, '') = any(${sql.array([...NAMED_PROCEDURE_TYPES])}::text[]))`;
  return sql`${column} = any(${sql.array([...PROCEDURE_TYPES[procedure]])}::text[])`;
}

/**
 * The size of the whole purchase (plan §4.1): a contract's whole value
 * (contract_value_full: never null, never under a share), a direct
 * acquisition's own. The sums stay on closing_value, the winner's share, so
 * nothing is counted twice. A union of both streams carries
 * contract_value_full only when asked (fullValueUnion: the slim union stays
 * index-only for every other aggregate).
 */
export function purchaseValueConds(ctx: Pick<PredicateCtx, "sql" | "plafond" | "purchaseValueMin" | "purchaseValueMax">): Fragment[] {
  const { sql } = ctx;
  const value: Fragment = ctx.plafond === "strict" ? sql`d.closing_value` : sql`coalesce(d.contract_value_full, d.closing_value)`;
  const parts: Fragment[] = [];
  if (ctx.purchaseValueMin !== null) parts.push(sql`${value} >= ${ctx.purchaseValueMin}::numeric`);
  if (ctx.purchaseValueMax !== null) parts.push(sql`${value} < ${ctx.purchaseValueMax}::numeric`);
  return parts;
}
/** A union of both streams must carry contract_value_full: the size is asked over the direct acquisitions and the contracts. */
export const fullValueUnion = (ctx: Pick<PredicateCtx, "plafond" | "purchaseValueMin" | "purchaseValueMax">): boolean =>
  ctx.plafond === "da-branch" && (ctx.purchaseValueMin !== null || ctx.purchaseValueMax !== null);

/**
 * The conditions on the record (d.* of a transaction mart, or of their union
 * with a `src` column), in a fixed order. `years: false` leaves the period out
 * (a trend adds its two years itself). The buyer's kind is on its ids
 * (authority_id, D1), so a trend's grouping, facts and sources read no names.
 * The comparison replaces the condition on its own role by both entities.
 */
export function rowPredicates(ctx: PredicateCtx, opts: { years?: boolean } = {}): Fragment[] {
  const { sql } = ctx;
  const parts: Fragment[] = [sql`d.closing_value > 0`];
  if (ctx.population) parts.push(populationSql(sql, ctx.population));
  if (ctx.plafond === "strict") parts.push(sql`d.closing_value <= ${DA_PLAFOND_RON}`);
  if (ctx.plafond === "da-branch") parts.push(sql`(d.src = 'contracts' or d.closing_value <= ${DA_PLAFOND_RON})`);
  if (ctx.cpvPrefixes.length > 0) parts.push(sql`(${cpvLike(sql, ctx.cpvPrefixes)})`);
  if (ctx.cpvExclude.length > 0) parts.push(sql`not (${cpvLike(sql, ctx.cpvExclude)})`);
  // The kind and the domain combine (kit §5.3): both conditions on the same code.
  if (ctx.purchaseKind) parts.push(purchaseKindCond(sql, ctx.purchaseKind));
  if (ctx.procedure) parts.push(procedureCond(sql, ctx.procedure));
  parts.push(...purchaseValueConds(ctx));
  if (ctx.county) parts.push(sql`d.county = ${ctx.county}`);
  if (ctx.kind) parts.push(authorityKindCond(sql, ctx.kindIds!, sql`d.authority_id`));
  const compare = ctx.comparison;
  if (ctx.authorityId && compare?.role !== "authority") parts.push(sql`d.authority_id = ${ctx.authorityId}`);
  if (ctx.supplierId && compare?.role !== "supplier") parts.push(sql`d.supplier_id = ${ctx.supplierId}`);
  if (compare) parts.push(compare.role === "authority"
    ? sql`d.authority_id in (${compare.focalId}, ${compare.compareId})`
    : sql`d.supplier_id in (${compare.focalId}, ${compare.compareId})`);
  if (ctx.uatSiruta !== null) parts.push(sql`d.authority_id = any(${sql.array(ctx.uatAuthorityIds)}::bigint[])`);
  if (ctx.singleBidder) parts.push(sql`d.is_single_bidder = true`);
  if (ctx.adminSupplierIds !== null) parts.push(sql`d.supplier_id = any(${sql.array(ctx.adminSupplierIds)}::bigint[])`);
  if (ctx.minEmployees !== null || ctx.maxEmployees !== null) parts.push(employeesCond(sql, ctx.minEmployees, ctx.maxEmployees));
  if (ctx.firmSeat) parts.push(firmSeatCond(sql, ctx.firmSeat, ctx.seatColumn));
  if (ctx.seatCounty) parts.push(seatCountyCond(sql, ctx.seatCounty, ctx.seatColumn));
  if (opts.years ?? true) {
    if (ctx.yearFrom !== null)
      parts.push(ctx.monthFrom !== null
        ? sql`substr(d.finalization_date, 1, 7) >= ${`${ctx.yearFrom}-${String(ctx.monthFrom).padStart(2, "0")}`}`
        : sql`substr(d.finalization_date, 1, 4) >= ${String(ctx.yearFrom)}`);
    if (ctx.yearTo !== null)
      parts.push(ctx.monthTo !== null
        ? sql`substr(d.finalization_date, 1, 7) <= ${`${ctx.yearTo}-${String(ctx.monthTo).padStart(2, "0")}`}`
        : sql`substr(d.finalization_date, 1, 4) <= ${String(ctx.yearTo)}`);
    if (idAnchored(ctx)) parts.push(...periodRange(sql, ctx));
  }
  // The evolution's same months (F3): every year cut to the window, as a trend's two years are.
  if (ctx.seriesMonths) parts.push(sql`substr(d.finalization_date, 6, 2) between ${mm(ctx.seriesMonths[0])} and ${mm(ctx.seriesMonths[1])}`);
  return parts;
}
const mm = (m: number) => String(m).padStart(2, "0");

/** A selection read from an (id, finalization_date) index: a named or compared entity, a locality, a person's firms, the institutions of a kind (D1). */
const idAnchored = (ctx: PredicateCtx) =>
  ctx.authorityId !== null || ctx.supplierId !== null || ctx.comparison !== null || ctx.uatSiruta !== null || ctx.adminSupplierIds !== null || ctx.kind !== null;

/**
 * The period again, as a range on the column itself, so the id indexes
 * (authority_id or supplier_id, finalization_date) bound the scan: substr()
 * hides the column from them, and a one-year comparison of two large firms
 * read all their 927k entries to keep 105k. Added beside substr(), not in its
 * place: on the column's `YYYY-MM-DD[ HH24:MI]` strings (and nulls) both select
 * the same rows, and substr() still decides any other shape. Only on
 * id-anchored selections: elsewhere no index leads with the date, and the
 * planner would only count the period twice in its estimates.
 */
function periodRange(sql: DbSql, ctx: PredicateCtx): Fragment[] {
  const parts: Fragment[] = [];
  const month = (year: number, m: number) => `${year}-${String(m).padStart(2, "0")}`;
  if (ctx.yearFrom !== null)
    parts.push(sql`d.finalization_date >= ${ctx.monthFrom !== null ? month(ctx.yearFrom, ctx.monthFrom) : String(ctx.yearFrom)}`);
  if (ctx.yearTo !== null)
    parts.push(sql`d.finalization_date < ${ctx.monthTo === null ? String(ctx.yearTo + 1)
      : ctx.monthTo === 12 ? month(ctx.yearTo + 1, 1) : month(ctx.yearTo, ctx.monthTo + 1)}`);
  return parts;
}

/**
 * A trend counts only its two years: the answer's two sums and its sources
 * (the period's place in rowPredicates), and with `months` (PredicateCtx.trendMonths)
 * the same months of each. Given the context of an id-anchored selection (the
 * sources pass it), also the span of the two years as a range on the column, as
 * periodRange: the (id, finalization_date) indexes bound the read, and the rows
 * are the same (a date of year A or B lies in [min, max + 1)). Without it a
 * kind's trend sources read the table.
 */
export function trendYearsPredicate(sql: DbSql, yearA: number, yearB: number, months: MonthWindow | null = null, ctx?: PredicateCtx): Fragment {
  const years: Fragment = ctx && idAnchored(ctx)
    ? sql`substr(d.finalization_date,1,4) in (${String(yearA)}, ${String(yearB)}) and d.finalization_date >= ${String(Math.min(yearA, yearB))} and d.finalization_date < ${String(Math.max(yearA, yearB) + 1)}`
    : sql`substr(d.finalization_date,1,4) in (${String(yearA)}, ${String(yearB)})`;
  if (!months) return years;
  const mm = (m: number) => String(m).padStart(2, "0");
  return sql`${years} and substr(d.finalization_date,6,2) between ${mm(months[0])} and ${mm(months[1])}`;
}

/** A trend's options as the engine applies them (plan §3; trend final §3.1, §3.8, §3.9). */
export interface TrendGroup {
  /** "all" when absent: today's answer, every change by its size in lei. */
  change: TrendChange;
  order: "lei" | "percent";
  /** The order in percent ranks only the growths from at least this much in year A. */
  minBase: number | null;
  /** Of the new ones, only those whose first record in the archive is in year B. */
  firstOnly: boolean;
}
export function trendGroupOf(spec: Pick<AskSpec, "trend">): TrendGroup {
  const t = spec.trend ?? {};
  const order = t.order ?? "lei";
  return { change: t.change ?? "all", order, minBase: order === "percent" ? t.minBase ?? DEFAULT_TREND_MIN_BASE : null, firstOnly: t.firstOnly === true };
}
/** Today's list: no group, no other order. */
export const isEveryChange = (group: TrendGroup): boolean => group.change === "all" && group.order === "lei" && !group.firstOnly;

/**
 * The group a trend lists, over the two sums of each entity or county (`va`,
 * `vb`, aggregates of the grouped rows; trend final §3.1), as a HAVING, and
 * the order of its list. Every entity has records in one of the two years, so
 * growths (vA > 0, vB > vA), new (vA = 0, vB > 0), decreases (vB > 0, vB < vA),
 * gone (vA > 0, vB = 0) and the equal ones partition it. `id` and `role` name
 * the grouped entity for `firstOnly` (marts.entity_profile.first_activity in year B).
 * The partition of the answer (trendPartition, live or over a rollup) and the sources (runRows) share it.
 */
export function trendGroupSql(sql: DbSql, va: Fragment, vb: Fragment, group: TrendGroup,
  first?: { id: Fragment; role: "authority" | "supplier"; yearB: number }): { having: Fragment | null; order: Fragment } {
  const parts: Fragment[] = [];
  let order: Fragment;
  switch (group.change) {
    case "up":
      parts.push(sql`${va} > 0`, sql`${vb} > ${va}`);
      if (group.order === "percent") parts.push(sql`${va} >= ${group.minBase ?? DEFAULT_TREND_MIN_BASE}`);
      order = group.order === "percent" ? sql`${vb} / ${va}` : sql`${vb} - ${va}`;
      break;
    case "new": parts.push(sql`${va} = 0`, sql`${vb} > 0`); order = vb; break;
    case "down": parts.push(sql`${vb} > 0`, sql`${vb} < ${va}`); order = sql`${va} - ${vb}`; break;
    case "gone": parts.push(sql`${va} > 0`, sql`${vb} = 0`); order = va; break;
    case "all": order = sql`abs(${vb} - ${va})`; break;
  }
  if (group.firstOnly && first) parts.push(sql`${first.id} in (
    select ep.entity_id from marts.entity_profile ep
    where ep.role = ${first.role} and substr(ep.first_activity, 1, 4) = ${String(first.yearB)}
  )`);
  return { having: parts.length ? andAll(sql, parts) : null, order };
}

/** Lei per inhabitant: only the administrations with a strict RPL 2021 population (per-capita.ts), in the ranking and its sources. */
export const perCapitaPredicate = (sql: DbSql, ids: readonly string[]): Fragment =>
  sql`d.authority_id = any(${sql.array([...ids])}::bigint[])`;

/**
 * Conditions computed over the selection grouped by entity, applied to its
 * records: today the record threshold (minimumRecords), the institutions (or
 * firms) with at least N records among `source` rows matching `where`.
 */
export function groupPredicates(ctx: PredicateCtx, source: Fragment, where: Fragment): Fragment[] {
  const minimum = ctx.minimumRecords;
  if (!minimum) return [];
  const { sql } = ctx;
  const party = minimum.role === "authority" ? sql`d.authority_id` : sql`d.supplier_id`;
  return [sql`${party} in (select ${party} from ${source} d where ${where} and ${party} is not null group by ${party} having count(*) >= ${minimum.count})`];
}

/**
 * The population of historical risk profiles (marts.entity_flags ef): the
 * role, the profiles with enough direct acquisitions, the entity's own county
 * and, for institutions, the locality and the kind. A firm's county is its seat
 * (F4, owner-seat-switch): seatCounty, or a link's county, on the firm's
 * profile row once the seat column is filled; before, entity_flags.county (the
 * SEAP county, as entity_profile.county).
 */
export function profilePredicates(ctx: PredicateCtx, role: "authority" | "supplier", minDas: number): Fragment[] {
  const { sql } = ctx;
  const parts: Fragment[] = [sql`ef.role = ${role}`, sql`ef.n_das >= ${minDas}`];
  const seat = role === "supplier" ? ctx.seatCounty ?? ctx.county : null;
  if (seat && ctx.seatColumn)
    parts.push(sql`ef.entity_id in (select ep.entity_id from marts.entity_profile ep where ep.role = 'supplier' and ${seatIn(sql, seat, true)})`);
  else if (seat) parts.push(sql`lower(unaccent(ef.county)) = ${fold(seat)}`);
  else if (ctx.county) parts.push(sql`lower(unaccent(ef.county)) = ${fold(ctx.county)}`);
  if (ctx.uatSiruta !== null && role === "authority") parts.push(sql`ef.entity_id = any(${sql.array(ctx.uatAuthorityIds)}::bigint[])`);
  if (ctx.kind && role === "authority") parts.push(authorityKindCond(sql, ctx.kindIds!, sql`ef.entity_id`));
  return parts;
}

/**
 * The same conditions as rowPredicates and groupPredicates, as text for the
 * "vezi interogarea (avansat)" toggle. Display only: execution always goes
 * through the parameterized fragments. `table` is the FROM of the text, which
 * the record threshold repeats.
 */
export function displayPredicates(ctx: PredicateCtx, table: string): string[] {
  const conds: string[] = ["closing_value > 0"];
  if (ctx.population) {
    const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
    conds.push(ctx.population.groups.map(group => "(" + group.conditions.map(c => {
      if ("value" in c) return `${c.field === "date" ? "substr(finalization_date, 1, 10)" : "closing_value"} ${c.op === "gte" ? ">=" : "<="} ${quote(c.value)}${c.field === "value" ? "::numeric" : ""}`;
      const column = c.field === "authority" ? "authority_id" : c.field === "supplier" ? "supplier_id" : c.field === "cpv" ? "cpv_code" : "lower(unaccent(county))";
      const match = c.field === "cpv" ? `(${c.values.map(v => `${column} like ${quote(v + "%")}`).join(" or ")})` : `${column} in (${c.values.map(v => quote(c.field === "county" ? fold(v) : v)).join(", ")})`;
      return `${c.op === "not_in" ? "not " : ""}coalesce(${match}, false)`;
    }).join(group.operator === "and" ? " and " : " or ") + ")").join(ctx.population.operator === "and" ? " and " : " or ").replace(/^(.+)$/s, "($1)"));
  }
  if (ctx.plafond === "strict")
    conds.push(`closing_value <= ${DA_PLAFOND_RON}  -- plafon plauzibilitate`);
  if (ctx.plafond === "da-branch")
    conds.push(
      `(src = 'contracts' or closing_value <= ${DA_PLAFOND_RON})  -- plafon doar pe achizițiile directe`,
    );
  if (ctx.cpvPrefixes.length > 0)
    conds.push("(" + ctx.cpvPrefixes.map((p) => `cpv_code like '${p}%'`).join(" or ") + ")");
  if (ctx.cpvExclude.length > 0)
    conds.push("not (" + ctx.cpvExclude.map((p) => `cpv_code like '${p}%'`).join(" or ") + ")  -- excluse din subiect");
  if (ctx.purchaseKind) {
    const kind = ctx.purchaseKind === "lucrari" ? "cpv_code like '45%'" : ctx.purchaseKind === "servicii" ? "cpv_code >= '50'" : "(cpv_code < '45' or (cpv_code >= '48' and cpv_code < '50'))";
    conds.push(`${kind}  -- doar ${PURCHASE_KIND_WORDS[ctx.purchaseKind].noun} (tipul din codul CPV)`);
  }
  if (ctx.procedure) {
    const quoted = (types: readonly string[]) => types.map((t) => `'${t}'`).join(", ");
    conds.push(ctx.procedure === "altele"
      ? `procedure_type not in (${quoted(NAMED_PROCEDURE_TYPES)})  -- ${PROCEDURE_WORDS.altele.via}, procedura declarată în SEAP`
      : `procedure_type in (${quoted(PROCEDURE_TYPES[ctx.procedure])})  -- procedura declarată în SEAP`);
  }
  if (ctx.purchaseValueMin !== null || ctx.purchaseValueMax !== null) {
    const value = ctx.plafond === "strict" ? "closing_value" : "coalesce(contract_value_full, closing_value)";
    const bounds = [ctx.purchaseValueMin !== null ? `${value} >= ${ctx.purchaseValueMin}` : null, ctx.purchaseValueMax !== null ? `${value} < ${ctx.purchaseValueMax}` : null];
    conds.push(`${bounds.filter(Boolean).join(" and ")}  -- ${valueWords({ purchaseValueMin: ctx.purchaseValueMin ?? undefined, purchaseValueMax: ctx.purchaseValueMax ?? undefined })}: valoarea întregii achiziții, nu cota câștigătorului`);
  }
  if (ctx.county) conds.push(`unaccent(county) ilike '${fold(ctx.county)}'`);
  if (ctx.kind) conds.push(`authority_id in (…)  -- doar ${KIND_LABEL[ctx.kind]}: ${countWords(ctx.kindIds!.length, "instituție", "instituții")} (${KIND_SOURCE[ctx.kind]})`);
  const compare = ctx.comparison;
  if (ctx.authorityId) conds.push(compare ? `authority_id in (${ctx.authorityId}, ${compare.compareId})` : `authority_id = ${ctx.authorityId}`);
  if (ctx.supplierId) conds.push(compare && !ctx.authorityId ? `supplier_id in (${ctx.supplierId}, ${compare.compareId})` : `supplier_id = ${ctx.supplierId}`);
  if (ctx.uatSiruta !== null)
    conds.push(
      `authority_id in (${ctx.uatAuthorityIds.join(", ")})  -- administrația locală a UAT ${ctx.uatSiruta} (asociere strictă)`,
    );
  if (ctx.singleBidder) conds.push("is_single_bidder = true  -- o singură ofertă (din TED)");
  if (ctx.minEmployees !== null || ctx.maxEmployees !== null) {
    const b =
      ctx.minEmployees !== null && ctx.maxEmployees !== null
        ? `between ${ctx.minEmployees} and ${ctx.maxEmployees}`
        : ctx.minEmployees !== null
          ? `>= ${ctx.minEmployees}`
          : `<= ${ctx.maxEmployees}`;
    conds.push(
      `supplier_id in (select entity_id from marts.entity_profile\n` +
        `                where role = 'supplier' and employees ${b})  -- bilanț MF, ultimul depus`,
    );
  }
  if (ctx.adminSupplierIds !== null)
    conds.push(`supplier_id in (firmele reprezentate de persoana aleasă)  -- ONRC`);
  // F4: the firm's seat, on its profile (seatOf): the column of the marts build, or the SEAP county before it.
  const seatSource = ctx.seatColumn ? "sediul: ultima înmatriculare ONRC, apoi SEAP" : "sediul: județul din SEAP";
  if (ctx.firmSeat === "abroad")
    conds.push(`supplier_id in (select entity_id from marts.entity_profile\n                where role = 'supplier' and ${ctx.seatColumn ? "seat_source = 'foreign'" : "is_foreign"})  -- firme cu sediul în străinătate`);
  else if (ctx.firmSeat)
    conds.push(`sediul_firmei ${ctx.firmSeat === "same" ? "=" : "<>"} county  -- firme cu sediul ${ctx.firmSeat === "same" ? "în județul instituției" : "în alt județ"} (${seatSource})`);
  if (ctx.seatCounty)
    conds.push(`supplier_id in (select entity_id from marts.entity_profile\n                where role = 'supplier' and ${ctx.seatColumn ? `seat_county = '${ctx.seatCounty.replaceAll("'", "''")}'` : `unaccent(county) ilike '${fold(ctx.seatCounty)}'`})  -- ${seatSource}`);
  if (ctx.yearFrom !== null) {
    if (ctx.monthFrom !== null)
      conds.push(`luna >= '${ctx.yearFrom}-${String(ctx.monthFrom).padStart(2, "0")}'`);
    else conds.push(`an >= ${ctx.yearFrom}`);
  }
  if (ctx.yearTo !== null) {
    if (ctx.monthTo !== null)
      conds.push(`luna <= '${ctx.yearTo}-${String(ctx.monthTo).padStart(2, "0")}'`);
    else conds.push(`an <= ${ctx.yearTo}`);
  }
  if (ctx.trendMonths) conds.push(`luna between '${mm(ctx.trendMonths[0])}' and '${mm(ctx.trendMonths[1])}'  -- aceleași luni în ambii ani`);
  if (ctx.seriesMonths) conds.push(`luna between '${mm(ctx.seriesMonths[0])}' and '${mm(ctx.seriesMonths[1])}'  -- aceleași luni în fiecare an`);
  if (ctx.minimumRecords) {
    const id = ctx.minimumRecords.role === "authority" ? "authority_id" : "supplier_id";
    conds.push(`${id} in (select ${id} from ${table}\n  where ${conds.join("\n  and ")}\n  group by ${id} having count(*) >= ${ctx.minimumRecords.count})`);
  }
  return conds;
}
