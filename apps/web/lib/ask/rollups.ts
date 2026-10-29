import type { DbSql } from "@seap/db";
import type { MinimumRecords, QueryPopulation } from "./population";
import type { ScatterDensity, TableSort } from "./compile";
import { AUTHORITY_KINDS, type AuthorityKind, type FirmSeat } from "./spec";
import { authorityKindCond } from "./authority-kind";
import { employeesCond, firmSeatCond, ownCountySql, purchaseKindCond, seatCountyCond } from "./predicates";
import type { Procedure, PurchaseKind } from "./purchase";
import { trendChannelColumns } from "./trend-partition";

/**
 * Answers from the rollups of the nightly build (packages/db/src/ask-rollups.ts)
 * for the questions that otherwise group the 20M-row transaction marts:
 * national and county trends, rankings with a kind, size, exclusion or
 * minimum-records condition, the paged national ranking, breakdowns, and
 * totals, years and counties of those selections. runSpec and runRows call
 * them once rollupsReady() finds the tables (planRollup decides which, or why
 * none): each function returns the rows of the live query it replaces, in the
 * same order and with the same types, and rollups.integration.test.ts proves
 * equality with the live queries on a fixture.
 *
 * Exactness rests on two properties of the marts, checked on the local copy
 * on 24 October 2026 (rollups.integration.test.ts keeps both on a fixture):
 * - every rollup row is a group of exactly the rows an Ask aggregate counts
 *   (closing_value > 0; DAs up to the 2M lei analysis ceiling, which binds
 *   every DA aggregate; contracts after their 1 bn ceiling), with exact sums;
 * - an id has one name in the marts and it equals entity_profile.name_display
 *   (182,687 ids, 0 differences), so partner names are attached after
 *   aggregation; the authority kind is the live filter's own list of ids
 *   (authority-kind.ts, D1), applied to the rollup's authority id.
 *
 * What the rollups cannot answer (the planner returns the reason and the
 * engine runs its live query): months, CPV together with an entity condition
 * or an entity ranking, a single bidder, a named authority, firm, locality or
 * administrator (their indexes already answer in milliseconds), population
 * conditions other than excluding authorities or firms, per-capita rankings,
 * name or county sorts on a cross-role selection, and any condition the
 * planner does not know (it fails closed).
 */

type Fragment = ReturnType<DbSql>;
type Role = "authority" | "supplier";

/**
 * The conditions of a question, as the planner reads them: the fields of
 * PredicateCtx (lib/ask/predicates.ts of the registry stage) without `sql`,
 * so the wiring passes predicateContext(…) unchanged. A key the planner does
 * not know refuses the rollups when it holds a condition (planRollup), so a
 * filter added to the context later falls back to the live query instead of
 * being dropped.
 */
export interface RollupCtx {
  /** "da-branch" = both channels, "strict" = direct acquisitions, "none" = contracts. */
  plafond: "none" | "strict" | "da-branch";
  population: QueryPopulation | null;
  minimumRecords: MinimumRecords | null;
  cpvPrefixes: readonly string[];
  cpvExclude: readonly string[];
  /** Canonical buyer county (d.county). */
  county: string | null;
  kind: AuthorityKind | null;
  /** The institutions of that kind (authorityKindIds). */
  kindIds: readonly string[] | null;
  authorityId: string | null;
  supplierId: string | null;
  /** Locality scope (grounding.uat), null when absent; its authority ids. */
  uatSiruta: number | null;
  uatAuthorityIds: readonly string[];
  singleBidder: boolean;
  minEmployees: number | null;
  maxEmployees: number | null;
  /** After the clamp to the archive (null = every year). */
  yearFrom: number | null;
  yearTo: number | null;
  monthFrom: number | null;
  monthTo: number | null;
  /** trend: the same months of both years, null for whole years. */
  trendMonths: readonly [number, number] | null;
  /** timeseries: the same months of every year (F3); agg_months answers it (series-rollups.ts), these rollups do not. */
  seriesMonths: readonly [number, number] | null;
  adminSupplierIds: readonly string[] | null;
  comparison: { role: Role; focalId: string | null; compareId: string | null } | null;
  /** F3: the kind from the CPV code (a condition on the code, like the domain's); the procedure and the size are not in the rollups. */
  purchaseKind: PurchaseKind | null;
  procedure: Procedure | null;
  purchaseValueMin: number | null;
  purchaseValueMax: number | null;
  /** F4: the seat of the rows' firm against their buyer county, and the firm's own county (on the rollup's firm id and county). */
  firmSeat: FirmSeat | null;
  seatCounty: string | null;
  /** The seat column is filled (no condition: which column the two keys read). */
  seatColumn: boolean;
  /** F4: the shared clients of two compared firms (the pre-step P of „Doar clienții comuni”); a comparison has its own queries. */
  shared: readonly string[] | null;
}

/**
 * Every key of RollupCtx (and `sql` of PredicateCtx, which is no condition).
 * planRollup translates or refuses each of these by name; any other key holding
 * a condition refuses the rollups. The test walks this list.
 */
export const ROLLUP_CTX_KEYS = [
  "sql", "plafond", "population", "minimumRecords", "cpvPrefixes", "cpvExclude", "county", "kind", "kindIds",
  "authorityId", "supplierId", "uatSiruta", "uatAuthorityIds", "singleBidder", "minEmployees", "maxEmployees",
  "yearFrom", "yearTo", "monthFrom", "monthTo", "trendMonths", "seriesMonths", "adminSupplierIds", "comparison",
  "purchaseKind", "procedure", "purchaseValueMin", "purchaseValueMax", "firmSeat", "seatCounty", "seatColumn", "shared",
] as const satisfies readonly ("sql" | keyof RollupCtx)[];
const KNOWN_KEYS = new Set<string>(ROLLUP_CTX_KEYS);

/** A context value that restricts the selection: not null, undefined, false or an empty list. */
const holdsCondition = (value: unknown) =>
  value !== null && value !== undefined && value !== false && !(Array.isArray(value) && value.length === 0);

const DATASET = { "da-branch": "all", strict: "da", none: "contracts" } as const;

/** What the block groups by: an entity role (table/trend), county, the channel/year/county of a total, or CPV stems. */
export type RollupNeed = { by: Role } | { by: "county" } | { by: "total" } | { by: "cpv" };

/**
 * entityMonth: agg_entity_month, the entity rollup with the month, for a trend's same months (F2);
 * countyMonth: agg_county_month, every row by county and month, for the county trend on the same months.
 */
export type RollupSource = { table: "entity"; role: Role } | { table: "entityMonth"; role: Role } | { table: "countyMonth" } | { table: "pair" } | { table: "cpv" };

/** The selection, in the terms of the rollup columns. */
export interface RollupFilters {
  dataset: "all" | "da" | "contracts";
  yearFrom: number | null;
  yearTo: number | null;
  county: string | null;
  cpvPrefixes: readonly string[];
  cpvExclude: readonly string[];
  /** The purchase kind on the code (purchaseKindCond on agg_cpv_year.cpv_code). */
  purchaseKind: PurchaseKind | null;
  /** The buyer's kind and its institutions (authorityKindCond on the rollup's authority id). */
  kind: AuthorityKind | null;
  kindIds: readonly string[] | null;
  employees: { min: number | null; max: number | null } | null;
  /** F4: the firm's seat (firmSeatCond, seatCountyCond) on the rollup's firm id, against its buyer county. */
  seat: { firmSeat: FirmSeat | null; county: string | null; filled: boolean } | null;
  /** Explicit exclusions (population not_in); unknown ids are kept, as in populationSql. */
  excludeAuthorities: readonly string[];
  excludeSuppliers: readonly string[];
  minimum: MinimumRecords | null;
  /** A trend's same months of both years (entityMonth and countyMonth only). */
  months: readonly [number, number] | null;
}

