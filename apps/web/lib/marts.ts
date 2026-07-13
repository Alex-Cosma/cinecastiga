import { createDb, type DbSql } from "@seap/db";

/**
 * Server-only data access for the web app. Reads the `marts` schema exclusively
 * (CQRS-lite — request-time code never joins raw/core multi-million-row tables;
 * display fields like entity name/county are denormalized into marts by the
 * ingestion build). One pooled connection, memoized across dev HMR reloads.
 */
const g = globalThis as unknown as { __seapSql?: DbSql };
function db(): DbSql {
  if (!g.__seapSql) g.__seapSql = createDb().sql;
  return g.__seapSql;
}

export type Role = "supplier" | "authority";

export interface Headline {
  suppliers: number;
  authorities: number;
  totalSpend: number;
}

export async function getHeadline(): Promise<Headline> {
  const sql = db();
  const rows = (await sql`
    select kind, n, total_ron from marts.national_stats where year is null
  `) as unknown as { kind: string; n: number; total_ron: string | null }[];
  const by = new Map(rows.map((r) => [r.kind, r]));
  return {
    suppliers: Number(by.get("supplier")?.n ?? 0),
    authorities: Number(by.get("authority")?.n ?? 0),
    totalSpend: Number(by.get("spend")?.total_ron ?? 0),
  };
}

export interface TypeSpend {
  acquisitionType: string | null;
  totalRon: number;
}

export async function getSpendByType(): Promise<TypeSpend[]> {
  const sql = db();
  const rows = (await sql`
    select acquisition_type, total_ron from marts.spend_by_type
    where kind = 'all' order by total_ron desc nulls last
  `) as unknown as { acquisition_type: string | null; total_ron: string | null }[];
  return rows.map((r) => ({
    acquisitionType: r.acquisition_type,
    totalRon: Number(r.total_ron ?? 0),
  }));
}

export interface CpvSpend {
  division: string;
  nameRo: string | null;
  totalRon: number;
}

export async function getSpendByCpv(limit = 15): Promise<CpvSpend[]> {
  const sql = db();
  const rows = (await sql`
    select division, name_ro, total_ron from marts.spend_by_cpv
    where kind = 'all' order by total_ron desc nulls last limit ${limit}
  `) as unknown as { division: string; name_ro: string | null; total_ron: string | null }[];
  return rows.map((r) => ({
    division: r.division,
    nameRo: r.name_ro,
    totalRon: Number(r.total_ron ?? 0),
  }));
}

export interface TopEntity {
  entityId: string;
  rank: number;
  name: string | null;
  county: string | null;
  totalRon: number;
}

export async function getTopEntities(role: Role, limit = 15): Promise<TopEntity[]> {
  const sql = db();
  const rows = (await sql`
    select te.entity_id, te.rank, ep.name_display, ep.county, te.total_ron_full
    from marts.top_entities te
    join marts.entity_profile ep on ep.entity_id = te.entity_id and ep.role = te.role
    where te.role = ${role}
    order by te.rank
    limit ${limit}
  `) as unknown as {
    entity_id: string;
    rank: number;
    name_display: string | null;
    county: string | null;
    total_ron_full: string | null;
  }[];
  return rows.map((r) => ({
    entityId: String(r.entity_id),
    rank: Number(r.rank),
    name: r.name_display,
    county: r.county,
    totalRon: Number(r.total_ron_full ?? 0),
  }));
}

export interface CpvNode {
  code: string;
  nameRo: string | null;
  totalRon: number;
  nChildren: number;
}

/** Direct children of a CPV node (parentCode null = the 45 divisions). */
export async function getCpvChildren(parentCode: string | null): Promise<CpvNode[]> {
  const sql = db();
  const rows = (await sql`
    select code, name_ro, total_ron, n_children from marts.cpv_tree
    where parent_code is not distinct from ${parentCode}
      and total_ron > 0
    order by total_ron desc
  `) as unknown as {
    code: string;
    name_ro: string | null;
    total_ron: string | null;
    n_children: number;
  }[];
  return rows.map((r) => ({
    code: r.code,
    nameRo: r.name_ro,
    totalRon: Number(r.total_ron ?? 0),
    nChildren: Number(r.n_children),
  }));
}

