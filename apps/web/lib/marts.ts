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

export interface FlagEvidenceRow {
  flagCode: string;
  period: string | null;
  severity: number | null;
  evidence: Record<string, unknown> | null;
}

/** Per-instance evidence (year, shares, amounts) behind each flag on an entity. */
export async function getEntityFlagEvidence(entityId: string): Promise<FlagEvidenceRow[]> {
  const sql = db();
  const id = /^\d+$/.test(entityId) ? entityId : "0";
  const rows = (await sql`
    select flag_code, period, severity, evidence
    from marts.flag_instances
    where entity_id = ${id}
    order by flag_code, period desc nulls last
  `) as unknown as {
    flag_code: string;
    period: string | null;
    severity: string | null;
    evidence: Record<string, unknown> | null;
  }[];
  return rows.map((r) => ({
    flagCode: r.flag_code,
    period: r.period,
    severity: r.severity === null ? null : Number(r.severity),
    evidence: r.evidence,
  }));
}

export interface DaTx {
  /** "da" = direct acquisition, "contract" = above-threshold award. */
  src: "da" | "contract";
  /** sicap_da_id for DAs, contract_id for contracts — row identity. */
  sicapDaId: string;
  /** DA code, or the contract number for contract rows. */
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
  /** Contract rows only. */
  procedureType: string | null;
  caNoticeId: string | null;
  singleBidder: boolean | null;
  /** SICAP's stable contract id — key of our /contracte/[nid] page. */
  natId: string | null;
  /** Recorded value implausible (>2M or ≥100× estimate) — UI warns. */
  valueSuspect: boolean;
}

export interface TxQuery {
  sort?: "value" | "date" | "gap";
  dir?: "asc" | "desc";
  year?: string;
  /** Multi-select year filter (wins over `year` when set). */
  years?: string[];
  flagCode?: string;
  /** Which channel(s): both by default. Flag filters force DA-only (flags live on DA rows). */
  src?: "all" | "da" | "contracts";
  page?: number;
  pageSize?: number;
}

export interface CompanyRep {
  personName: string;
  calitate: string | null;
  birthYear: number | null;
  birthLocality: string | null;
  personKey: string | null;
  /** Other firms of this person that appear in OUR procurement data — linkable. */
  nOtherFirms: number;
  /** Other firms known only to ONRC (no public procurement) — informational. */
  nOtherOnrcOnly: number;
}

/**
 * Legal representatives of a company (ONRC monthly snapshot). Only the birth
 * year is exposed (full birth dates stay in the DB — disambiguation needs no
 * more). nOtherFirms counts only via the solid person key (name+birth data);
 * juridical-person representatives get 0.
 */
export async function getCompanyReps(cui: string): Promise<CompanyRep[]> {
  const sql = db();
  const rows = (await sql`
    select distinct on (r.person_name, r.calitate)
      r.person_name, r.calitate,
      extract(year from r.birth_date)::int by, r.birth_locality, r.person_key,
      case when r.birth_date is not null then
        (select count(distinct r2.cui) from reference.company_reps r2
         join core.entities e2 on e2.cui_canonical = r2.cui
         join marts.entity_profile ep on ep.entity_id = e2.id and ep.role = 'supplier'
         where r2.person_key = r.person_key and r2.cui <> ${cui})
      else 0 end n_other,
      case when r.birth_date is not null then
        (select count(distinct r2.cui) from reference.company_reps r2
         where r2.person_key = r.person_key and r2.cui is not null
           and r2.cui <> ${cui}
           and not exists (select 1 from core.entities e2
                           join marts.entity_profile ep on ep.entity_id = e2.id and ep.role = 'supplier'
                           where e2.cui_canonical = r2.cui))
      else 0 end n_other_onrc
    from reference.company_reps r
    where r.cui = ${cui}
    order by r.person_name, r.calitate
  `) as unknown as {
    person_name: string;
    calitate: string | null;
    by: number | null;
    birth_locality: string | null;
    person_key: string | null;
    n_other: string | null;
    n_other_onrc: string | null;
  }[];
  return rows.map((r) => ({
    personName: r.person_name,
    calitate: r.calitate,
    birthYear: r.by === null ? null : Number(r.by),
    // ONRC birth localities can be punctuation-only junk (".")
    birthLocality: r.birth_locality && /\p{L}/u.test(r.birth_locality) ? r.birth_locality : null,
    personKey: r.person_key,
    nOtherFirms: Math.max(0, Number(r.n_other ?? 0)),
    nOtherOnrcOnly: Math.max(0, Number(r.n_other_onrc ?? 0)),
  }));
}

/** Distinct activity years across both channels — the year filter chips. */
export async function getEntityTxYears(entityId: string, role: Role): Promise<string[]> {
  const sql = db();
  const id = /^\d+$/.test(entityId) ? entityId : "0";
  const partyCol = role === "authority" ? sql`authority_id` : sql`supplier_id`;
  const rows = (await sql`
    select distinct y from (
      select left(finalization_date, 4) y from marts.da_transactions
      where ${partyCol} = ${id} and finalization_date is not null
      union
      select left(finalization_date, 4) y from marts.contract_transactions
      where ${partyCol} = ${id} and finalization_date is not null
    ) u
    order by 1 desc
  `) as unknown as { y: string }[];
  return rows.map((r) => r.y);
}