export type RollupPlan = { source: RollupSource; filters: RollupFilters } | { reason: string };

/** Excluded ids per role, when the population is only "and" groups of authority/firm exclusions. */
function populationExclusions(population: QueryPopulation | null): { authority: string[]; supplier: string[] } | null {
  const out = { authority: [] as string[], supplier: [] as string[] };
  if (!population) return out;
  // A one-condition group reads the same under either operator.
  if (population.operator !== "and" && population.groups.length > 1) return null;
  for (const group of population.groups) {
    if (group.operator !== "and" && group.conditions.length > 1) return null;
    for (const c of group.conditions) {
      if ((c.field !== "authority" && c.field !== "supplier") || c.op !== "not_in") return null;
      out[c.field].push(...c.values);
    }
  }
  return out;
}

/**
 * The ids a population leaves out when it only leaves out entities of `role`
 * ("Scoate din calcul" on a ranking of that role, F4; labelled or not), else
 * null: any other condition, another role, a list of included ids, "or"
 * between groups that holds more than one.
 */
export function sameRoleExclusions(population: QueryPopulation | undefined | null, role: Role): string[] | null {
  if (!population) return null;
  const excluded = populationExclusions(population);
  if (!excluded || excluded[role === "authority" ? "supplier" : "authority"].length || !excluded[role].length) return null;
  return [...new Set(excluded[role])];
}

/**
 * Which rollup answers the selection, or why none does. Rules: CPV only on
 * agg_cpv_year and only without entity conditions; a ranking of one role with
 * conditions on that role only (and the buyer county, years, channel) on
 * agg_entity_year; any condition or threshold on the other role on
 * agg_pair_year; totals without entity conditions on agg_cpv_year. A total
 * with an exclusion keeps rows whose id is unknown, so it needs the pair rows.
 * A trend's same months (trendMonths) only on agg_entity_month, when it is
 * built (`months`: monthRollupReady), for one role with conditions on that role
 * only and no CPV or threshold; any other month window stays live.
 * Fails closed: a context key outside ROLLUP_CTX_KEYS that holds a condition
 * (a filter of a later stage) returns its name as the reason.
 */
export function planRollup(ctx: RollupCtx, need: RollupNeed, opts: { months?: boolean } = {}): RollupPlan {
  for (const [key, value] of Object.entries(ctx))
    if (!KNOWN_KEYS.has(key) && holdsCondition(value)) return { reason: `${key}: a condition the rollups do not know` };
  if (ctx.comparison) return { reason: "comparison: its own queries (compareParties …)" };
  if (ctx.shared) return { reason: "shared clients: the pre-step P of a comparison" };
  if (ctx.monthFrom !== null || ctx.monthTo !== null) return { reason: "months: the rollups keep whole years" };
  if (ctx.trendMonths && !opts.months) return { reason: "months: agg_entity_month is not built" };
  if (ctx.seriesMonths) return { reason: "months: the same months of every year are on agg_months (series-rollups.ts)" };
  if (ctx.singleBidder) return { reason: "single bidder: not in the rollups" };
  // F3: the procedure and the whole value are columns of the contract rows the rollups do not keep.
  if (ctx.procedure) return { reason: "procedure: not in the rollups" };
  if (ctx.purchaseValueMin !== null || ctx.purchaseValueMax !== null) return { reason: "purchase value: the whole value is not in the rollups" };
  if (ctx.authorityId || ctx.supplierId || ctx.uatSiruta !== null || ctx.uatAuthorityIds.length > 0 || ctx.adminSupplierIds)
    return { reason: "named entity: its transaction index answers directly" };
  const dataset = DATASET[ctx.plafond];
  if (!dataset) return { reason: `plafond ${String(ctx.plafond)}: not in the rollups` };
  if (ctx.kind && (!(AUTHORITY_KINDS as readonly string[]).includes(ctx.kind) || !ctx.kindIds))
    return { reason: `kind ${ctx.kind}: no list of institutions` };
  const excluded = populationExclusions(ctx.population);
  if (!excluded) return { reason: "population: only exclusions of institutions or firms are in the rollups" };
  const employees = ctx.minEmployees !== null || ctx.maxEmployees !== null ? { min: ctx.minEmployees, max: ctx.maxEmployees } : null;
  // The seat is the firm's (its profile), compared with the row's buyer county: every source with a firm id has both.
  const seat = ctx.firmSeat || ctx.seatCounty ? { firmSeat: ctx.firmSeat, county: ctx.seatCounty, filled: ctx.seatColumn } : null;
  const filters: RollupFilters = {
    dataset, yearFrom: ctx.yearFrom, yearTo: ctx.yearTo, county: ctx.county,
    cpvPrefixes: ctx.cpvPrefixes, cpvExclude: ctx.cpvExclude, purchaseKind: ctx.purchaseKind, kind: ctx.kind, kindIds: ctx.kind ? ctx.kindIds : null,
    employees, seat, excludeAuthorities: excluded.authority, excludeSuppliers: excluded.supplier,
    minimum: ctx.minimumRecords, months: ctx.trendMonths,
  };
  const sides = new Set<Role>();
  if (filters.kind || filters.excludeAuthorities.length) sides.add("authority");
  if (filters.employees || filters.seat || filters.excludeSuppliers.length) sides.add("supplier");
  if (filters.minimum) sides.add(filters.minimum.role);
  // The purchase kind is a condition on the code, as the domain is: agg_cpv_year only.
  const cpv = filters.cpvPrefixes.length > 0 || filters.cpvExclude.length > 0 || filters.purchaseKind !== null;
  if (filters.months) {
    // Counties without an entity condition: agg_county_month; one role with conditions on that role: agg_entity_month.
    if (need.by === "county" && !cpv && !filters.minimum && sides.size === 0) return { source: { table: "countyMonth" }, filters };
    const role = need.by === "authority" || need.by === "supplier" ? need.by : null;
    if (!role || cpv || filters.minimum || [...sides].some((side) => side !== role))
      return { reason: "months: agg_entity_month holds one role and agg_county_month none, without CPV or a threshold" };
    return { source: { table: "entityMonth", role }, filters };
  }
  if (need.by === "cpv" || cpv) {
    if (need.by === "authority" || need.by === "supplier") return { reason: "CPV with an entity ranking: not in the rollups" };
    if (sides.size) return { reason: "CPV with an entity condition: not in the rollups" };
    return { source: { table: "cpv" }, filters };
  }
  if (need.by === "authority" || need.by === "supplier") {
    const only = [...sides].every((role) => role === need.by);
    return { source: only ? { table: "entity", role: need.by } : { table: "pair" }, filters };
  }
  if (sides.size === 0) return { source: { table: "cpv" }, filters };
  const [role] = [...sides];
  const keepsUnknown = filters.excludeAuthorities.length > 0 || filters.excludeSuppliers.length > 0;
  if (sides.size === 1 && !keepsUnknown) return { source: { table: "entity", role: role! }, filters };
  return { source: { table: "pair" }, filters };
}

