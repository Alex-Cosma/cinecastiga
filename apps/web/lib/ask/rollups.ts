import type { DbSql } from "@seap/db";
import type { MinimumRecords, QueryPopulation } from "./population";
import type { ScatterDensity, TableSort } from "./compile";
import type { AuthorityKind } from "./spec";
import { authorityKindCond, KIND_PATTERNS } from "./authority-kind";
import { employeesCond } from "./predicates";

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
 *   (182,687 ids, 0 differences), so the authority kind (authority-kind.ts,
 *   the one module of the live filter) is applied to entity_profile names and
 *   partner names are attached after aggregation.
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
  adminSupplierIds: readonly string[] | null;
  comparison: { role: Role; focalId: string | null; compareId: string | null } | null;
}

/**
 * Every key of RollupCtx (and `sql` of PredicateCtx, which is no condition).
 * planRollup translates or refuses each of these by name; any other key holding
 * a condition refuses the rollups. The test walks this list.
 */
export const ROLLUP_CTX_KEYS = [
  "sql", "plafond", "population", "minimumRecords", "cpvPrefixes", "cpvExclude", "county", "kind",
  "authorityId", "supplierId", "uatSiruta", "uatAuthorityIds", "singleBidder", "minEmployees", "maxEmployees",
  "yearFrom", "yearTo", "monthFrom", "monthTo", "adminSupplierIds", "comparison",
] as const satisfies readonly ("sql" | keyof RollupCtx)[];
const KNOWN_KEYS = new Set<string>(ROLLUP_CTX_KEYS);

/** A context value that restricts the selection: not null, undefined, false or an empty list. */
const holdsCondition = (value: unknown) =>
  value !== null && value !== undefined && value !== false && !(Array.isArray(value) && value.length === 0);

const DATASET = { "da-branch": "all", strict: "da", none: "contracts" } as const;

/** What the block groups by: an entity role (table/trend), county, the channel/year/county of a total, or CPV stems. */
export type RollupNeed = { by: Role } | { by: "county" } | { by: "total" } | { by: "cpv" };

export type RollupSource = { table: "entity"; role: Role } | { table: "pair" } | { table: "cpv" };

