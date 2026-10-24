import type { DbSql } from "@seap/db";
import type { MinimumRecords, QueryPopulation } from "./population";
import type { ScatterDensity, TableSort } from "./compile";

/**
 * Answers from the rollups of the nightly build (packages/db/src/ask-rollups.ts)
 * for the questions that otherwise group the 20M-row transaction marts:
 * national and county trends, rankings with a kind, size, exclusion or
 * minimum-records condition, the paged national ranking, breakdowns, and
 * totals, years and counties of those selections. Not wired into runSpec yet
 * (the registry stage restructures compile.ts): each function returns the rows
 * of the live query it replaces, in the same order and with the same types,
 * and rollups.integration.test.ts proves equality with runSpec on a fixture.
 *
 * Exactness rests on two properties of the marts, checked on the local copy
 * on 24 October 2026 (rollups.integration.test.ts keeps both on a fixture):
 * - every rollup row is a group of exactly the rows an Ask aggregate counts
 *   (closing_value > 0; DAs up to the 2M lei analysis ceiling, which binds
 *   every DA aggregate; contracts after their 1 bn ceiling), with exact sums;
 * - an id has one name in the marts and it equals entity_profile.name_display
 *   (182,687 ids, 0 differences), so the authority kind is applied to
 *   entity_profile names and partner names are attached after aggregation.
 *
 * What the rollups cannot answer (the planner returns the reason and the
 * engine runs its live query): months, CPV together with an entity condition
 * or an entity ranking, a single bidder, a named authority, firm, locality or
 * administrator (their indexes already answer in milliseconds), population
 * conditions other than excluding authorities or firms, per-capita rankings,
 * and name or county sorts on a cross-role selection.
 */

type Fragment = ReturnType<DbSql>;
type Role = "authority" | "supplier";

/** The resolved selection of runSpec (WhereParts + spec), reduced to plain values. */
export interface RollupParts {
  dataset: "all" | "da" | "contracts";
  yearFrom: number | null;
  yearTo: number | null;
  monthFrom: number | null;
  monthTo: number | null;
  /** Canonical buyer county (d.county). */
  county: string | null;
  cpvPrefixes: readonly string[];
  cpvExclude: readonly string[];
  /** KIND_PATTERNS[kind] of the authority kind, unfolded, or null. */
  kindPatterns: readonly string[] | null;
  authorityId: string | null;
  supplierId: string | null;
  /** Locality scope (grounding.uat), null when absent. */
  uatSiruta: number | null;
  adminSupplierIds: readonly string[] | null;
  minEmployees: number | null;
  maxEmployees: number | null;
  singleBidder: boolean;
  population?: QueryPopulation | undefined;
  minimumRecords?: MinimumRecords | undefined;
}

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
  /** Folded LIKE patterns on the buyer's entity_profile name. */
  kind: readonly string[] | null;
  employees: { min: number | null; max: number | null } | null;
  /** Explicit exclusions (population not_in); unknown ids are kept, as in populationSql. */
  excludeAuthorities: readonly string[];
  excludeSuppliers: readonly string[];
  minimum: MinimumRecords | null;
}

export type RollupPlan = { source: RollupSource; filters: RollupFilters } | { reason: string };