/** Column of one role on a rollup source, or null when the source has none. */
function idColumn(sql: DbSql, source: RollupSource, role: Role, alias: string): Fragment | null {
  if (source.table === "cpv" || source.table === "countyMonth") return null;
  if (source.table === "entity" || source.table === "entityMonth") return source.role === role ? sql`${sql(alias)}.eid` : null;
  return role === "authority" ? sql`${sql(alias)}.authority_id` : sql`${sql(alias)}.supplier_id`;
}

function fromSource(sql: DbSql, source: RollupSource, alias: string): Fragment {
  const name = source.table === "entity" ? sql`marts.agg_entity_year` : source.table === "entityMonth" ? sql`marts.agg_entity_month`
    : source.table === "countyMonth" ? sql`marts.agg_county_month` : source.table === "pair" ? sql`marts.agg_pair_year` : sql`marts.agg_cpv_year`;
  return sql`${name} ${sql(alias)}`;
}

/**
 * The selection's predicates on a rollup alias, the live whereFrag translated
 * column by column. `years: false` leaves the year bounds out (trend reads its
 * two years itself).
 */
function rollupWhere(sql: DbSql, source: RollupSource, f: RollupFilters, alias: string, opts: { years?: boolean } = {}): Fragment {
  const p = (column: string) => sql`${sql(alias)}.${sql(column)}`;
  const parts: Fragment[] = [];
  if (source.table === "entity" || source.table === "entityMonth") parts.push(sql`${p("role")} = ${source.role}`);
  // The same months of both years: trendYearsPredicate on the rows.
  if (f.months) parts.push(sql`${p("m")} between ${String(f.months[0]).padStart(2, "0")} and ${String(f.months[1]).padStart(2, "0")}`);
  if (f.dataset !== "all") parts.push(sql`${p("src")} = ${f.dataset}`);
  if (opts.years !== false && f.yearFrom !== null) parts.push(sql`${p("y")} >= ${String(f.yearFrom)}`);
  if (opts.years !== false && f.yearTo !== null) parts.push(sql`${p("y")} <= ${String(f.yearTo)}`);
  if (f.county) parts.push(sql`${p("county")} = ${f.county}`);
  if (f.cpvPrefixes.length > 0)
    parts.push(sql`(${f.cpvPrefixes.map((x) => sql`${p("cpv_code")} like ${x + "%"}`).reduce((a, b) => sql`${a} or ${b}`)})`);
  if (f.cpvExclude.length > 0)
    parts.push(sql`not (${f.cpvExclude.map((x) => sql`${p("cpv_code")} like ${x + "%"}`).reduce((a, b) => sql`${a} or ${b}`)})`);
  if (f.purchaseKind) { const code: Fragment = sql`${sql(alias)}.cpv_code`; parts.push(purchaseKindCond(sql, f.purchaseKind, code)); }
  const authority = idColumn(sql, source, "authority", alias), supplier = idColumn(sql, source, "supplier", alias);
  // The live filter's list of institutions, on the rollup's authority id.
  if (f.kind) parts.push(authorityKindCond(sql, f.kindIds!, authority!));
  // The live employees condition, on the rollup's firm id.
  if (f.employees) parts.push(employeesCond(sql, f.employees.min, f.employees.max, supplier!));
  // The live seat conditions (F4), on the rollup's firm id and its buyer county.
  if (f.seat?.firmSeat) parts.push(firmSeatCond(sql, f.seat.firmSeat, f.seat.filled, { supplier: supplier!, county: sql`${sql(alias)}.county` }));
  if (f.seat?.county) parts.push(seatCountyCond(sql, f.seat.county, f.seat.filled, supplier!));
  if (f.excludeAuthorities.length)
    parts.push(sql`not (coalesce(${authority!} = any(${sql.array([...f.excludeAuthorities])}::bigint[]), false))`);
  if (f.excludeSuppliers.length)
    parts.push(sql`not (coalesce(${supplier!} = any(${sql.array([...f.excludeSuppliers])}::bigint[]), false))`);
  if (f.minimum) parts.push(minimumSemiJoin(sql, f, idColumn(sql, source, f.minimum.role, alias)!, `${alias}m`, opts));
  return parts.length ? parts.reduce((a, b) => sql`${a} and ${b}`) : sql`true`;
}

/**
 * A plan's rows for a caller that groups them its own way (the windows'
 * counts, facets.ts): the FROM and the selection's WHERE on `alias`, and the
 * columns it may group by besides src, y and county (every source has them):
 * each role's id, where the source has one, and agg_cpv_year's code.
 * `years: false` leaves the year bounds out (a trend's two years are the caller's).
 */
export function rollupRows(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters }, alias = "p", opts: { years?: boolean } = {}):
  { from: Fragment; where: Fragment; id: (role: Role) => Fragment | null; cpv: Fragment | null } {
  return {
    from: fromSource(sql, plan.source, alias),
    where: rollupWhere(sql, plan.source, plan.filters, alias, opts),
    id: (role) => idColumn(sql, plan.source, role, alias),
    cpv: plan.source.table === "cpv" ? sql`${sql(alias)}.cpv_code` : null,
  };
}

/**
 * minimumRecordsSql on the rollups: `target` (an id column) among the parties
 * with at least N records in the same selection (f without the threshold).
 */
function minimumSemiJoin(sql: DbSql, f: RollupFilters, target: Fragment, innerAlias: string, opts: { years?: boolean } = {}): Fragment {
  const { role, count } = f.minimum!;
  const everything = f.dataset === "all" && (opts.years === false || (f.yearFrom === null && f.yearTo === null)) && !f.county
    && !f.cpvPrefixes.length && !f.cpvExclude.length && !f.purchaseKind && !f.kind && !f.employees && !f.seat && !f.excludeAuthorities.length && !f.excludeSuppliers.length;
  if (everything && role === "supplier") {
    // Over every year and channel a firm's records are n_das + n_contracts of its profile
    // (equal for all 163,158 firms on 24 Oct 2026; not for institutions, whose profile
    // counts a contract once): the threshold list without grouping 1.7M rollup rows in
    // every parallel worker (national: 3.6 s at 4 MB work_mem, 0.96 s at 64 MB; now 0.36 s).
    return sql`${target} in (
      select ep.entity_id from marts.entity_profile ep
      where ep.role = 'supplier' and ep.n_das + ep.n_contracts >= ${count}
    )`;
  }
  const inner: RollupSource = [f.kind || f.excludeAuthorities.length ? "authority" : null, f.employees || f.seat || f.excludeSuppliers.length ? "supplier" : null]
    .every((side) => side === null || side === role) ? { table: "entity", role } : { table: "pair" };
  const party = idColumn(sql, inner, role, innerAlias)!;
  const innerWhere = rollupWhere(sql, inner, { ...f, minimum: null }, innerAlias, opts);
  return sql`${target} in (
    select ${party} from ${fromSource(sql, inner, innerAlias)}
    where ${innerWhere} and ${party} is not null
    group by ${party} having sum(${sql(innerAlias)}.n) >= ${count}
  )`;
}

