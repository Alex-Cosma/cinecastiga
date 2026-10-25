import type { DbSql } from "@seap/db";
import type { Grounding } from "./ground";
import type { MinimumRecords, PopulationCondition, QueryPopulation } from "./population";
import { namedKind, type AskSpec, type AuthorityKind, type Dataset } from "./spec";
import { authorityKindCond, KIND_LABEL, KIND_SOURCE } from "./authority-kind";
import { countWords } from "./answer-text";

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
  /** "Conduse de X": supplier ids of the person's firms (ONRC reps). */
  adminSupplierIds: string[] | null;
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
  window: { dataset: Dataset; yearFrom: number | null; yearTo: number | null; kindIds?: readonly string[] | null },
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
    adminSupplierIds: grounding.admin ? grounding.admin.supplierIds : null,
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

/** Supplier size bound → semi-join on the entity_profile employee snapshot (`column`: the firm id of the rows, or of a rollup). */
export function employeesCond(sql: DbSql, min: number | null, max: number | null, column: Fragment = sql`d.supplier_id`): Fragment {
  const bounds =
    min !== null && max !== null
      ? sql`ep.employees between ${min} and ${max}`
      : min !== null
        ? sql`ep.employees >= ${min}`
        : sql`ep.employees <= ${max!}`;
  return sql`${column} in (
    select ep.entity_id from marts.entity_profile ep
    where ep.role = 'supplier' and ep.employees is not null and ${bounds}
  )`;
}

const cpvLike = (sql: DbSql, prefixes: readonly string[]) =>
  prefixes.map((p) => sql`d.cpv_code like ${p + "%"}`).reduce((a, b) => sql`${a} or ${b}`);

/**
 * The conditions on the record (d.* of a transaction mart, or of their union
 * with a `src` column), in a fixed order. `years: false` leaves the period out
 * (a trend adds its two years itself). The comparison replaces the condition
 * on its own role by both entities.
 */
export function rowPredicates(ctx: PredicateCtx, opts: { years?: boolean } = {}): Fragment[] {
  const { sql } = ctx;
  const parts: Fragment[] = [sql`d.closing_value > 0`];
  if (ctx.population) parts.push(populationSql(sql, ctx.population));
  if (ctx.plafond === "strict") parts.push(sql`d.closing_value <= ${DA_PLAFOND_RON}`);
  if (ctx.plafond === "da-branch") parts.push(sql`(d.src = 'contracts' or d.closing_value <= ${DA_PLAFOND_RON})`);
  if (ctx.cpvPrefixes.length > 0) parts.push(sql`(${cpvLike(sql, ctx.cpvPrefixes)})`);
  if (ctx.cpvExclude.length > 0) parts.push(sql`not (${cpvLike(sql, ctx.cpvExclude)})`);
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
  return parts;
}

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
 * A trend counts only its two years: the answer's two sums and its sources (the period's place in rowPredicates).
 * Given the context of an id-anchored selection (the sources pass it), also the span of the two years as a
 * range on the column, as periodRange: the (id, finalization_date) indexes bound the read, and the rows are
 * the same (a date of year A or B lies in [min, max + 1)). Without it a kind's trend sources read the table.
 */
export const trendYearsPredicate = (sql: DbSql, yearA: number, yearB: number, ctx?: PredicateCtx): Fragment => {
  const years: Fragment = sql`substr(d.finalization_date,1,4) in (${String(yearA)}, ${String(yearB)})`;
  return ctx && idAnchored(ctx)
    ? sql`${years} and d.finalization_date >= ${String(Math.min(yearA, yearB))} and d.finalization_date < ${String(Math.max(yearA, yearB) + 1)}`
    : years;
};

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
 * (a firm's seat on firm profiles) and, for institutions, the locality and the kind.
 */
export function profilePredicates(ctx: PredicateCtx, role: "authority" | "supplier", minDas: number): Fragment[] {
  const { sql } = ctx;
  const parts: Fragment[] = [sql`ef.role = ${role}`, sql`ef.n_das >= ${minDas}`];
  if (ctx.county) parts.push(sql`lower(unaccent(ef.county)) = ${fold(ctx.county)}`);
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
  if (ctx.county) conds.push(`unaccent(county) ilike '${fold(ctx.county)}'`);
  if (ctx.kind) conds.push(`authority_id in (…)  -- doar ${KIND_LABEL[ctx.kind]}: ${countWords(ctx.kindIds!.length, "instituție", "instituții")} (${KIND_SOURCE[ctx.kind]})`);
  const compare = ctx.comparison;
  if (ctx.authorityId) conds.push(compare ? `authority_id in (${ctx.authorityId}, ${compare.compareId})` : `authority_id = ${ctx.authorityId}`);
  if (ctx.supplierId) conds.push(compare && !ctx.authorityId ? `supplier_id in (${ctx.supplierId}, ${compare.compareId})` : `supplier_id = ${ctx.supplierId}`);
  if (ctx.uatSiruta !== null)
    conds.push(
      `authority_id in (${ctx.uatAuthorityIds.join(", ")})  -- administrația locală a UAT ${ctx.uatSiruta} (asociere strictă)`,
    );
  if (ctx.singleBidder) conds.push("is_single_bidder = true  -- un singur ofertant (din TED)");
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
  if (ctx.minimumRecords) {
    const id = ctx.minimumRecords.role === "authority" ? "authority_id" : "supplier_id";
    conds.push(`${id} in (select ${id} from ${table}\n  where ${conds.join("\n  and ")}\n  group by ${id} having count(*) >= ${ctx.minimumRecords.count})`);
  }
  return conds;
}
