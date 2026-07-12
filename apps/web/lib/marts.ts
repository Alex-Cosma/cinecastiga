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