/**
 * The record threshold of a plan as a condition on `column` of the live rows
 * (d.authority_id or d.supplier_id), for the sources and the CSV of a
 * thresholded question (runRows), whose rows cannot come from a rollup: it
 * replaces minimumRecordsSql, the second grouped scan of the union (over 20 s
 * nationally), by the same party list from the rollups. Null without a threshold.
 */
export function rollupMinimumCond(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters }, column: Fragment): Fragment | null {
  return plan.filters.minimum ? minimumSemiJoin(sql, plan.filters, column, "rm") : null;
}

/**
 * Rollups present. No migration creates them: buildAskRollups drops and
 * creates them in the transaction that rebuilds marts.da_transactions (the
 * transactions stage), from that table and the contract mart, so once they
 * exist they hold the current transaction marts. They are behind only where
 * agg_national and the other agg_* are too: the contracts of a marts stage run
 * alone, until the next transactions stage (the site is closed in between on
 * the nightly run). Cached for 10 minutes in the process (one database per
 * process), not per DbSql: postgres.js makes a new one for every transaction,
 * so a cache keyed on the transaction never hit. Call it with the pool, before
 * sql.begin.
 */
let ready: { ok: boolean; at: number } | null = null;
export async function rollupsReady(sql: DbSql): Promise<boolean> {
  if (ready && Date.now() - ready.at < 600_000) return ready.ok;
  const [row] = (await sql`
    select to_regclass('marts.agg_entity_year') is not null
       and to_regclass('marts.agg_pair_year') is not null
       and to_regclass('marts.agg_cpv_year') is not null ok
  `) as unknown as { ok: boolean }[];
  ready = { ok: Boolean(row?.ok), at: Date.now() };
  return ready.ok;
}
/**
 * agg_entity_month and agg_county_month present (F2) and of the same build as the yearly rollups.
 * Built with the three above by the same build, it is probed apart: a deploy
 * before the first build with it keeps the yearly rollups, and a trend on the
 * same months runs live until that build. The table alone proves nothing: a
 * build of the code before F2 (a revert) rebuilds the yearly rollups and
 * leaves the last F2 build's agg_entity_month behind. Only an F2 build writes
 * the days (d0) on agg_entity_year and agg_pair_year, in the same transaction
 * as agg_entity_month, so rollupDaysReady (d0 on all three) is the proof that
 * the four tables are of one build; without it the same months run live.
 */
let monthReady: { ok: boolean; at: number } | null = null;
export async function monthRollupReady(sql: DbSql): Promise<boolean> {
  if (monthReady && Date.now() - monthReady.at < 600_000) return monthReady.ok;
  const [row] = (await sql`select to_regclass('marts.agg_entity_month') is not null and to_regclass('marts.agg_county_month') is not null ok`) as unknown as { ok: boolean }[];
  monthReady = { ok: Boolean(row?.ok) && await rollupDaysReady(sql), at: Date.now() };
  return monthReady.ok;
}
/**
 * The first and last day (d0, d1) on the pair and entity rollups (F2): a trend
 * group's source drawer then totals its records from the answer's grouping.
 * Probed apart, as agg_entity_month: until the first build with them, the
 * drawer counts a group's records live.
 */
let daysReady: { ok: boolean; at: number } | null = null;
export async function rollupDaysReady(sql: DbSql): Promise<boolean> {
  if (daysReady && Date.now() - daysReady.at < 600_000) return daysReady.ok;
  const [row] = (await sql`
    select count(*) = 2 + (to_regclass('marts.agg_entity_month') is not null)::int ok
    from pg_attribute a
    where a.attname = 'd0' and not a.attisdropped
      and a.attrelid in (to_regclass('marts.agg_entity_year'), to_regclass('marts.agg_pair_year'), to_regclass('marts.agg_entity_month'))
  `) as unknown as { ok: boolean }[];
  daysReady = { ok: Boolean(row?.ok), at: Date.now() };
  return daysReady.ok;
}
/**
 * The covering id indexes of da_transactions carry sicap_da_id (F2 review,
 * TRANSACTION_MART_BUILD_INDEXES): a trend group's source page then takes its
 * rows' keys from the index, in any order and for any group size. Probed
 * apart: the nightly build makes them, so until the first build with this
 * code the page keeps its plans of before.
 */
let refReady: { ok: boolean; at: number } | null = null;
export async function coverRefReady(sql: DbSql): Promise<boolean> {
  if (refReady && Date.now() - refReady.at < 600_000) return refReady.ok;
  const [row] = (await sql`
    select count(*) = 2 ok
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) and a.attname = 'sicap_da_id'
    where i.indexrelid in (to_regclass('marts.da_tx_supplier_cover_idx'), to_regclass('marts.da_tx_authority_cover_idx'))
  `) as unknown as { ok: boolean }[];
  refReady = { ok: Boolean(row?.ok), at: Date.now() };
  return refReady.ok;
}
/** Tests only: forget the probes, so the next call reads the database. */
export function forgetRollupsReady(): void { ready = null; monthReady = null; daysReady = null; refReady = null; }

export interface RollupTableOpts {
  dim: Role;
  measure: "value" | "count";
  /** Paged mode (no topN): 10 rows a page and the number of ranked entities. */
  paged: boolean;
  topN: number;
  page: number;
  pageSize: number;
  sort?: TableSort;
  dir?: "asc" | "desc";
  /**
   * A condition on the grouped id (F3: the band of employees of a ranking of firms, table:employees-2): the
   * list keeps those ids, tv/tn/te stay the whole selection's and gv/gn/ge are the kept ones'.
   */
  keep?: (id: Fragment) => Fragment;
  /** The seat column is filled (mart-columns.ts): a firm's county is its seat (predicates.ts ownCountySql, F4). */
  seat: boolean;
}
export interface RollupTableRow { id: string; nm: string; co: string | null; v: string; n: string; tv?: string; tn?: string; te?: string; gv?: string; gn?: string; ge?: string }

/**
 * case "table", dim authority/supplier, value or count measure: the live
 * ranking (topg + entity_profile names) on a rollup. `total` is the paged
 * count (count(distinct id) live), null when not paged: on the value/count
 * path it is `te` of the first row (the ranked ids, counted by the same
 * query), read separately only for a page past the end. Name and county
 * sorts read the rollup's own names, so they need agg_entity_year.
 */