/** Same folding as compile.ts fold(): KIND_PATTERNS are compared with lower(unaccent(name)). */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Excluded ids per role, when the population is only "and" groups of authority/firm exclusions. */
function populationExclusions(population: QueryPopulation | undefined): { authority: string[]; supplier: string[] } | null {
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
 */
export function planRollup(parts: RollupParts, need: RollupNeed): RollupPlan {
  if (parts.monthFrom !== null || parts.monthTo !== null) return { reason: "months: the rollups keep whole years" };
  if (parts.singleBidder) return { reason: "single bidder: not in the rollups" };
  if (parts.authorityId || parts.supplierId || parts.uatSiruta !== null || parts.adminSupplierIds)
    return { reason: "named entity: its transaction index answers directly" };
  const excluded = populationExclusions(parts.population);
  if (!excluded) return { reason: "population: only exclusions of institutions or firms are in the rollups" };
  const employees = parts.minEmployees !== null || parts.maxEmployees !== null ? { min: parts.minEmployees, max: parts.maxEmployees } : null;
  const filters: RollupFilters = {
    dataset: parts.dataset, yearFrom: parts.yearFrom, yearTo: parts.yearTo, county: parts.county,
    cpvPrefixes: parts.cpvPrefixes, cpvExclude: parts.cpvExclude,
    kind: parts.kindPatterns ? parts.kindPatterns.map(fold) : null,
    employees, excludeAuthorities: excluded.authority, excludeSuppliers: excluded.supplier,
    minimum: parts.minimumRecords ?? null,
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
    const ors = f.kind.map((x) => sql`lower(unaccent(ep.name_display)) like ${x}`).reduce((a, b) => sql`${a} or ${b}`);
    parts.push(sql`${authority!} in (select ep.entity_id from marts.entity_profile ep where ep.role = 'authority' and (${ors}))`);
  }
  if (f.employees) {
    const { min, max } = f.employees;
    const bounds = min !== null && max !== null ? sql`ep.employees between ${min} and ${max}`
      : min !== null ? sql`ep.employees >= ${min}` : sql`ep.employees <= ${max!}`;
    parts.push(sql`${supplier!} in (
      select ep.entity_id from marts.entity_profile ep
      where ep.role = 'supplier' and ep.employees is not null and ${bounds}
    )`);
  }
  if (f.excludeAuthorities.length)
    parts.push(sql`not (coalesce(${authority!} = any(${sql.array([...f.excludeAuthorities])}::bigint[]), false))`);
  if (f.excludeSuppliers.length)
    parts.push(sql`not (coalesce(${supplier!} = any(${sql.array([...f.excludeSuppliers])}::bigint[]), false))`);
  if (f.minimum) {
    // minimumRecordsSql: the parties with at least N records in the same selection.
    const role = f.minimum.role;
    const inner: RollupSource = [f.kind || f.excludeAuthorities.length ? "authority" : null, f.employees || f.excludeSuppliers.length ? "supplier" : null]
      .every((side) => side === null || side === role) ? { table: "entity", role } : { table: "pair" };
    const innerAlias = `${alias}m`;
    const party = idColumn(sql, inner, role, innerAlias)!;
    const innerWhere = rollupWhere(sql, inner, { ...f, minimum: null }, innerAlias, opts);
    parts.push(sql`${idColumn(sql, source, role, alias)!} in (
      select ${party} from ${fromSource(sql, inner, innerAlias)}
      where ${innerWhere} and ${party} is not null
      group by ${party} having sum(${sql(innerAlias)}.n) >= ${f.minimum.count}
    )`);
  }
  return parts.length ? parts.reduce((a, b) => sql`${a} and ${b}`) : sql`true`;
}

/** Rollups present (they appear with the first nightly build of this code). Cached per connection for 10 minutes. */
const readyCache = new WeakMap<DbSql, { ok: boolean; at: number }>();
export async function rollupsReady(sql: DbSql): Promise<boolean> {
  const hit = readyCache.get(sql);
  if (hit && Date.now() - hit.at < 600_000) return hit.ok;
  const [row] = (await sql`
    select to_regclass('marts.agg_entity_year') is not null
       and to_regclass('marts.agg_pair_year') is not null
       and to_regclass('marts.agg_cpv_year') is not null ok
  `) as unknown as { ok: boolean }[];
  const ok = Boolean(row?.ok);
  readyCache.set(sql, { ok, at: Date.now() });
  return ok;
}

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
 * count (count(distinct id)), null when not paged. Name and county sorts read
 * the rollup's own names, so they need agg_entity_year.
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
  const cnt = o.paged
    ? ((await sql`select count(distinct ${id}) t from ${fromSource(sql, source, "p")} where ${where} and ${id} is not null`) as unknown as { t: string }[])
    : null;
  const total = cnt ? Number(cnt[0]?.t ?? 0) : null;
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
    return { rows, total };
  }
  if (source.table !== "entity") return { reason: "name and county sorts need the rollup's names (agg_entity_year)" };
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
 * largest absolute changes first. The live query orders by the change alone;
 * this adds the id (or county) as tie-break, so equal changes come out in a
 * fixed order. Names: the rollup's own on agg_entity_year; on the pair rollup,
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
 * first; the live query orders by value alone, this adds the stem as tie-break.
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

/** marts.entity_flags.log_total_ron exists (migration 0085). Cached per connection once true. */
const logColumn = new WeakMap<DbSql, boolean>();
async function hasLogTotal(sql: DbSql): Promise<boolean> {
  if (logColumn.get(sql)) return true;
  const [row] = (await sql`
    select exists (select 1 from pg_attribute
      where attrelid = to_regclass('marts.entity_flags') and attname = 'log_total_ron' and not attisdropped) ok
  `) as unknown as { ok: boolean }[];
  if (row?.ok) logColumn.set(sql, true);
  return Boolean(row?.ok);
}

/**
 * case "scatter", the density layer: the live extent and cells queries with the
 * stored log_total_ron (the same expression, computed by PostgreSQL at insert)
 * instead of log() on every read; the live expression until 0085 is applied.
 * `where` is efWhere(role, RISK_MIN_DAS) of compile.ts; the cri condition is added here, as live.
 */
export async function scatterDensity(sql: DbSql, where: Fragment, nx = 80, ny = 46): Promise<ScatterDensity | undefined> {
  const x = (await hasLogTotal(sql)) ? sql`ef.log_total_ron` : sql`log(greatest(coalesce(ef.total_ron, 0), 1))`;
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