/** A single CPV node (for breadcrumb / header), or null. */
export async function getCpvNode(code: string): Promise<CpvNode & { parentCode: string | null } | null> {
  const sql = db();
  const rows = (await sql`
    select code, parent_code, name_ro, total_ron, n_children
    from marts.cpv_tree where code = ${code}
  `) as unknown as {
    code: string;
    parent_code: string | null;
    name_ro: string | null;
    total_ron: string | null;
    n_children: number;
  }[];
  const r = rows[0];
  if (!r) return null;
  return {
    code: r.code,
    parentCode: r.parent_code,
    nameRo: r.name_ro,
    totalRon: Number(r.total_ron ?? 0),
    nChildren: Number(r.n_children),
  };
}

/** Walk ancestors from a node up to the division root (for breadcrumbs). */
export async function getCpvAncestry(code: string): Promise<CpvNode[]> {
  const chain: CpvNode[] = [];
  let cursor: string | null = code;
  for (let i = 0; i < 6 && cursor; i++) {
    const node = await getCpvNode(cursor);
    if (!node) break;
    chain.unshift({
      code: node.code,
      nameRo: node.nameRo,
      totalRon: node.totalRon,
      nChildren: node.nChildren,
    });
    cursor = node.parentCode;
  }
  return chain;
}

export interface CountySpend {
  county: string;
  totalRon: number;
  n: number;
}

export async function getSpendByCounty(role: Role): Promise<CountySpend[]> {
  const sql = db();
  const rows = (await sql`
    select county, n, total_ron from marts.spend_by_county
    where role = ${role} and total_ron > 0
    order by total_ron desc
  `) as unknown as { county: string; n: number; total_ron: string | null }[];
  return rows.map((r) => ({
    county: r.county,
    totalRon: Number(r.total_ron ?? 0),
    n: Number(r.n),
  }));
}

export interface EntityFlagRow {
  role: Role;
  name: string | null;
  cui: string | null;
  county: string | null;
  cri: number;
  nFlags: number;
  nDas: number;
  totalRon: number;
  flags: string[];
}

/** Per-role red-flag summary + DA activity for an entity (all roles it has). */
export async function getEntityFlags(entityId: string): Promise<EntityFlagRow[]> {
  const sql = db();
  const id = /^\d+$/.test(entityId) ? entityId : "0";
  const rows = (await sql`
    select role, name_display, cui_canonical, county, cri, n_flags, n_das, total_ron, flags
    from marts.entity_flags where entity_id = ${id}
    order by n_flags desc, n_das desc
  `) as unknown as {
    role: Role;
    name_display: string | null;
    cui_canonical: string | null;
    county: string | null;
    cri: string | null;
    n_flags: number;
    n_das: number;
    total_ron: string | null;
    flags: string[] | null;
  }[];
  return rows.map((r) => ({
    role: r.role,
    name: r.name_display,
    cui: r.cui_canonical,
    county: r.county,
    cri: Number(r.cri ?? 0),
    nFlags: Number(r.n_flags),
    nDas: Number(r.n_das),
    totalRon: Number(r.total_ron ?? 0),
    flags: r.flags ?? [],
  }));
}

export interface DaTx {
  sicapDaId: string;
  daCode: string | null;
  partnerId: string | null;
  partnerName: string | null;
  county: string | null;
  cpvCode: string | null;
  cpvName: string | null;
  estimatedValueRon: number | null;
  closingValue: number | null;
  finalizationDate: string | null;
  gapMinutes: number | null;
  daFlags: string[];
}