export async function rollupTable(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters }, o: RollupTableOpts):
  Promise<{ rows: RollupTableRow[]; total: number | null } | { reason: string }> {
  const { source, filters } = plan;
  const id = idColumn(sql, source, o.dim, "p");
  if (!id) return { reason: `the ${source.table} rollup has no ${o.dim} id` };
  const where = rollupWhere(sql, source, filters, "p");
  const limit = o.paged ? sql`limit ${o.pageSize} offset ${o.page * o.pageSize}` : sql`limit ${o.topN}`;
  const dir = o.dir === "asc" ? sql`asc nulls first` : sql`desc nulls last`;
  const order = o.sort ? dir : sql`desc`;
  const sortKey = o.sort ?? (o.measure === "count" ? "count" : "value");
  // The county beside each entity: an institution's own, a firm's seat (owner-seat-switch).
  const county = ownCountySql(sql, o.dim, o.seat);
  const count = async () => Number(((await sql`
    select count(distinct ${id}) t from ${fromSource(sql, source, "p")} where ${where} and ${id} is not null
  `) as unknown as { t: string }[])[0]?.t ?? 0);
  if (o.keep && (sortKey === "value" || sortKey === "count" || sortKey === "percap")) {
    const aggSort = sortKey === "count" ? sql`n` : sql`v`;
    const rows = (await sql`
      with g as (
        select ${id} id, sum(p.v) v, sum(p.n) n
        from ${fromSource(sql, source, "p")}
        where ${where} and ${id} is not null
        group by ${id}
      ), topg as (
        select g.id, g.v, g.n, sel.tv, sel.tn, sel.te, sum(g.v) over () gv, sum(g.n) over () gn, count(*) over () ge
        from g cross join (select coalesce(sum(v), 0) tv, coalesce(sum(n), 0) tn, count(*) te from g) sel
        where ${o.keep(sql`g.id`)}
        order by ${aggSort} ${order}, g.id
        ${limit}
      )
      select t.id, coalesce(max(ep.name_display), '(fără nume)') nm, max(${county}) co, t.v, t.n, t.tv, t.tn, t.te, t.gv, t.gn, t.ge
      from topg t
      left join marts.entity_profile ep on ep.entity_id = t.id and ep.role = ${o.dim}
      group by t.id, t.v, t.n, t.tv, t.tn, t.te, t.gv, t.gn, t.ge
      order by ${sortKey === "count" ? sql`t.n` : sql`t.v`} ${order}, t.id
    `) as unknown as RollupTableRow[];
    if (!o.paged) return { rows, total: null };
    const kept = async () => Number(((await sql`
      select count(*) t from (select ${id} id from ${fromSource(sql, source, "p")} where ${where} and ${id} is not null group by 1) g where ${o.keep!(sql`g.id`)}
    `) as unknown as { t: string }[])[0]?.t ?? 0);
    return { rows, total: rows[0]?.ge !== undefined ? Number(rows[0].ge) : await kept() };
  }
  if (sortKey === "value" || sortKey === "count" || sortKey === "percap") {
    const aggSort = sortKey === "count" ? sql`n` : sql`v`;
    const rows = (await sql`
      with topg as (
        select ${id} id, sum(p.v) v, sum(p.n) n,
               sum(sum(p.v)) over () tv,
               sum(sum(p.n)) over () tn,
               count(*) over () te
        from ${fromSource(sql, source, "p")}
        where ${where} and ${id} is not null
        group by ${id}
        order by ${aggSort} ${order}, ${id}
        ${limit}
      )
      select t.id, coalesce(max(ep.name_display), '(fără nume)') nm,
             max(${county}) co, t.v, t.n, t.tv, t.tn, t.te
      from topg t
      left join marts.entity_profile ep on ep.entity_id = t.id and ep.role = ${o.dim}
      group by t.id, t.v, t.n, t.tv, t.tn, t.te
      order by ${sortKey === "count" ? sql`t.n` : sql`t.v`} ${order}, t.id
    `) as unknown as RollupTableRow[];
    if (!o.paged) return { rows, total: null };
    return { rows, total: rows[0]?.te !== undefined ? Number(rows[0].te) : await count() };
  }
  if (source.table !== "entity") return { reason: "name and county sorts need the rollup's names (agg_entity_year)" };
  const sortFrag = sortKey === "name" ? sql`g.nm` : county;
  const rows = (await sql`
    with g as (
      select ${id} id, max(p.nm) nm, sum(p.v) v, sum(p.n) n
      from ${fromSource(sql, source, "p")}
      where ${where} and ${id} is not null
      group by ${id}
    )
    select g.id, g.nm, ${county} co, g.v, g.n, count(*) over () te
    from g
    left join marts.entity_profile ep on ep.entity_id = g.id and ep.role = ${o.dim}
    ${o.keep ? sql`where ${o.keep(sql`g.id`)}` : sql``}
    order by ${sortFrag} ${order}, g.id
    ${limit}
  `) as unknown as RollupTableRow[];
  // The ranked ids (the kept ones with a band) are counted by the same statement; a page past the end counts apart.
  const total = !o.paged ? null : rows[0]?.te !== undefined ? Number(rows[0].te) : o.keep ? Number(((await sql`
    select count(*) t from (select ${id} id from ${fromSource(sql, source, "p")} where ${where} and ${id} is not null group by 1) g where ${o.keep(sql`g.id`)}
  `) as unknown as { t: string }[])[0]?.t ?? 0) : await count();
  return { rows: rows.map(({ te: _te, ...row }) => row), total };
}

/** The precomputed national ranking holds the first 2,000 of each role by value and by records (transaction-marts.ts). */
const TOP_ENTITIES_KEPT = 2000;

/**
 * "Scoate din calcul" on the national ranking (plan §2.5, F4): every year, both
 * streams, some entities of the ranked role left out and nothing else. The
 * rows and totals rollupTable gives on agg_entity_year (exclusions.integration
 * .test.ts), without grouping it (0.38 s nationally):
 * - the rows: agg_top_entities without those ids, in its order;
 * - each id's own sum and records: its row there; outside it (smaller than the
 *   first 2,000 on both orders), `live` counts its records on its id index;
 * - the totals: agg_national less those sums and less the records without an
 *   id of the role (`live.unassigned`, on the id index: none on the local
 *   copy); the ranked entities: the role's profiles with a value (every id of
 *   the role in the records, nightly validate.ts; 19,529 institutions and
 *   163,158 firms locally), less the ids left out that have records.
 * Null when the first `topN` rows could lie past the precomputed ones.
 */
export async function rankedWithout(sql: DbSql, o: {
  dim: Role; ids: readonly string[]; measure: "value" | "count"; topN: number; seat: boolean;
  live: { own: (ids: readonly string[]) => Promise<{ id: string; v: string; n: string }[]>; unassigned: () => Promise<{ v: string; n: string }> };
}): Promise<RollupTableRow[] | null> {
  if (o.topN + o.ids.length > TOP_ENTITIES_KEPT) return null;
  const ids = sql.array([...o.ids]);
  const kept = (await sql`
    select eid::text id, v_plaf::text v, n_plaf::text n from marts.agg_top_entities where role = ${o.dim} and eid = any(${ids}::bigint[])
  `) as unknown as { id: string; v: string; n: string }[];
  const outside = o.ids.filter((id) => !kept.some((row) => row.id === id));
  const own = [...kept, ...(outside.length ? await o.live.own(outside) : [])].filter((row) => Number(row.n) > 0);
  const left = own.length;
  // The records no entity of the role holds are in agg_national, never in a ranking of that role.
  const none = await o.live.unassigned();
  if (Number(none.n) > 0) own.push({ id: "", ...none });
  const ord = o.measure === "count" ? sql`n_plaf desc, eid` : sql`v_plaf desc, eid`;
  // Their sums in numeric, as the rollup's window sums (an empty array has no type to bind).
  const ownRows = own.length
    ? sql`select * from unnest(${sql.array(own.map((row) => row.v))}::numeric[], ${sql.array(own.map((row) => row.n))}::bigint[])`
    : sql`select null::numeric, null::bigint where false`;
  return (await sql`
    with own(v, n) as (${ownRows}),
    sel as (
      select (select coalesce(sum(v_plaf), 0) from marts.agg_national) - (select coalesce(sum(v), 0) from own) tv,
             (select coalesce(sum(n_plaf), 0) from marts.agg_national) - (select coalesce(sum(n), 0) from own) tn,
             (select count(*) from marts.entity_profile ep where ep.role = ${o.dim} and ep.total_ron_split > 0) - ${left} te
    )
    select t.eid id, coalesce(ep.name_display, '(fără nume)') nm, ${ownCountySql(sql, o.dim, o.seat)} co, t.v_plaf v, t.n_plaf n, sel.tv, sel.tn, sel.te
    from (select eid, v_plaf, n_plaf from marts.agg_top_entities where role = ${o.dim} and not (eid = any(${ids}::bigint[])) order by ${ord} limit ${o.topN}) t
    left join marts.entity_profile ep on ep.entity_id = t.eid and ep.role = ${o.dim}
    cross join sel
    order by ${o.measure === "count" ? sql`t.n_plaf desc, t.eid` : sql`t.v_plaf desc, t.eid`}
  `) as unknown as RollupTableRow[];
}