/** The selection, in the terms of the rollup columns. */
export interface RollupFilters {
  dataset: "all" | "da" | "contracts";
  yearFrom: number | null;
  yearTo: number | null;
  county: string | null;
  cpvPrefixes: readonly string[];
  cpvExclude: readonly string[];
  /** The buyer's kind, applied to its entity_profile name (authorityKindCond). */
  kind: AuthorityKind | null;
  employees: { min: number | null; max: number | null } | null;
  /** Explicit exclusions (population not_in); unknown ids are kept, as in populationSql. */
  excludeAuthorities: readonly string[];
  excludeSuppliers: readonly string[];
  minimum: MinimumRecords | null;
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
 * Which rollup answers the selection, or why none does. Rules: CPV only on
 * agg_cpv_year and only without entity conditions; a ranking of one role with
 * conditions on that role only (and the buyer county, years, channel) on
 * agg_entity_year; any condition or threshold on the other role on
 * agg_pair_year; totals without entity conditions on agg_cpv_year. A total
 * with an exclusion keeps rows whose id is unknown, so it needs the pair rows.
 * Fails closed: a context key outside ROLLUP_CTX_KEYS that holds a condition
 * (a filter of a later stage) returns its name as the reason.
 */
export function planRollup(ctx: RollupCtx, need: RollupNeed): RollupPlan {
  for (const [key, value] of Object.entries(ctx))
    if (!KNOWN_KEYS.has(key) && holdsCondition(value)) return { reason: `${key}: a condition the rollups do not know` };
  if (ctx.comparison) return { reason: "comparison: its own queries (compareParties …)" };
  if (ctx.monthFrom !== null || ctx.monthTo !== null) return { reason: "months: the rollups keep whole years" };
  if (ctx.singleBidder) return { reason: "single bidder: not in the rollups" };
  if (ctx.authorityId || ctx.supplierId || ctx.uatSiruta !== null || ctx.uatAuthorityIds.length > 0 || ctx.adminSupplierIds)
    return { reason: "named entity: its transaction index answers directly" };
  const dataset = DATASET[ctx.plafond];
  if (!dataset) return { reason: `plafond ${String(ctx.plafond)}: not in the rollups` };
  if (ctx.kind && !(ctx.kind in KIND_PATTERNS)) return { reason: `kind ${ctx.kind}: no name rule` };
  const excluded = populationExclusions(ctx.population);
  if (!excluded) return { reason: "population: only exclusions of institutions or firms are in the rollups" };
  const employees = ctx.minEmployees !== null || ctx.maxEmployees !== null ? { min: ctx.minEmployees, max: ctx.maxEmployees } : null;
  const filters: RollupFilters = {
    dataset, yearFrom: ctx.yearFrom, yearTo: ctx.yearTo, county: ctx.county,
    cpvPrefixes: ctx.cpvPrefixes, cpvExclude: ctx.cpvExclude, kind: ctx.kind,
    employees, excludeAuthorities: excluded.authority, excludeSuppliers: excluded.supplier,
    minimum: ctx.minimumRecords,
  };
  const sides = new Set<Role>();
  if (filters.kind || filters.excludeAuthorities.length) sides.add("authority");
  if (filters.employees || filters.excludeSuppliers.length) sides.add("supplier");
  if (filters.minimum) sides.add(filters.minimum.role);
  const cpv = filters.cpvPrefixes.length > 0 || filters.cpvExclude.length > 0;
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
  if (source.table === "cpv") return null;
  if (source.table === "entity") return source.role === role ? sql`${sql(alias)}.eid` : null;
  return role === "authority" ? sql`${sql(alias)}.authority_id` : sql`${sql(alias)}.supplier_id`;
}

function fromSource(sql: DbSql, source: RollupSource, alias: string): Fragment {
  const name = source.table === "entity" ? sql`marts.agg_entity_year` : source.table === "pair" ? sql`marts.agg_pair_year` : sql`marts.agg_cpv_year`;
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
  if (source.table === "entity") parts.push(sql`${p("role")} = ${source.role}`);
  if (f.dataset !== "all") parts.push(sql`${p("src")} = ${f.dataset}`);
  if (opts.years !== false && f.yearFrom !== null) parts.push(sql`${p("y")} >= ${String(f.yearFrom)}`);
  if (opts.years !== false && f.yearTo !== null) parts.push(sql`${p("y")} <= ${String(f.yearTo)}`);
  if (f.county) parts.push(sql`${p("county")} = ${f.county}`);
  if (f.cpvPrefixes.length > 0)
    parts.push(sql`(${f.cpvPrefixes.map((x) => sql`${p("cpv_code")} like ${x + "%"}`).reduce((a, b) => sql`${a} or ${b}`)})`);
  if (f.cpvExclude.length > 0)
    parts.push(sql`not (${f.cpvExclude.map((x) => sql`${p("cpv_code")} like ${x + "%"}`).reduce((a, b) => sql`${a} or ${b}`)})`);
  const authority = idColumn(sql, source, "authority", alias), supplier = idColumn(sql, source, "supplier", alias);
  if (f.kind) {
    // The live filter matches the transaction's authority_name; one name per id, equal to the profile's.
    parts.push(sql`${authority!} in (
      select ep.entity_id from marts.entity_profile ep
      where ep.role = 'authority' and ${authorityKindCond(sql, f.kind, sql`ep.name_display`)}
    )`);
  }
  // The live employees condition, on the rollup's firm id.
  if (f.employees) parts.push(employeesCond(sql, f.employees.min, f.employees.max, supplier!));
  if (f.excludeAuthorities.length)
    parts.push(sql`not (coalesce(${authority!} = any(${sql.array([...f.excludeAuthorities])}::bigint[]), false))`);
  if (f.excludeSuppliers.length)
    parts.push(sql`not (coalesce(${supplier!} = any(${sql.array([...f.excludeSuppliers])}::bigint[]), false))`);
  if (f.minimum) parts.push(minimumSemiJoin(sql, f, idColumn(sql, source, f.minimum.role, alias)!, `${alias}m`, opts));
  return parts.length ? parts.reduce((a, b) => sql`${a} and ${b}`) : sql`true`;
}

/**
 * minimumRecordsSql on the rollups: `target` (an id column) among the parties
 * with at least N records in the same selection (f without the threshold).
 */
function minimumSemiJoin(sql: DbSql, f: RollupFilters, target: Fragment, innerAlias: string, opts: { years?: boolean } = {}): Fragment {
  const { role, count } = f.minimum!;
  const everything = f.dataset === "all" && (opts.years === false || (f.yearFrom === null && f.yearTo === null)) && !f.county
    && !f.cpvPrefixes.length && !f.cpvExclude.length && !f.kind && !f.employees && !f.excludeAuthorities.length && !f.excludeSuppliers.length;
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
  const inner: RollupSource = [f.kind || f.excludeAuthorities.length ? "authority" : null, f.employees || f.excludeSuppliers.length ? "supplier" : null]
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
/** Tests only: forget the probe, so the next call reads the database. */
export function forgetRollupsReady(): void { ready = null; }

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
}
export interface RollupTableRow { id: string; nm: string; co: string | null; v: string; n: string; tv?: string; tn?: string; te?: string }

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
  const count = async () => Number(((await sql`
    select count(distinct ${id}) t from ${fromSource(sql, source, "p")} where ${where} and ${id} is not null
  `) as unknown as { t: string }[])[0]?.t ?? 0);
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
             max(ep.county) co, t.v, t.n, t.tv, t.tn, t.te
      from topg t
      left join marts.entity_profile ep on ep.entity_id = t.id and ep.role = ${o.dim}
      group by t.id, t.v, t.n, t.tv, t.tn, t.te
      order by ${sortKey === "count" ? sql`t.n` : sql`t.v`} ${order}, t.id
    `) as unknown as RollupTableRow[];
    if (!o.paged) return { rows, total: null };
    return { rows, total: rows[0]?.te !== undefined ? Number(rows[0].te) : await count() };
  }
  if (source.table !== "entity") return { reason: "name and county sorts need the rollup's names (agg_entity_year)" };
  const total = o.paged ? await count() : null;
  const sortFrag = sortKey === "name" ? sql`g.nm` : sql`ep.county`;
  const rows = (await sql`
    with g as (
      select ${id} id, max(p.nm) nm, sum(p.v) v, sum(p.n) n
      from ${fromSource(sql, source, "p")}
      where ${where} and ${id} is not null
      group by ${id}
    )
    select g.id, g.nm, ep.county co, g.v, g.n
    from g
    left join marts.entity_profile ep on ep.entity_id = g.id and ep.role = ${o.dim}
    order by ${sortFrag} ${order}, g.id
    ${limit}
  `) as unknown as RollupTableRow[];
  return { rows, total };
}

/** case "table", dim county: the live county ranking on a rollup (every source has the buyer county). */
export async function rollupCountyTable(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters },
  o: Omit<RollupTableOpts, "dim">): Promise<{ rows: { c: string; v: string; n: string }[]; total: number | null }> {
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
 * case "trend": per entity (or county) the values of year A and year B, the
 * largest absolute changes first, then the id (or county), as the live query:
 * equal changes (consortium partners) come out in one order on both. Names: the rollup's own on agg_entity_year; on the pair rollup,
 * attached to the shown rows from agg_entity_year (the same transaction names).
 */
export async function rollupTrend(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters },
  o: { dim: Role | "county"; yearA: number; yearB: number; topN: number }):
  Promise<{ rows: { id: string | null; nm: string; co: string | null; va: string; vb: string }[] } | { reason: string }> {
  const { source, filters } = plan;
  const where = rollupWhere(sql, source, filters, "p", { years: false });
  const a = String(o.yearA), b = String(o.yearB);
  const va = sql`coalesce(sum(p.v) filter (where p.y = ${a}), 0)`, vb = sql`coalesce(sum(p.v) filter (where p.y = ${b}), 0)`;
  if (o.dim === "county") {
    const rows = (await sql`
      select null::text id, p.county nm, null::text co, ${va} va, ${vb} vb
      from ${fromSource(sql, source, "p")}
      where ${where} and p.county is not null and p.y in (${a}, ${b})
      group by p.county
      order by abs(${vb} - ${va}) desc, p.county
      limit ${o.topN}
    `) as unknown as { id: null; nm: string; co: null; va: string; vb: string }[];
    return { rows };
  }
  const id = idColumn(sql, source, o.dim, "p");
  if (!id) return { reason: `the ${source.table} rollup has no ${o.dim} id` };
  const name = source.table === "entity" ? sql`max(p.nm)` : sql`null::text`;
  const rows = (await sql`
    select ${id}::text id, ${name} nm, max(p.county) co, ${va} va, ${vb} vb
    from ${fromSource(sql, source, "p")}
    where ${where} and ${id} is not null and p.y in (${a}, ${b})
    group by ${id}
    order by abs(${vb} - ${va}) desc, ${id}
    limit ${o.topN}
  `) as unknown as { id: string; nm: string | null; co: string | null; va: string; vb: string }[];
  if (source.table !== "entity" && rows.length) {
    const names = (await sql`
      select eid::text id, max(nm) nm from marts.agg_entity_year
      where role = ${o.dim} and eid = any(${sql.array(rows.map((r) => r.id))}::bigint[]) group by eid
    `) as unknown as { id: string; nm: string | null }[];
    const byId = new Map(names.map((r) => [r.id, r.nm]));
    for (const r of rows) r.nm = byId.get(r.id) ?? null;
  }
  return { rows: rows as { id: string; nm: string; co: string | null; va: string; vb: string }[] };
}

/**
 * case "breakdown": CPV stems of `stemLen` digits (the live stem rule), value
 * first, then the stem, as the live query.
 * Slicing into the top 8 and "other" stays in the engine.
 */
export async function rollupBreakdown(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters }, stemLen: number):
  Promise<{ rows: { stem: string; v: string; n: string }[] } | { reason: string }> {
  if (plan.source.table !== "cpv") return { reason: "breakdowns read agg_cpv_year only" };
  const where = rollupWhere(sql, plan.source, plan.filters, "p");
  const rows = (await sql`
    select substr(p.cpv_code, 1, ${stemLen}) stem, coalesce(sum(p.v), 0) v, sum(p.n) n
    from marts.agg_cpv_year p
    where ${where} and p.cpv_code is not null
    group by 1 order by v desc, stem
  `) as unknown as { stem: string; v: string; n: string }[];
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
 * county ranking: a county). Other blocks (rankings of entities, network,
 * profiles) are not served. sources:stat-da-2025: 1.57–2.19 s live, 0.05 s here.
 */
export async function rollupSourceTotals(sql: DbSql, plan: { source: RollupSource; filters: RollupFilters },
  block: "stat" | "map" | "breakdown" | "timeseries" | "county"):
  Promise<{ rows: { state: string | null; n: string; v: string; fn: string; fv: string; date_from: string | null; date_to: string | null }[] } | { reason: string }> {
  if (plan.source.table !== "cpv") return { reason: "source totals read agg_cpv_year only" };
  const where = rollupWhere(sql, plan.source, plan.filters, "p");
  const own = block === "map" || block === "county" ? sql`p.county is not null`
    : block === "breakdown" ? sql`p.cpv_code is not null`
    : block === "timeseries" ? sql`p.y ~ '^[0-9]{4}$'` : sql`true`;
  const rows = (await sql`
    select case when p.src = 'da' then 'Oferta acceptata' end state,
           sum(p.n)::bigint::text n, coalesce(sum(p.v), 0)::text v, sum(p.n)::bigint::text fn, coalesce(sum(p.v), 0)::text fv,
           min(p.d0) date_from, max(p.d1) date_to
    from marts.agg_cpv_year p where ${where} and ${own}
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