export interface TxQuery {
  sort?: "value" | "date" | "gap";
  year?: string;
  flagCode?: string;
  page?: number;
  pageSize?: number;
}

/** A single entity's direct acquisitions (indexed marts read), paginated. */
export async function getEntityTransactions(
  entityId: string,
  role: Role,
  q: TxQuery = {},
): Promise<{ rows: DaTx[]; total: number }> {
  const sql = db();
  const id = /^\d+$/.test(entityId) ? entityId : "0";
  const isAuth = role === "authority";
  const partyCol = isAuth ? sql`authority_id` : sql`supplier_id`;
  const cpName = isAuth ? sql`supplier_name` : sql`authority_name`;
  const cpId = isAuth ? sql`supplier_id` : sql`authority_id`;
  const pageSize = q.pageSize ?? 50;
  const offset = ((q.page ?? 1) - 1) * pageSize;
  const order =
    q.sort === "date"
      ? sql`finalization_date desc nulls last`
      : q.sort === "gap"
        ? sql`gap_minutes asc nulls last`
        : sql`closing_value desc nulls last`;
  const yearCond = q.year ? sql`and finalization_date like ${q.year + "%"}` : sql``;
  const flagCond = q.flagCode
    ? sql`and ${q.flagCode} = any(da_flags)`
    : sql``;

  const rows = (await sql`
    select sicap_da_id, da_code, ${cpName} cp_name, ${cpId} cp_id, county,
           cpv_code, cpv_name, estimated_value_ron, closing_value,
           finalization_date, gap_minutes, da_flags
    from marts.da_transactions
    where ${partyCol} = ${id} ${yearCond} ${flagCond}
    order by ${order}
    limit ${pageSize} offset ${offset}
  `) as unknown as Record<string, unknown>[];

  const totalRows = (await sql`
    select count(*)::int c from marts.da_transactions
    where ${partyCol} = ${id} ${yearCond} ${flagCond}
  `) as unknown as { c: number }[];

  return {
    total: Number(totalRows[0]?.c ?? 0),
    rows: rows.map((r) => ({
      sicapDaId: String(r["sicap_da_id"]),
      daCode: (r["da_code"] as string | null) ?? null,
      partnerId: r["cp_id"] != null ? String(r["cp_id"]) : null,
      partnerName: (r["cp_name"] as string | null) ?? null,
      county: (r["county"] as string | null) ?? null,
      cpvCode: (r["cpv_code"] as string | null) ?? null,
      cpvName: (r["cpv_name"] as string | null) ?? null,
      estimatedValueRon: r["estimated_value_ron"] != null ? Number(r["estimated_value_ron"]) : null,
      closingValue: r["closing_value"] != null ? Number(r["closing_value"]) : null,
      finalizationDate: (r["finalization_date"] as string | null) ?? null,
      gapMinutes: r["gap_minutes"] != null ? Number(r["gap_minutes"]) : null,
      daFlags: (r["da_flags"] as string[] | null) ?? [],
    })),
  };
}

export interface Partner {
  partnerId: string;
  partnerName: string | null;
  n: number;
  totalRon: number;
  pct: number;
}

/** Top counterparties for an entity, by DA value, with share of total. */
export async function getEntityPartners(
  entityId: string,
  role: Role,
  limit = 12,
): Promise<Partner[]> {
  const sql = db();
  const id = /^\d+$/.test(entityId) ? entityId : "0";
  const isAuth = role === "authority";
  const partyCol = isAuth ? sql`authority_id` : sql`supplier_id`;
  const cpName = isAuth ? sql`supplier_name` : sql`authority_name`;
  const cpId = isAuth ? sql`supplier_id` : sql`authority_id`;
  const rows = (await sql`
    with agg as (
      select ${cpId} pid, max(${cpName}) pname, count(*) n, sum(closing_value) t
      from marts.da_transactions
      where ${partyCol} = ${id} and closing_value is not null and closing_value <= 2000000
      group by ${cpId}
    ),
    tot as (select sum(t) grand from agg)
    select pid, pname, n, t, round(t/nullif((select grand from tot),0),4) pct
    from agg order by t desc nulls last limit ${limit}
  `) as unknown as {
    pid: string | null;
    pname: string | null;
    n: number;
    t: string | null;
    pct: string | null;
  }[];
  return rows.map((r) => ({
    partnerId: r.pid != null ? String(r.pid) : "0",
    partnerName: r.pname,
    n: Number(r.n),
    totalRon: Number(r.t ?? 0),
    pct: Number(r.pct ?? 0),
  }));
}