/** case "table", dim county: the live county ranking on a rollup (every source has the buyer county). */
export async function rollupCountyTable(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters },
  o: Omit<RollupTableOpts, "dim" | "seat">): Promise<{ rows: { c: string; v: string; n: string }[]; total: number | null }> {
  const { source, filters } = plan;
  const where = rollupWhere(sql, source, filters, "p");
  const limit = o.paged ? sql`limit ${o.pageSize} offset ${o.page * o.pageSize}` : sql`limit ${o.topN}`;
  const dir = o.dir === "asc" ? sql`asc nulls first` : sql`desc nulls last`;
  const sortKey = o.sort ?? (o.measure === "count" ? "count" : "value");
  const sortFrag = sortKey === "count" ? sql`n` : sortKey === "name" || sortKey === "county" ? sql`c` : sql`v`;
  const cnt = o.paged
    ? ((await sql`select count(distinct p.county) t from ${fromSource(sql, source, "p")} where ${where} and p.county is not null`) as unknown as { t: string }[])
    : null;
  const rows = (await sql`
    select p.county c, coalesce(sum(p.v), 0) v, sum(p.n) n
    from ${fromSource(sql, source, "p")}
    where ${where} and p.county is not null
    group by 1
    order by ${sortFrag} ${o.sort ? dir : sql`desc`}, c
    ${limit}
  `) as unknown as { c: string; v: string; n: string }[];
  return { rows, total: cnt ? Number(cnt[0]?.t ?? 0) : null };
}

/**
 * case "trend": per entity (or county) the values of year A and year B, as the
 * grouped query trendPartition (trend-partition.ts) partitions: `select id, va,
 * vb … group by id`, the live query's groups once grouped, with each
 * channel's records, value and first and last day (trendChannelColumns): a
 * group's source drawer totals them instead of scanning its members' rows.
 * The days are null where the rollup has none yet (`days`: rollupDaysReady);
 * the drawer then counts the group live. Names and counties come after, from
 * entity_profile, for the shown rows only (as live).
 */
export function rollupTrendGrouped(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters },
  o: { dim: Role | "county"; yearA: number; yearB: number; days?: boolean }): { grouped: Fragment } | { reason: string } {
  const { source, filters } = plan;
  const where = rollupWhere(sql, source, filters, "p", { years: false });
  const a = String(o.yearA), b = String(o.yearB);
  const va: Fragment = sql`coalesce(sum(p.v) filter (where p.y = ${a}), 0)`, vb: Fragment = sql`coalesce(sum(p.v) filter (where p.y = ${b}), 0)`;
  const key: Fragment | null = o.dim === "county" ? sql`p.county` : idColumn(sql, source, o.dim, "p");
  if (!key) return { reason: `the ${source.table} rollup has no ${o.dim} id` };
  // agg_cpv_year keeps the whole first and last date (d0, d1); the pair and entity rollups the day.
  // agg_county_month is only built with its days, by the build that also writes them on the others.
  const day = (column: "d0" | "d1"): Fragment | null => source.table === "cpv" ? sql`left(p.${sql(column)}, 10) collate "C"`
    : o.days || source.table === "countyMonth" ? sql`p.${sql(column)}` : null;
  const first = day("d0"), last = day("d1");
  const channels = trendChannelColumns(sql, filters.dataset, (src) => ({
    n: sql`sum(p.n) filter (where p.src = ${src})`, v: sql`sum(p.v) filter (where p.src = ${src})`,
    first: first ? sql`min(${first}) filter (where p.src = ${src})` : null,
    last: last ? sql`max(${last}) filter (where p.src = ${src})` : null,
  }));
  return { grouped: sql`
    select ${key} id, ${va} va, ${vb} vb, ${channels}
    from ${fromSource(sql, source, "p")}
    where ${where} and ${key} is not null and p.y in (${a}, ${b})
    group by ${key}
  ` };
}

/**
 * case "breakdown": CPV stems of `stemLen` digits (the live stem rule), value
 * first, then the stem, as the live query.
 * Slicing into the top 8 and "other" stays in the engine.
 */
export async function rollupBreakdown(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters }, stemLen: number):
  Promise<{ rows: { stem: string; v: string; n: string }[] } | { reason: string }>;
/** By stem and channel (F3): the breakdown's channels come from the same pass (compile.ts breakdownStreams). */
export async function rollupBreakdown(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters }, stemLen: number, by: "src"):
  Promise<{ rows: { stem: string; src: "da" | "contracts"; v: string; n: string }[] } | { reason: string }>;
export async function rollupBreakdown(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters }, stemLen: number, by?: "src"):
  Promise<{ rows: { stem: string; src?: "da" | "contracts"; v: string; n: string }[] } | { reason: string }> {
  if (plan.source.table !== "cpv") return { reason: "breakdowns read agg_cpv_year only" };
  const where = rollupWhere(sql, plan.source, plan.filters, "p");
  const rows = (by === "src" ? await sql`
    select substr(p.cpv_code, 1, ${stemLen}) stem, p.src, coalesce(sum(p.v), 0) v, sum(p.n) n
    from marts.agg_cpv_year p
    where ${where} and p.cpv_code is not null
    group by 1, 2
  ` : await sql`
    select substr(p.cpv_code, 1, ${stemLen}) stem, coalesce(sum(p.v), 0) v, sum(p.n) n
    from marts.agg_cpv_year p
    where ${where} and p.cpv_code is not null
    group by 1 order by v desc, stem
  `) as unknown as { stem: string; src?: "da" | "contracts"; v: string; n: string }[];
  return { rows };
}

/** case "stat": per channel on "all" (only channels with rows, like the live group by), one row otherwise. */
export async function rollupStat(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters }):
  Promise<{ rows: { src?: "da" | "contracts"; v: string; n: string }[] }> {
  const where = rollupWhere(sql, plan.source, plan.filters, "p");
  const from = fromSource(sql, plan.source, "p");
  const rows = plan.filters.dataset === "all"
    ? await sql`select p.src, coalesce(sum(p.v), 0) v, sum(p.n) n from ${from} where ${where} group by p.src`
    : await sql`select coalesce(sum(p.v), 0) v, coalesce(sum(p.n), 0) n from ${from} where ${where}`;
  return { rows: rows as unknown as { src?: "da" | "contracts"; v: string; n: string }[] };
}