/**
 * A single entity's transactions across both channels (direct acquisitions +
 * above-threshold contract awards), unified and paginated. The two marts share
 * column names for everything common; channel-specific columns are null-padded.
 */
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
  const col =
    q.sort === "date" ? sql`finalization_date` : q.sort === "gap" ? sql`gap_minutes` : sql`closing_value`;
  // defaults per column: gap = fastest first, others = biggest/newest first
  const asc = q.dir ? q.dir === "asc" : q.sort === "gap";
  const order = asc ? sql`${col} asc nulls last` : sql`${col} desc nulls last`;
  const yearCond =
    q.years && q.years.length > 0
      ? sql`and left(finalization_date, 4) = any(${sql.array(q.years)}::text[])`
      : q.year
        ? sql`and finalization_date like ${q.year + "%"}`
        : sql``;
  const flagCond = q.flagCode
    ? sql`and ${q.flagCode} = any(da_flags)`
    : sql``;
  // flag filters live on DA rows only → a flag filter implies the DA channel
  const wantDa = q.src !== "contracts" || Boolean(q.flagCode);
  const wantCt = q.src !== "da" && !q.flagCode;

  const daSel = sql`
    select 'da' src, sicap_da_id::text rid, da_code code, ${cpName} cp_name, ${cpId} cp_id,
           county, cpv_code, cpv_name, estimated_value_ron, closing_value,
           finalization_date, gap_minutes, da_flags,
           null::text procedure_type, null::bigint ca_notice_id, null::boolean single_bidder,
           null::bigint nat_id, value_suspect
    from marts.da_transactions
    where ${partyCol} = ${id} ${yearCond} ${flagCond}`;
  const ctSel = sql`
    select 'contract' src, t.contract_id::text rid, t.contract_no code, t.${cpName} cp_name, t.${cpId} cp_id,
           t.county, t.cpv_code, t.cpv_name, null::numeric estimated_value_ron, t.closing_value,
           t.finalization_date, null::int gap_minutes, array[]::text[] da_flags,
           t.procedure_type, t.ca_notice_id, t.is_single_bidder single_bidder,
           cc.ca_notice_contract_id nat_id, false value_suspect
    from marts.contract_transactions t
    left join core.contracts cc on cc.id = t.contract_id
    where t.${partyCol} = ${id} ${yearCond}`;
  const body = wantDa && wantCt ? sql`${daSel} union all ${ctSel}` : wantDa ? daSel : ctSel;

  const rows = (await sql`
    select * from (${body}) u
    order by ${order}
    limit ${pageSize} offset ${offset}
  `) as unknown as Record<string, unknown>[];

  const totalRows = (await sql`
    select count(*)::int c from (${body}) u
  `) as unknown as { c: number }[];

  return {
    total: Number(totalRows[0]?.c ?? 0),
    rows: rows.map((r) => ({
      src: r["src"] === "contract" ? ("contract" as const) : ("da" as const),
      sicapDaId: String(r["rid"]),
      daCode: (r["code"] as string | null) ?? null,
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
      procedureType: (r["procedure_type"] as string | null) ?? null,
      caNoticeId: r["ca_notice_id"] != null ? String(r["ca_notice_id"]) : null,
      singleBidder: (r["single_bidder"] as boolean | null) ?? null,
      natId: r["nat_id"] != null ? String(r["nat_id"]) : null,
      valueSuspect: Boolean(r["value_suspect"]),
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

/** How many of the entity's DA rows carry each row-level flag (da_round, da_rapid…). */
export async function getEntityFlagRowCounts(
  entityId: string,
  role: Role,
): Promise<Record<string, number>> {
  const sql = db();
  const id = /^\d+$/.test(entityId) ? entityId : "0";
  const partyCol = role === "authority" ? sql`authority_id` : sql`supplier_id`;
  const rows = (await sql`
    select f code, count(*)::int n
    from marts.da_transactions, unnest(da_flags) f
    where ${partyCol} = ${id}
    group by f
  `) as unknown as { code: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.code, Number(r.n)]));
}

/** Row counts per channel, consistent with the unified transactions table. */
export async function getEntityTxCounts(
  entityId: string,
  role: Role,
): Promise<{ nDa: number; nCt: number }> {
  const sql = db();
  const id = /^\d+$/.test(entityId) ? entityId : "0";
  const partyCol = role === "authority" ? sql`authority_id` : sql`supplier_id`;
  const rows = (await sql`
    select
      (select count(*)::int from marts.da_transactions where ${partyCol} = ${id}) n_da,
      (select count(*)::int from marts.contract_transactions where ${partyCol} = ${id}) n_ct
  `) as unknown as { n_da: number; n_ct: number }[];
  return { nDa: Number(rows[0]?.n_da ?? 0), nCt: Number(rows[0]?.n_ct ?? 0) };
}

/**
 * Paginated counterparties across BOTH channels (DA closing values + contract
 * winner-split shares — same anti-double-count basis as entity totals), with
 * share of the entity's grand total.
 */
export async function getEntityPartnersPaged(
  entityId: string,
  role: Role,
  page = 1,
  pageSize = 10,
): Promise<{ rows: Partner[]; total: number }> {
  const sql = db();
  const id = /^\d+$/.test(entityId) ? entityId : "0";
  const isAuth = role === "authority";
  const partyCol = isAuth ? sql`authority_id` : sql`supplier_id`;
  const cpName = isAuth ? sql`supplier_name` : sql`authority_name`;
  const cpId = isAuth ? sql`supplier_id` : sql`authority_id`;
  const offset = (Math.max(1, page) - 1) * pageSize;
  const rows = (await sql`
    with u as (
      select ${cpId} pid, ${cpName} pname, closing_value cv
      from marts.da_transactions
      where ${partyCol} = ${id} and closing_value is not null and closing_value <= 2000000
      union all
      select ${cpId}, ${cpName}, closing_value
      from marts.contract_transactions
      where ${partyCol} = ${id} and closing_value is not null
    ),
    agg as (
      select pid, max(pname) pname, count(*) n, sum(cv) t
      from u group by pid
    ),
    tot as (select sum(t) grand, count(*) parties from agg)
    select pid, pname, n, t,
           round(t/nullif((select grand from tot),0),4) pct,
           (select parties from tot)::int parties
    from agg order by t desc nulls last
    limit ${pageSize} offset ${offset}
  `) as unknown as {
    pid: string | null;
    pname: string | null;
    n: number;
    t: string | null;
    pct: string | null;
    parties: number;
  }[];
  // page past the end returns no rows — fall back to a bare count for the pager
  let total = Number(rows[0]?.parties ?? 0);
  if (rows.length === 0) {
    const c = (await sql`
      select count(distinct pid)::int c from (
        select ${cpId} pid from marts.da_transactions
        where ${partyCol} = ${id} and closing_value is not null and closing_value <= 2000000
        union all
        select ${cpId} from marts.contract_transactions
        where ${partyCol} = ${id} and closing_value is not null
      ) u
    `) as unknown as { c: number }[];
    total = Number(c[0]?.c ?? 0);
  }
  return {
    total,
    rows: rows.map((r) => ({
      partnerId: r.pid != null ? String(r.pid) : "0",
      partnerName: r.pname,
      n: Number(r.n),
      totalRon: Number(r.t ?? 0),
      pct: Number(r.pct ?? 0),
    })),
  };
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

export interface RiskGroupPage {
  rows: RiskEntity[];
  total: number;
}

/**
 * Entities inside a CRI band — the landing list for a clicked bar of the
 * "cât de neobișnuit e" distribution. Same population rule as the ask
 * engine's distribution block: role + at least 10 direct acquisitions.
 */
export type RiskGroupSort = "cri" | "flags" | "das" | "total" | "name";

export async function getRiskGroup(
  role: Role,
  criMin: number,
  criMax: number,
  county: string | null,
  page = 0,
  pageSize = 10,
  sort: RiskGroupSort = "cri",
  dir: "asc" | "desc" = "desc",
): Promise<RiskGroupPage> {
  const sql = db();
  const jud = county
    ? sql`and lower(unaccent(county)) = lower(unaccent(${county}))`
    : sql``;
  // upper bound inclusive only for the last bucket (criMax >= 1)
  const ub =
    criMax >= 1 ? sql`coalesce(cri, 0) <= ${criMax}` : sql`coalesce(cri, 0) < ${criMax}`;
  const col = {
    cri: sql`coalesce(cri, 0)`,
    flags: sql`n_flags`,
    das: sql`n_das`,
    total: sql`coalesce(total_ron, 0)`,
    name: sql`lower(unaccent(coalesce(name_display, '')))`,
  }[sort];
  const ord = dir === "asc" ? sql`${col} asc` : sql`${col} desc`;
  const rows = (await sql`
    select entity_id, name_display, county, cri, n_flags, n_das, total_ron, flags,
           count(*) over () as total
    from marts.entity_flags
    where role = ${role} and n_das >= 10
      and coalesce(cri, 0) >= ${criMin} and ${ub} ${jud}
    order by ${ord}, total_ron desc nulls last, entity_id
    limit ${pageSize} offset ${page * pageSize}
  `) as unknown as {
    entity_id: string;
    name_display: string | null;
    county: string | null;
    cri: string | null;
    n_flags: number;
    n_das: number;
    total_ron: string | null;
    flags: string[] | null;
    total: string;
  }[];
  return {
    total: rows.length > 0 ? Number(rows[0]!.total) : 0,
    rows: rows.map((r) => ({
      entityId: String(r.entity_id),
      name: r.name_display,
      county: r.county,
      cri: Number(r.cri ?? 0),
      nFlags: Number(r.n_flags),
      nDas: Number(r.n_das),
      totalRon: Number(r.total_ron ?? 0),
      flags: r.flags ?? [],
    })),
  };
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
  countryCode: string | null;
  isForeign: boolean;
  roles: EntityRole[];
  /** MF bilanț, latest filing with an employee count (suppliers). Null = no
   *  Romanian filing exists (PFA, foreign firm, dissolved) — say so, don't hide. */
  employees: number | null;
  employeesYear: number | null;
  netTurnover: number | null;
  /** ONRC legal form (srl, sa, ra, …); null for institutions. */
  legalForm: string | null;
  /** A company (SRL/SA/RA) that buys through SEAP: state- or council-owned, a
   *  contracting authority under L98/2016 art. 4 — labelled "companie publică". */
  isPublicCompany: boolean;
}

/** Commercial legal forms; a contracting authority with one of these is a public company. */
export function isCompanyForm(legalForm: string | null | undefined): boolean {
  return legalForm === "srl" || legalForm === "sa" || legalForm === "ra";
}

// ── TED (above-EU-threshold) awards — the labeled, no-blend surfacing ────────

export interface TedStats {
  total: number;
  alsoInSeap: number;
  tedOnly: number;
  foreign: number;
  singleBidder: number;
  /** Foreign winner countries by TED-side value, richest first. */
  byCountry: { country: string; n: number; totalRon: number }[];
}

export async function getTedStats(): Promise<TedStats> {
  const sql = db();
  const rows = (await sql`
    select metric, dimension, n, total_ron from marts.ted_stats
  `) as unknown as { metric: string; dimension: string; n: number; total_ron: string | null }[];
  const pick = (m: string, d: string) => rows.find((r) => r.metric === m && r.dimension === d);
  return {
    total: Number(pick("total", "all")?.n ?? 0),
    alsoInSeap: Number(pick("label", "also-in-seap")?.n ?? 0),
    tedOnly: Number(pick("label", "ted-only")?.n ?? 0),
    foreign: rows
      .filter((r) => r.metric === "country")
      .reduce((s, r) => s + Number(r.n), 0),
    singleBidder: Number(pick("single_bidder", "yes")?.n ?? 0),
    byCountry: rows
      .filter((r) => r.metric === "country")
      .map((r) => ({ country: r.dimension, n: Number(r.n), totalRon: Number(r.total_ron ?? 0) }))
      .sort((a, b) => b.totalRon - a.totalRon),
  };
}

export interface TedAward {
  tedLotResultId: string;
  publicationNumber: string | null;
  buyerEntityId: string | null;
  buyerName: string | null;
  buyerCounty: string | null;
  winnerNames: string[];
  winnerEntityIds: string[];
  winnerCountries: string[];
  isForeign: boolean;
  cpvCode: string | null;
  cpvName: string | null;
  title: string | null;
  awardedValue: number | null;
  currency: string | null;
  awardDate: string | null;
  procedureType: string | null;
  isSingleBidder: boolean | null;
  euFunded: boolean | null;
  label: string;
  matchedContractId: string | null;
}

export interface TedQuery {
  label?: "also-in-seap" | "ted-only";
  foreign?: boolean;
  singleBidder?: boolean;
  country?: string;
  sort?: "value" | "date";
  page?: number;
  pageSize?: number;
}

/** Browsable TED awards (the above-threshold read model), filtered + paginated. */
export async function getTedAwards(
  q: TedQuery = {},
): Promise<{ rows: TedAward[]; total: number }> {
  const sql = db();
  const pageSize = q.pageSize ?? 50;
  const offset = ((q.page ?? 1) - 1) * pageSize;
  const labelCond = q.label ? sql`and label = ${q.label}` : sql``;
  const foreignCond = q.foreign ? sql`and is_foreign` : sql``;
  const sbCond = q.singleBidder ? sql`and is_single_bidder` : sql``;
  const countryCond = q.country
    ? sql`and ${q.country} = any(winner_countries)`
    : sql``;
  const order =
    q.sort === "date"
      ? sql`award_date desc nulls last`
      : sql`awarded_value desc nulls last`;

  const where = sql`where true ${labelCond} ${foreignCond} ${sbCond} ${countryCond}`;
  const rows = (await sql`
    select ted_lot_result_id, publication_number, buyer_entity_id, buyer_name,
           buyer_county, winner_names, winner_entity_ids, winner_countries,
           is_foreign, cpv_code, cpv_name, title, awarded_value, currency,
           award_date, procedure_type, is_single_bidder, eu_funded, label,
           matched_contract_id
    from marts.ted_awards
    ${where}
    order by ${order}
    limit ${pageSize} offset ${offset}
  `) as unknown as Record<string, unknown>[];
  const totalRows = (await sql`
    select count(*)::int c from marts.ted_awards ${where}
  `) as unknown as { c: number }[];

  return {
    total: Number(totalRows[0]?.c ?? 0),
    rows: rows.map((r) => ({
      tedLotResultId: String(r["ted_lot_result_id"]),
      publicationNumber: (r["publication_number"] as string | null) ?? null,
      buyerEntityId: r["buyer_entity_id"] != null ? String(r["buyer_entity_id"]) : null,
      buyerName: (r["buyer_name"] as string | null) ?? null,
      buyerCounty: (r["buyer_county"] as string | null) ?? null,
      winnerNames: (r["winner_names"] as string[] | null) ?? [],
      winnerEntityIds: ((r["winner_entity_ids"] as (string | number)[] | null) ?? []).map(String),
      winnerCountries: (r["winner_countries"] as string[] | null) ?? [],
      isForeign: Boolean(r["is_foreign"]),
      cpvCode: (r["cpv_code"] as string | null) ?? null,
      cpvName: (r["cpv_name"] as string | null) ?? null,
      title: (r["title"] as string | null) ?? null,
      awardedValue: r["awarded_value"] != null ? Number(r["awarded_value"]) : null,
      currency: (r["currency"] as string | null) ?? null,
      awardDate: (r["award_date"] as string | null) ?? null,
      procedureType: (r["procedure_type"] as string | null) ?? null,
      isSingleBidder: r["is_single_bidder"] == null ? null : Boolean(r["is_single_bidder"]),
      euFunded: r["eu_funded"] == null ? null : Boolean(r["eu_funded"]),
      label: String(r["label"]),
      matchedContractId: r["matched_contract_id"] != null ? String(r["matched_contract_id"]) : null,
    })),
  };
}

export async function getEntityProfile(entityId: string): Promise<EntityProfile | null> {
  const sql = db();
  const id = /^\d+$/.test(entityId) ? entityId : "0";
  const rows = (await sql`
    select ep.role, ep.name_display, ep.county, ep.country_code, ep.is_foreign,
           ep.n_contracts, ep.n_das, ep.total_ron_full, ep.total_ron_split, te.rank,
           ep.employees, ep.employees_year, ep.net_turnover, ce.legal_form
    from marts.entity_profile ep
    left join core.entities ce on ce.id = ep.entity_id
    left join marts.top_entities te
      on te.entity_id = ep.entity_id and te.role = ep.role
    where ep.entity_id = ${id}
    order by ep.total_ron_full desc nulls last
  `) as unknown as {
    role: Role;
    name_display: string | null;
    county: string | null;
    country_code: string | null;
    is_foreign: boolean;
    n_contracts: number;
    n_das: number;
    total_ron_full: string | null;
    total_ron_split: string | null;
    rank: number | null;
    employees: number | null;
    employees_year: number | null;
    net_turnover: string | null;
    legal_form: string | null;
  }[];
  if (rows.length === 0) return null;
  const fin = rows.find((r) => r.employees !== null);
  const legalForm = rows[0]!.legal_form;
  return {
    entityId,
    legalForm,
    isPublicCompany: isCompanyForm(legalForm) && rows.some((r) => r.role === "authority"),
    name: rows[0]!.name_display,
    county: rows[0]!.county,
    countryCode: rows[0]!.country_code,
    isForeign: Boolean(rows[0]!.is_foreign),
    employees: fin?.employees ?? null,
    employeesYear: fin?.employees_year ?? null,
    netTurnover: fin?.net_turnover != null ? Number(fin.net_turnover) : null,
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

// ── Contract detail page (/contracte/[nid]) ─────────────────────────────────

export interface ContractWinner {
  entityId: string;
  name: string | null;
  county: string | null;
  /** This winner's split share of the award value (anti-double-count). */
  shareRon: number | null;
  /** Past business between the authority and this winner, both channels. */
  pairNDa: number;
  pairNCt: number;
  pairTotalRon: number;
}

export interface ContractDetail {
  /** SICAP's own contract id — the stable URL key. */
  natId: string;
  contractId: string;
  contractNo: string | null;
  title: string | null;
  lotsCaption: string | null;
  contractDate: string | null;
  contractValue: number | null;
  currency: string | null;
  cpvCode: string | null;
  cpvName: string | null;
  // award (the money + procedure live on the award notice)
  caNoticeId: string | null;
  noticeNo: string | null;
  estimatedValueRon: number | null;
  awardValueRon: number | null;
  lowestOfferRon: number | null;
  highestOfferRon: number | null;
  procedureType: string | null;
  acquisitionType: string | null;
  stateDate: string | null;
  authority: { entityId: string; name: string | null; county: string | null } | null;
  winners: ContractWinner[];
  nWinners: number;
  tendersReceived: number | null;
  isSingleBidder: boolean | null;
  tedNoticeNo: string | null;
  /** award-level red flags hit by THIS award notice */
  flags: { code: string; severity: number | null; evidence: Record<string, unknown> | null }[];
  /** how many contracts (lots) the same award notice produced */
  noticeLotCount: number;
}

export async function getContractDetail(natId: string): Promise<ContractDetail | null> {
  const sql = db();
  const nid = /^\d+$/.test(natId) ? natId : "0";
  const rows = (await sql`
    select c.id, c.ca_notice_contract_id nat_id, c.contract_no, c.title, c.lots_caption,
           c.contract_date::text, c.contract_value, c.currency, c.cpv_code,
           (select name_ro from core.cpv_codes k where k.code = c.cpv_code) cpv_name,
           a.id award_id, a.ca_notice_id, a.notice_no, a.estimated_value_ron,
           a.ron_contract_value, a.lowest_offer_value, a.highest_offer_value,
           a.procedure_type, a.acquisition_type, a.state_date::text,
           a.authority_entity_id, e.name_display auth_name, e.county auth_county,
           (select t.ted_notice_no from raw.ca_notice_ted t
            where t.ca_notice_id = a.ca_notice_id and t.ted_notice_no is not null limit 1) ted_no
    from core.contracts c
    left join core.awards a on a.ca_notice_id = c.ca_notice_id
    left join core.entities e on e.id = a.authority_entity_id
    where c.ca_notice_contract_id = ${nid}
    limit 1
  `) as unknown as Record<string, unknown>[];
  const r = rows[0];
  if (!r) return null;
  const contractId = String(r["id"]);
  const awardId = r["award_id"] != null ? String(r["award_id"]) : null;
  const authId = r["authority_entity_id"] != null ? String(r["authority_entity_id"]) : null;

  const caId = r["ca_notice_id"] != null ? String(r["ca_notice_id"]) : null;
  const [mart, winners, flags, lotCount] = await Promise.all([
    sql`
      select supplier_id, closing_value, n_winners, tenders_received, is_single_bidder
      from marts.contract_transactions where contract_id = ${contractId}
    ` as unknown as Promise<Record<string, unknown>[]>,
    sql`
      select cw.entity_id, e.name_display, e.county
      from core.contract_winners cw
      left join core.entities e on e.id = cw.entity_id
      where cw.contract_id = ${contractId}
    ` as unknown as Promise<Record<string, unknown>[]>,
    awardId
      ? (sql`
          select flag_code, severity, evidence from core.flags
          where subject_type = 'award' and subject_id = ${awardId}
        ` as unknown as Promise<Record<string, unknown>[]>)
      : Promise.resolve([] as Record<string, unknown>[]),
    caId
      ? (sql`
          select count(*)::int c from core.contracts where ca_notice_id = ${caId}
        ` as unknown as Promise<{ c: number }[]>)
      : Promise.resolve([{ c: 1 }]),
  ]);

  const shareBySupplier = new Map<string, number | null>();
  for (const m of mart) {
    shareBySupplier.set(
      String(m["supplier_id"]),
      m["closing_value"] != null ? Number(m["closing_value"]) : null,
    );
  }
  const m0 = mart[0];

  // pair history: authority × each winner, both channels (skip if no authority)
  const winnerIds = winners.map((w) => String(w["entity_id"]));
  const history = new Map<string, { nDa: number; nCt: number; total: number }>();
  if (authId && winnerIds.length > 0) {
    const hist = (await sql`
      select supplier_id sid,
        count(*) filter (where src = 'da')::int n_da,
        count(*) filter (where src = 'ct')::int n_ct,
        coalesce(sum(cv), 0) total
      from (
        select supplier_id, 'da' src, closing_value cv from marts.da_transactions
        where authority_id = ${authId} and supplier_id = any(${sql.array(winnerIds)}::bigint[])
          and closing_value is not null and closing_value <= 2000000
        union all
        select supplier_id, 'ct', closing_value from marts.contract_transactions
        where authority_id = ${authId} and supplier_id = any(${sql.array(winnerIds)}::bigint[])
          and closing_value is not null
      ) u group by supplier_id
    `) as unknown as Record<string, unknown>[];
    for (const h of hist) {
      history.set(String(h["sid"]), {
        nDa: Number(h["n_da"] ?? 0),
        nCt: Number(h["n_ct"] ?? 0),
        total: Number(h["total"] ?? 0),
      });
    }
  }

  return {
    natId: String(r["nat_id"]),
    contractId,
    contractNo: (r["contract_no"] as string | null) ?? null,
    title: (r["title"] as string | null) ?? null,
    lotsCaption: (r["lots_caption"] as string | null) ?? null,
    contractDate: (r["contract_date"] as string | null) ?? null,
    contractValue: r["contract_value"] != null ? Number(r["contract_value"]) : null,
    currency: (r["currency"] as string | null) ?? null,
    cpvCode: (r["cpv_code"] as string | null) ?? null,
    cpvName: (r["cpv_name"] as string | null) ?? null,
    caNoticeId: r["ca_notice_id"] != null ? String(r["ca_notice_id"]) : null,
    noticeNo: (r["notice_no"] as string | null) ?? null,
    estimatedValueRon: r["estimated_value_ron"] != null ? Number(r["estimated_value_ron"]) : null,
    awardValueRon: r["ron_contract_value"] != null ? Number(r["ron_contract_value"]) : null,
    lowestOfferRon: r["lowest_offer_value"] != null ? Number(r["lowest_offer_value"]) : null,
    highestOfferRon: r["highest_offer_value"] != null ? Number(r["highest_offer_value"]) : null,
    procedureType: (r["procedure_type"] as string | null) ?? null,
    acquisitionType: (r["acquisition_type"] as string | null) ?? null,
    stateDate: (r["state_date"] as string | null) ?? null,
    authority: authId
      ? {
          entityId: authId,
          name: (r["auth_name"] as string | null) ?? null,
          county: (r["auth_county"] as string | null) ?? null,
        }
      : null,
    winners: winners.map((w) => {
      const idStr = String(w["entity_id"]);
      const h = history.get(idStr);
      return {
        entityId: idStr,
        name: (w["name_display"] as string | null) ?? null,
        county: (w["county"] as string | null) ?? null,
        shareRon: shareBySupplier.get(idStr) ?? null,
        pairNDa: h?.nDa ?? 0,
        pairNCt: h?.nCt ?? 0,
        pairTotalRon: h?.total ?? 0,
      };
    }),
    nWinners: m0 ? Number(m0["n_winners"] ?? winners.length) : winners.length,
    tendersReceived: m0?.["tenders_received"] != null ? Number(m0["tenders_received"]) : null,
    isSingleBidder: m0?.["is_single_bidder"] == null ? null : Boolean(m0["is_single_bidder"]),
    tedNoticeNo: (r["ted_no"] as string | null) ?? null,
    flags: flags.map((f) => ({
      code: String(f["flag_code"]),
      severity: f["severity"] != null ? Number(f["severity"]) : null,
      evidence: (f["evidence"] as Record<string, unknown> | null) ?? null,
    })),
    noticeLotCount: Number(lotCount[0]?.c ?? 1),
  };
}

// ── Award-notice ("mother contract") page (/anunturi/[caid]) ────────────────

export interface NoticeLot {
  natId: string;
  contractNo: string | null;
  title: string | null;
  contractDate: string | null;
  contractValue: number | null;
  winners: { entityId: string; name: string | null }[];
}

export interface AwardNoticeDetail {
  caNoticeId: string;
  noticeNo: string | null;
  procedureType: string | null;
  acquisitionType: string | null;
  stateDate: string | null;
  estimatedValueRon: number | null;
  awardValueRon: number | null;
  lowestOfferRon: number | null;
  highestOfferRon: number | null;
  cpvCode: string | null;
  cpvName: string | null;
  authority: { entityId: string; name: string | null; county: string | null } | null;
  tedNoticeNo: string | null;
  nLots: number;
  totalContractValue: number | null;
  lots: NoticeLot[];
  page: number;
  pageSize: number;
}

export async function getAwardNoticeDetail(
  caNoticeId: string,
  page = 1,
  pageSize = 50,
): Promise<AwardNoticeDetail | null> {
  const sql = db();
  const cid = /^\d+$/.test(caNoticeId) ? caNoticeId : "0";
  const head = (await sql`
    select a.ca_notice_id, a.notice_no, a.procedure_type, a.acquisition_type,
           a.state_date::text, a.estimated_value_ron, a.ron_contract_value,
           a.lowest_offer_value, a.highest_offer_value, a.cpv_code,
           (select name_ro from core.cpv_codes k where k.code = a.cpv_code) cpv_name,
           a.authority_entity_id, e.name_display auth_name, e.county auth_county,
           (select t.ted_notice_no from raw.ca_notice_ted t
            where t.ca_notice_id = a.ca_notice_id and t.ted_notice_no is not null limit 1) ted_no
    from core.awards a
    left join core.entities e on e.id = a.authority_entity_id
    where a.ca_notice_id = ${cid}
    limit 1
  `) as unknown as Record<string, unknown>[];
  const h = head[0];
  if (!h) return null;

  const agg = (await sql`
    select count(*)::int n, sum(contract_value) total
    from core.contracts where ca_notice_id = ${cid}
  `) as unknown as { n: number; total: string | null }[];
  const nLots = Number(agg[0]?.n ?? 0);
  const offset = (Math.max(1, page) - 1) * pageSize;

  const lots = (await sql`
    select c.id, c.ca_notice_contract_id nat_id, c.contract_no, c.title,
           c.contract_date::text, c.contract_value
    from core.contracts c
    where c.ca_notice_id = ${cid}
    order by c.contract_value desc nulls last, c.id
    limit ${pageSize} offset ${offset}
  `) as unknown as Record<string, unknown>[];

  const lotIds = lots.map((l) => String(l["id"]));
  const winnersByLot = new Map<string, { entityId: string; name: string | null }[]>();
  if (lotIds.length > 0) {
    const w = (await sql`
      select cw.contract_id, cw.entity_id, e.name_display
      from core.contract_winners cw
      left join core.entities e on e.id = cw.entity_id
      where cw.contract_id = any(${sql.array(lotIds)}::bigint[])
    `) as unknown as Record<string, unknown>[];
    for (const r of w) {
      const k = String(r["contract_id"]);
      const arr = winnersByLot.get(k) ?? [];
      arr.push({
        entityId: String(r["entity_id"]),
        name: (r["name_display"] as string | null) ?? null,
      });
      winnersByLot.set(k, arr);
    }
  }

  return {
    caNoticeId: cid,
    noticeNo: (h["notice_no"] as string | null) ?? null,
    procedureType: (h["procedure_type"] as string | null) ?? null,
    acquisitionType: (h["acquisition_type"] as string | null) ?? null,
    stateDate: (h["state_date"] as string | null) ?? null,
    estimatedValueRon: h["estimated_value_ron"] != null ? Number(h["estimated_value_ron"]) : null,
    awardValueRon: h["ron_contract_value"] != null ? Number(h["ron_contract_value"]) : null,
    lowestOfferRon: h["lowest_offer_value"] != null ? Number(h["lowest_offer_value"]) : null,
    highestOfferRon: h["highest_offer_value"] != null ? Number(h["highest_offer_value"]) : null,
    cpvCode: (h["cpv_code"] as string | null) ?? null,
    cpvName: (h["cpv_name"] as string | null) ?? null,
    authority:
      h["authority_entity_id"] != null
        ? {
            entityId: String(h["authority_entity_id"]),
            name: (h["auth_name"] as string | null) ?? null,
            county: (h["auth_county"] as string | null) ?? null,
          }
        : null,
    tedNoticeNo: (h["ted_no"] as string | null) ?? null,
    nLots,
    totalContractValue: agg[0]?.total != null ? Number(agg[0].total) : null,
    lots: lots.map((l) => ({
      natId: String(l["nat_id"]),
      contractNo: (l["contract_no"] as string | null) ?? null,
      title: (l["title"] as string | null) ?? null,
      contractDate: (l["contract_date"] as string | null) ?? null,
      contractValue: l["contract_value"] != null ? Number(l["contract_value"]) : null,
      winners: winnersByLot.get(String(l["id"])) ?? [],
    })),
    page: Math.max(1, page),
    pageSize,
  };
}

export interface NotableFinding {
  flagCode: string;
  subjectType: string;
  entityId: string | null;
  entityName: string | null;
  county: string | null;
  severity: number | null;
  totalRon: number;
}

/**
 * Home "Descoperiri recente": the largest flag instances, one per flag code —
 * biggest-money signals first, deduplicated so the teaser shows variety.
 */
export async function getNotableFindings(limit = 2): Promise<NotableFinding[]> {
  const sql = db();
  const rows = (await sql`
    select distinct on (flag_code)
      flag_code, subject_type, entity_id, entity_name, entity_county, severity, total_ron
    from marts.flag_instances
    where total_ron is not null and entity_name is not null
    order by flag_code, total_ron desc
  `) as unknown as {
    flag_code: string;
    subject_type: string;
    entity_id: string | null;
    entity_name: string | null;
    entity_county: string | null;
    severity: string | null;
    total_ron: string;
  }[];
  return rows
    .sort((a, b) => Number(b.total_ron) - Number(a.total_ron))
    .slice(0, limit)
    .map((r) => ({
      flagCode: r.flag_code,
      subjectType: r.subject_type,
      entityId: r.entity_id === null ? null : String(r.entity_id),
      entityName: r.entity_name,
      county: r.entity_county,
      severity: r.severity === null ? null : Number(r.severity),
      totalRon: Number(r.total_ron),
    }));
}

/** Total browsable risk-signal instances (home stat). */
export async function getFlagInstanceCount(): Promise<number> {
  const sql = db();
  const rows = (await sql`select count(*) n from marts.flag_instances`) as unknown as {
    n: string;
  }[];
  return Number(rows[0]?.n ?? 0);
}

/**
 * CRI histogram for the /semnale side panel: 10 buckets over [0,1], same
 * population rule as the group list (role + ≥10 direct acquisitions),
 * optionally within one county.
 */
export async function getCriDistribution(
  role: Role,
  county: string | null,
): Promise<{ from: number; to: number; n: number }[]> {
  const sql = db();
  const jud = county ? sql`and lower(unaccent(county)) = lower(unaccent(${county}))` : sql``;
  const rows = (await sql`
    select width_bucket(coalesce(cri, 0), 0, 1.0000001, 10) b, count(*) n
    from marts.entity_flags
    where role = ${role} and n_das >= 10 ${jud}
    group by 1 order by 1
  `) as unknown as { b: number; n: string }[];
  const by = new Map(rows.map((r) => [Number(r.b), Number(r.n)]));
  return Array.from({ length: 10 }, (_, i) => ({ from: i / 10, to: (i + 1) / 10, n: by.get(i + 1) ?? 0 }));
}