export interface MonthPoint {
  ym: string;
  totalRon: number;
}

/** Monthly DA spend for an entity (timeline; December spikes stand out). */
export async function getEntityMonthly(entityId: string, role: Role): Promise<MonthPoint[]> {
  const sql = db();
  const id = /^\d+$/.test(entityId) ? entityId : "0";
  const partyCol = role === "authority" ? sql`authority_id` : sql`supplier_id`;
  const rows = (await sql`
    select left(finalization_date, 7) ym, sum(closing_value) t
    from marts.da_transactions
    where ${partyCol} = ${id} and finalization_date is not null
      and closing_value is not null and closing_value <= 2000000
    group by 1 order by 1
  `) as unknown as { ym: string; t: string | null }[];
  return rows.map((r) => ({ ym: r.ym, totalRon: Number(r.t ?? 0) }));
}

export interface SplitPair {
  partnerId: string | null;
  partnerName: string | null;
  year: string | null;
  count: number;
  totalRon: number;
  ceiling: number;
}

/** da_split pairs for an entity (the structuring relationships). */
export async function getSplitPairs(entityId: string, role: Role): Promise<SplitPair[]> {
  const sql = db();
  const id = /^\d+$/.test(entityId) ? entityId : "0";
  // In flag_instances, split subject = authority, partner = supplier.
  const cond =
    role === "authority" ? sql`entity_id = ${id}` : sql`partner_id = ${id}`;
  const nameCol = role === "authority" ? sql`partner_name` : sql`entity_name`;
  const idCol = role === "authority" ? sql`partner_id` : sql`entity_id`;
  const rows = (await sql`
    select ${idCol} pid, ${nameCol} pname, period,
      (evidence->>'count')::int cnt, (evidence->>'total')::numeric total,
      (evidence->>'ceiling')::numeric ceiling
    from marts.flag_instances
    where flag_code = 'da_split' and ${cond}
    order by (evidence->>'total')::numeric desc nulls last limit 30
  `) as unknown as {
    pid: string | null;
    pname: string | null;
    period: string | null;
    cnt: number;
    total: string | null;
    ceiling: string | null;
  }[];
  return rows.map((r) => ({
    partnerId: r.pid != null ? String(r.pid) : null,
    partnerName: r.pname,
    year: r.period,
    count: Number(r.cnt),
    totalRon: Number(r.total ?? 0),
    ceiling: Number(r.ceiling ?? 0),
  }));
}

export interface RiskEntity {
  entityId: string;
  name: string | null;
  county: string | null;
  cri: number;
  nFlags: number;
  nDas: number;
  totalRon: number;
  flags: string[];
}

/** Highest-CRI entities for a role (risk leaderboard). */
export async function getRiskLeaderboard(role: Role, limit = 25): Promise<RiskEntity[]> {
  const sql = db();
  const minDas = role === "authority" ? 30 : 10;
  const rows = (await sql`
    select entity_id, name_display, county, cri, n_flags, n_das, total_ron, flags
    from marts.entity_flags
    where role = ${role} and n_das >= ${minDas} and cri > 0
    order by cri desc, total_ron desc nulls last
    limit ${limit}
  `) as unknown as {
    entity_id: string;
    name_display: string | null;
    county: string | null;
    cri: string | null;
    n_flags: number;
    n_das: number;
    total_ron: string | null;
    flags: string[] | null;
  }[];
  return rows.map((r) => ({
    entityId: String(r.entity_id),
    name: r.name_display,
    county: r.county,
    cri: Number(r.cri ?? 0),
    nFlags: Number(r.n_flags),
    nDas: Number(r.n_das),
    totalRon: Number(r.total_ron ?? 0),
    flags: r.flags ?? [],
  }));
}