/** case "timeseries": per year, undated last (the engine keeps four-digit years only). */
export async function rollupTimeseries(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters }):
  Promise<{ rows: { y: string | null; v: string; n: string }[] }> {
  const where = rollupWhere(sql, plan.source, plan.filters, "p");
  const rows = (await sql`
    select p.y, coalesce(sum(p.v), 0) v, sum(p.n) n
    from ${fromSource(sql, plan.source, "p")} where ${where}
    group by 1 order by 1 limit 60
  `) as unknown as { y: string | null; v: string; n: string }[];
  return { rows };
}

/** case "map": per buyer county, the rows without one as c = null (the "unknown" line). */
export async function rollupMap(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters }):
  Promise<{ rows: { c: string | null; v: string; n: string }[] }> {
  const where = rollupWhere(sql, plan.source, plan.filters, "p");
  const rows = (await sql`
    select nullif(p.county, '') c, coalesce(sum(p.v), 0) v, sum(p.n) n
    from ${fromSource(sql, plan.source, "p")} where ${where}
    group by 1 order by v desc limit 200
  `) as unknown as { c: string | null; v: string; n: string }[];
  return { rows };
}

/**
 * The source drawer's totals (runRows `totals`: per state, records, value and
 * the first and last finalization date) of a selection without entity
 * conditions, from agg_cpv_year's d0/d1, when the drawer has no local filter
 * (search, channel, state): then fn/fv equal n/v. The state of a DA row is
 * 'Oferta acceptata' and of a contract null, as in the drawer's union, so the
 * groups are the channels. `block` adds the condition the drawer adds for its
 * block (map: a county; breakdown: a CPV code; timeseries: a dated row; a
 * county ranking: a county). A ranking of firms selected by an attribute of
 * the firm (`firms`: the seat, F4; the employees) reads agg_entity_year: every
 * record of it has its firm; so do the other blocks but the breakdown, on
 * records selected by such an attribute. So does a ranking of firms or institutions
 * (`authorities`) with some of them left out ("Scoate din calcul", F4): the
 * rest of its role's rows. Other blocks (other rankings of entities, network,
 * profiles) are not served. sources:stat-da-2025: 1.57–2.19 s live, 0.05 s here.
 */
export async function rollupSourceTotals(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters },
  block: "stat" | "map" | "breakdown" | "timeseries" | "county" | "firms" | "authorities"):
  Promise<{ rows: { state: string | null; n: string; v: string; fn: string; fv: string; date_from: string | null; date_to: string | null }[] } | { reason: string }> {
  // A ranking of firms selected by an attribute of the firm (F4's seat, the employees), or of either role with some of
  // them left out: its records are those of the selected entities, every one with its entity, so agg_entity_year's rows
  // of that role (and their d0/d1) are exactly them.
  if (block === "authorities" && plan.source.table === "pair" && (plan.filters.seat || plan.filters.employees)) {
    // S5 (S4r-from-seat): a ranking of institutions buying from firms of a seat or a size — „De la cine › Ce fel de
    // firme”: every record kept has its firm and its buyer county, so the pairs' rows of agg_pair_year are exactly them
    // (national „în alt județ”, all years: 2.5 s live, the union with the seat's semi-join).
  } else if (block === "firms" || block === "authorities") {
    const role: Role = block === "firms" ? "supplier" : "authority";
    const out = role === "supplier" ? plan.filters.excludeSuppliers : plan.filters.excludeAuthorities;
    if (plan.source.table !== "entity" || plan.source.role !== role || !(out.length || role === "supplier" && (plan.filters.seat || plan.filters.employees)))
      return { reason: "a ranking's source totals read agg_entity_year when an attribute of the firm or an exclusion selects its entities" };
  } else if (plan.source.table === "entity") {
    // A total, a map, an evolution or the counties of records selected by an attribute of their firm (F4's seat, the
    // employees): each record kept has its firm, so the firms' rows of agg_entity_year are exactly them (national „În
    // alt județ”, all years: 2.2–3.6 s live, the union with the seat's semi-join; S4 verify).
    if (block === "breakdown" || plan.source.role !== "supplier" || !(plan.filters.seat || plan.filters.employees))
      return { reason: "source totals read agg_entity_year when an attribute of the firm selects the records" };
  } else if (plan.source.table !== "cpv") return { reason: "source totals read agg_cpv_year only" };
  const where = rollupWhere(sql, plan.source, plan.filters, "p");
  const own = block === "map" || block === "county" ? sql`p.county is not null`
    : block === "breakdown" ? sql`p.cpv_code is not null`
    : block === "timeseries" ? sql`p.y ~ '^[0-9]{4}$'` : sql`true`;
  const rows = (await sql`
    select case when p.src = 'da' then 'Oferta acceptata' end state,
           sum(p.n)::bigint::text n, coalesce(sum(p.v), 0)::text v, sum(p.n)::bigint::text fn, coalesce(sum(p.v), 0)::text fv,
           min(p.d0) date_from, max(p.d1) date_to
    from ${fromSource(sql, plan.source, "p")} where ${where} and ${own}
    group by p.src
  `) as unknown as { state: string | null; n: string; v: string; fn: string; fv: string; date_from: string | null; date_to: string | null }[];
  return { rows };
}

/**
 * The map's county card on the unfiltered maps (agg_map_county_top, built with
 * agg_map_county): per county, its total and the largest buyer and record of
 * one scope ('plaf' = the 2M DA ceiling, as every Ask aggregate) and channel.
 * Filtered maps compute the card live (or the buyer from agg_entity_year).
 */
export async function mapCountyTop(sql: DbSql, o: { scope: "plaf" | "all"; channel: "all" | "da" | "contracts" }):
  Promise<{ county: string; v: string; n: string; top_buyer_id: string | null; top_buyer_name: string | null; top_buyer_v: string | null;
    top_buyer_n: string | null; top_record_src: "da" | "contracts" | null; top_record_id: string | null; top_record_v: string | null }[]> {
  return (await sql`
    select county, v::text, n::text, top_buyer_id::text, top_buyer_name, top_buyer_v::text, top_buyer_n::text,
           top_record_src, top_record_id::text, top_record_v::text
    from marts.agg_map_county_top where scope = ${o.scope} and channel = ${o.channel} order by v desc, county
  `) as unknown as Awaited<ReturnType<typeof mapCountyTop>>;
}

/**
 * case "compare", three of its nine queries. The other four transaction
 * queries (streams, years, domains, joint) stay as they are: with
 * da_tx_supplier_cover_idx / da_tx_authority_cover_idx they read the index
 * only. These three needed a new shape:
 * - `top` and `shared` read partner names, so live they group the named union
 *   (txtAggNames), which no index covers, and read the heap of both entities
 *   (1.3–1.4 s each for SELGROS + DEDEMAN). Here they group the slim union
 *   (`source` = txtAgg) and the names of the shown partners come from
 *   entity_profile after.
 * - `parties` and `shared` counted distinct values, which sorts the 927k
 *   rows (0.62 s and 0.43 s on the covering index). `parties` groups twice
 *   instead (0.11 s); `shared` keeps partners with min(party) <> max(party),
 *   the same test as count(distinct party) = 2 because `where` always holds
 *   party in (focalId, compareId) (0.12 s).
 * Same rows, order and types as the live queries.
 */