export interface FlagInstance {
  flagCode: string;
  entityId: string | null;
  entityName: string | null;
  entityCounty: string | null;
  partnerId: string | null;
  partnerName: string | null;
  severity: number;
  totalRon: number;
  period: string | null;
  evidence: Record<string, unknown> | null;
}

/** Browsable flag instances of one type, most significant first. */
export async function getFlagInstances(flagCode: string, limit = 50): Promise<FlagInstance[]> {
  const sql = db();
  const rows = (await sql`
    select flag_code, entity_id, entity_name, entity_county, partner_id, partner_name,
           severity, total_ron, period, evidence
    from marts.flag_instances
    where flag_code = ${flagCode}
    order by total_ron desc nulls last, severity desc nulls last
    limit ${limit}
  `) as unknown as {
    flag_code: string;
    entity_id: string | null;
    entity_name: string | null;
    entity_county: string | null;
    partner_id: string | null;
    partner_name: string | null;
    severity: string | null;
    total_ron: string | null;
    period: string | null;
    evidence: Record<string, unknown> | null;
  }[];
  return rows.map((r) => ({
    flagCode: r.flag_code,
    entityId: r.entity_id ? String(r.entity_id) : null,
    entityName: r.entity_name,
    entityCounty: r.entity_county,
    partnerId: r.partner_id ? String(r.partner_id) : null,
    partnerName: r.partner_name,
    severity: Number(r.severity ?? 0),
    totalRon: Number(r.total_ron ?? 0),
    period: r.period,
    evidence: r.evidence,
  }));
}

/** Count of instances per flag type (for the /semnale index). */
export async function getFlagCounts(): Promise<Record<string, number>> {
  const sql = db();
  const rows = (await sql`
    select flag_code, count(*)::int c from marts.flag_instances group by flag_code
  `) as unknown as { flag_code: string; c: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.flag_code] = Number(r.c);
  return out;
}

export interface EntityRole {
  role: Role;
  totalRonFull: number;
  totalRonSplit: number;
  nContracts: number;
  nDas: number;
  rank: number | null;
}

export interface EntityProfile {
  entityId: string;
  name: string | null;
  county: string | null;
  roles: EntityRole[];
}

export async function getEntityProfile(entityId: string): Promise<EntityProfile | null> {
  const sql = db();
  const id = /^\d+$/.test(entityId) ? entityId : "0";
  const rows = (await sql`
    select ep.role, ep.name_display, ep.county, ep.n_contracts, ep.n_das,
           ep.total_ron_full, ep.total_ron_split, te.rank
    from marts.entity_profile ep
    left join marts.top_entities te
      on te.entity_id = ep.entity_id and te.role = ep.role
    where ep.entity_id = ${id}
    order by ep.total_ron_full desc nulls last
  `) as unknown as {
    role: Role;
    name_display: string | null;
    county: string | null;
    n_contracts: number;
    n_das: number;
    total_ron_full: string | null;
    total_ron_split: string | null;
    rank: number | null;
  }[];
  if (rows.length === 0) return null;
  return {
    entityId,
    name: rows[0]!.name_display,
    county: rows[0]!.county,
    roles: rows.map((r) => ({
      role: r.role,
      totalRonFull: Number(r.total_ron_full ?? 0),
      totalRonSplit: Number(r.total_ron_split ?? 0),
      nContracts: Number(r.n_contracts),
      nDas: Number(r.n_das),
      rank: r.rank == null ? null : Number(r.rank),
    })),
  };
}