export interface CompareQueryParts {
  /** txAggFragment(sql, dataset, false) of compile.ts. */
  source: Fragment;
  /** whereFrag({ comparison: true }) of compile.ts. */
  where: Fragment;
  focalRole: Role;
  focalId: string;
  compareId: string;
}
const partnerColumns = (sql: DbSql, focalRole: Role) => focalRole === "authority"
  ? { party: sql`d.authority_id`, other: sql`d.supplier_id`, otherRole: "supplier" as const }
  : { party: sql`d.supplier_id`, other: sql`d.authority_id`, otherRole: "authority" as const };

export async function compareParties(sql: DbSql, c: CompareQueryParts): Promise<{ id: string; n: number }[]> {
  const { party, other } = partnerColumns(sql, c.focalRole);
  return (await sql`
    select x.id, count(*)::int n from (
      select ${party}::text id, ${other} other
      from ${c.source} d where ${c.where} and ${other} is not null group by 1, 2) x
    group by x.id
  `) as unknown as { id: string; n: number }[];
}

/**
 * Two institutions compared (F4, final compare §4): their partners, as compareParties, and their suppliers' seat
 * against their county (firmSeatCond's classes, by value; `seat`: seatOf's columns on `ep`), from one grouping by
 * institution, supplier and county, read twice (S4 review: the seats were a second pass over both institutions'
 * records, +21% buffers on Cluj-Napoca and Timișoara).
 */
export async function compareInstitutionParties(sql: DbSql, c: CompareQueryParts, seat: { county: Fragment; foreign: Fragment }): Promise<{
  parties: { id: string; n: number }[]; seats: { id: string; cls: "same" | "other" | "abroad" | "unknown"; value: string }[];
}> {
  const rows = (await sql`
    with x as materialized (
      select d.authority_id::text id, d.supplier_id other, d.county, sum(d.closing_value) v
      from ${c.source} d where ${c.where} group by 1, 2, 3)
    select 'parties' k, x.id, null::text cls, count(distinct x.other)::text v from x where x.other is not null group by x.id
    union all
    select 'seats', x.id, case when ep.entity_id is null then 'unknown' when ${seat.foreign} then 'abroad'
                               when ${seat.county} is null or x.county is null then 'unknown'
                               when ${seat.county} = x.county then 'same' else 'other' end, sum(x.v)::text
    from x left join marts.entity_profile ep on ep.entity_id = x.other and ep.role = 'supplier'
    group by 2, 3
  `) as unknown as { k: "parties" | "seats"; id: string; cls: string | null; v: string }[];
  return {
    parties: rows.filter((r) => r.k === "parties").map((r) => ({ id: r.id, n: Number(r.v) })),
    seats: rows.filter((r) => r.k === "seats").map((r) => ({ id: r.id, cls: r.cls as "same" | "other" | "abroad" | "unknown", value: r.v })),
  };
}

export async function compareTopPartners(sql: DbSql, c: CompareQueryParts):
  Promise<{ id: string; other_id: string; name: string | null; value: string; n: number }[]> {
  const { party, other, otherRole } = partnerColumns(sql, c.focalRole);
  return (await sql`
    select x.id, x.other_id, ep.name_display name, x.value, x.n from (
      select ${party}::text id, ${other} other, ${other}::text other_id, sum(d.closing_value)::text value, count(*)::int n,
             row_number() over (partition by ${party} order by sum(d.closing_value) desc, ${other}) r
      from ${c.source} d where ${c.where} and ${other} is not null group by ${party}, ${other}) x
    left join marts.entity_profile ep on ep.entity_id = x.other and ep.role = ${otherRole}
    where x.r <= 4
    order by x.id, x.r
  `) as unknown as { id: string; other_id: string; name: string | null; value: string; n: number }[];
}

export async function compareSharedPartners(sql: DbSql, c: CompareQueryParts):
  Promise<{ other_id: string; name: string | null; value_a: string; n_a: number; value_b: string; n_b: number; total: number }[]> {
  const { party, other, otherRole } = partnerColumns(sql, c.focalRole);
  return (await sql`
    select x.other_id, ep.name_display name, x.value_a, x.n_a, x.value_b, x.n_b, x.total from (
      select ${other} other, ${other}::text other_id, sum(d.closing_value) sv,
             coalesce(sum(d.closing_value) filter (where ${party} = ${c.focalId}), 0)::text value_a, count(*) filter (where ${party} = ${c.focalId})::int n_a,
             coalesce(sum(d.closing_value) filter (where ${party} = ${c.compareId}), 0)::text value_b, count(*) filter (where ${party} = ${c.compareId})::int n_b,
             count(*) over ()::int total
      from ${c.source} d where ${c.where} and ${other} is not null
      group by ${other} having min(${party}) <> max(${party})
      order by sum(d.closing_value) desc, ${other} limit 30) x
    left join marts.entity_profile ep on ep.entity_id = x.other and ep.role = ${otherRole}
    order by x.sv desc, x.other
  `) as unknown as { other_id: string; name: string | null; value_a: string; n_a: number; value_b: string; n_b: number; total: number }[];
}

/**
 * case "scatter", the density layer: the live extent and cells queries with the
 * stored log_total_ron (the same expression, computed by PostgreSQL at insert)
 * instead of log() on every read; the live expression until 0085 is applied.
 * `where` is efWhere(role, RISK_MIN_DAS) of compile.ts; the cri condition is
 * added here, as live. `logTotal` is martColumns(pool).logTotal, read before
 * the answer's transaction.
 */
export async function scatterDensity(sql: DbSql, where: Fragment, logTotal: boolean, nx = 80, ny = 46): Promise<ScatterDensity | undefined> {
  const x = logTotal ? sql`ef.log_total_ron` : sql`log(greatest(coalesce(ef.total_ron, 0), 1))`;
  const ext = (await sql`
    select min(${x}) mn, max(${x}) mx, count(*) n
    from marts.entity_flags ef
    where ${where} and ef.cri is not null
  `) as unknown as { mn: string | null; mx: string | null; n: string }[];
  const popN = Number(ext[0]?.n ?? 0);
  if (popN === 0 || ext[0]!.mn === null) return undefined;
  const mn = Number(ext[0]!.mn);
  const mx = Math.max(Number(ext[0]!.mx), mn + 0.01);
  const cells = (await sql`
    select width_bucket(${x}, ${mn}, ${mx + 1e-9}, ${nx}) bx,
           width_bucket(coalesce(ef.cri, 0), 0, 1.0000001, ${ny}) by,
           count(*) n
    from marts.entity_flags ef
    where ${where} and ef.cri is not null
    group by 1, 2
  `) as unknown as { bx: number; by: number; n: string }[];
  return { minLog: mn, maxLog: mx, nx, ny, total: popN, cells: cells.map((c) => [Number(c.bx), Number(c.by), Number(c.n)]) };
}
