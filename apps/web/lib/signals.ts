import { createDb, type DbSql } from "@seap/db";
import type { FlagInstance, RiskEntity } from "./marts";

import { SIGNAL_PAGE_SIZE, RISK_PAGE_SIZE, type SignalState } from "./signals-shared";
export * from "./signals-shared";

export interface SignalInstance extends FlagInstance {
  id: string;
  totalExact: string | null;
  subjectType: string;
  sourceId: string | null;
  methodology: string;
  /** Award signals are one occurrence, even when several suppliers won. */
  winners: { entityId: string; name: string | null; county: string | null }[];
}
export interface SignalPage { rows: SignalInstance[]; total: number; page: number; pageSize: number }
export interface SignalOverview {
  counts: Record<string, number>;
  distribution: { from: number; to: number; n: number }[];
  leaderboard: RiskEntity[];
}
const globalDb = globalThis as unknown as { __seapSignalSql?: DbSql };
const database = () => globalDb.__seapSignalSql ??= createDb().sql;

/** Complete population refreshed with transaction marts, never the 500-example
 * flag_instances mart. A notice is counted once even with several winners. */
export function signalPopulation(sql: DbSql, state: Pick<SignalState, "role" | "county">, code?: string) {
  const entityId = state.role === "authority" ? sql`f.entity_id`
    : sql`case when f.subject_type in ('pair', 'da') then f.partner_id else f.entity_id end`;
  const partnerId = state.role === "authority" ? sql`f.partner_id`
    : sql`case when f.subject_type in ('pair', 'da') then f.entity_id else f.partner_id end`;
  const countyFor = (id: typeof entityId) => state.county
    ? sql`and exists (select 1 from core.entities county_entity where county_entity.id = ${id}
        and lower(unaccent(county_entity.county)) = lower(unaccent(${state.county})))` : sql``;
  const awardMembership = state.role === "authority"
    ? sql`f.entity_id is not null ${countyFor(sql`f.entity_id`)}`
    : sql`exists (select 1 from core.contracts c join core.contract_winners cw on cw.contract_id = c.id
        where c.ca_notice_id = f.source_id ${countyFor(sql`cw.entity_id`)})`;
  const type = code ? sql`and f.flag_code = ${code}` : sql``;
  return sql`(
    select f.id, f.flag_code, f.subject_type, ${entityId} entity_id, ${partnerId} partner_id,
      f.severity, f.total_ron, f.source_id
    from marts.signal_lookup f
    where f.subject_type in (${state.role}, 'pair') ${type}
      and ${entityId} is not null ${countyFor(entityId)}
    union all
    select f.id, f.flag_code, f.subject_type, ${entityId}, ${partnerId}, f.severity, f.total_ron, f.source_id
    from marts.signal_lookup f
    where f.subject_type = 'da' ${type} and ${entityId} is not null ${countyFor(entityId)}
    union all
    select f.id, f.flag_code, f.subject_type, f.entity_id, f.partner_id, f.severity, f.total_ron, f.source_id
    from marts.signal_lookup f where f.subject_type = 'award' ${type} and ${awardMembership}
  )`;
}

interface RiskRow { entity_id: string; name_display: string | null; county: string | null; cri: string | null; n_flags: number; n_das: number; total_ron: string | null; flags: string[] | null }
const riskRow = (r: RiskRow): RiskEntity => ({ entityId: String(r.entity_id), name: r.name_display, county: r.county, cri: Number(r.cri ?? 0), nFlags: Number(r.n_flags), nDas: Number(r.n_das), totalRon: Number(r.total_ron ?? 0), flags: r.flags ?? [] });
const profileCounty = (sql: DbSql, county: string | null) => county ? sql`and lower(unaccent(county)) = lower(unaccent(${county}))` : sql``;

export async function readSignalOverview(sql: DbSql, state: SignalState): Promise<SignalOverview> {
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    const q = tx as unknown as DbSql;
    await q`set local statement_timeout = '20s'`;
    const population = signalPopulation(q, state);
    const counts = await q`select flag_code, count(*)::text n from ${population} population group by flag_code`;
    const county = profileCounty(q, state.county);
    const dist = await q`select width_bucket(coalesce(cri, 0), 0, 1.0000001, 10) b, count(*)::text n
      from marts.entity_flags where role = ${state.role} and n_das >= 10 ${county} group by 1`;
    const leaders = await q`select entity_id, name_display, county, cri, n_flags, n_das, total_ron, flags
      from marts.entity_flags where role = ${state.role} and n_das >= ${state.role === "authority" ? 30 : 10} and cri > 0 ${county}
      order by cri desc, total_ron desc nulls last, entity_id limit 12`;
    const by = new Map(dist.map((r) => [Number(r.b), Number(r.n)]));
    return { counts: Object.fromEntries(counts.map((r) => [String(r.flag_code), Number(r.n)])),
      distribution: Array.from({ length: 10 }, (_, i) => ({ from: i / 10, to: (i + 1) / 10, n: by.get(i + 1) ?? 0 })),
      leaderboard: (leaders as unknown as RiskRow[]).map(riskRow) };
  });
}

export async function readSignalPage(sql: DbSql, state: SignalState): Promise<SignalPage> {
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    const q = tx as unknown as DbSql;
    await q`set local statement_timeout = '20s'`;
    const population = signalPopulation(q, state, state.code);
    const totals = await q`select count(*)::text n from ${population} population`;
    const total = Number(totals[0]?.n ?? 0);
    const page = Math.min(state.page, Math.max(0, Math.ceil(total / SIGNAL_PAGE_SIZE) - 1));
    const rows = await q`
      select selected.*, selected.total_ron::text total_exact, f.period, f.evidence, f.methodology_version,
        case when selected.flag_code = 'da_round' then f.evidence || jsonb_build_object(
          'closing', f.evidence->>'closing', 'ceiling', f.evidence->>'ceiling') else f.evidence end display_evidence,
        e.name_display entity_name, e.county entity_county, p.name_display partner_name,
        case when selected.subject_type = 'award' then (
          select coalesce(jsonb_agg(winner order by winner.entity_id), '[]'::jsonb) from (
            select distinct cw.entity_id::text entity_id, we.name_display name, we.county
            from core.contracts c join core.contract_winners cw on cw.contract_id = c.id
            left join core.entities we on we.id = cw.entity_id where c.ca_notice_id = selected.source_id
          ) winner
        ) else '[]'::jsonb end winners
      from (select * from ${population} population
        order by total_ron desc nulls last, severity desc nulls last, id limit ${SIGNAL_PAGE_SIZE} offset ${page * SIGNAL_PAGE_SIZE}) selected
      join core.flags f on f.id = selected.id
      left join core.entities e on e.id = selected.entity_id
      left join core.entities p on p.id = selected.partner_id
      order by selected.total_ron desc nulls last, selected.severity desc nulls last, selected.id`;
    return { total, page, pageSize: SIGNAL_PAGE_SIZE, rows: rows.map((r) => ({
      id: String(r.id), totalExact: r.total_exact ?? null, flagCode: String(r.flag_code), subjectType: String(r.subject_type),
      entityId: r.entity_id == null ? null : String(r.entity_id), entityName: r.entity_name ?? null, entityCounty: r.entity_county ?? null,
      partnerId: r.partner_id == null ? null : String(r.partner_id), partnerName: r.partner_name ?? null,
      severity: Number(r.severity ?? 0), totalRon: Number(r.total_ron ?? 0), period: r.period ?? null, evidence: r.display_evidence ?? r.evidence ?? null,
      sourceId: r.source_id == null ? null : String(r.source_id), methodology: String(r.methodology_version),
      winners: (r.winners as { entity_id: string; name: string | null; county: string | null }[]).map((winner) => ({ entityId: winner.entity_id, name: winner.name, county: winner.county })),
    })) };
  });
}

/** Complete CRI cohort, retaining the existing ≥10-DA rule and histogram's
 * actual width_bucket boundaries (not rounded labels such as 0.2). */
export async function readSignalRiskGroup(sql: DbSql, state: SignalState) {
  const { from, to } = state.band ?? { from: 0, to: 1 };
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    const q = tx as unknown as DbSql;
    await q`set local statement_timeout = '20s'`;
    const tenthBand = Math.abs(from * 10 - Math.round(from * 10)) < 1e-8 && Math.abs(to * 10 - Math.round(to * 10)) < 1e-8;
    const band = state.criteria !== null ? q`n_flags = ${state.criteria}` : !state.band ? q`true` : tenthBand ? q`width_bucket(coalesce(cri, 0), 0, 1.0000001, 10) between ${Math.round(from * 10) + 1} and ${Math.round(to * 10)}`
      : to === 1 ? q`coalesce(cri, 0) >= ${from} and coalesce(cri, 0) <= ${to}` : q`coalesce(cri, 0) >= ${from} and coalesce(cri, 0) < ${to}`;
    const where = q`role = ${state.role} and n_das >= 10 and ${band} ${profileCounty(q, state.county)}`;
    const totals = await q`select count(*)::text n from marts.entity_flags where ${where}`;
    const total = Number(totals[0]?.n ?? 0);
    const page = Math.min(state.page, Math.max(0, Math.ceil(total / RISK_PAGE_SIZE) - 1));
    const col = { cri: q`coalesce(cri, 0)`, flags: q`n_flags`, das: q`n_das`, total: q`coalesce(total_ron, 0)`, name: q`lower(unaccent(coalesce(name_display, '')))` }[state.sort];
    const order = state.dir === "asc" ? q`${col} asc` : q`${col} desc`;
    const rows = await q`select entity_id, name_display, county, cri, n_flags, n_das, total_ron, flags
      from marts.entity_flags where ${where} order by ${order}, total_ron desc nulls last, entity_id
      limit ${RISK_PAGE_SIZE} offset ${page * RISK_PAGE_SIZE}`;
    return { total, page, pageSize: RISK_PAGE_SIZE, rows: (rows as unknown as RiskRow[]).map(riskRow) };
  });
}

export const getSignalOverview = (state: SignalState) => readSignalOverview(database(), state);
export const getSignalPage = (state: SignalState) => readSignalPage(database(), state);
export const getSignalRiskGroup = (state: SignalState) => readSignalRiskGroup(database(), state);

/** Counts only: the signal view does not compute unused CRI leaders/distribution. */
export async function readSignalTypeCounts(sql: DbSql, state: SignalState): Promise<Record<string, number>> {
  return sql.begin("isolation level repeatable read read only", async tx => {
    const q = tx as unknown as DbSql;
    await q`set local statement_timeout = '20s'`;
    const population = signalPopulation(q, state);
    const rows = await q`select flag_code, count(*)::text n from ${population} population group by flag_code`;
    return Object.fromEntries(rows.map(r => [String(r.flag_code), Number(r.n)]));
  });
}
export async function readRiskCriteriaDistribution(sql: DbSql, state: SignalState) {
  return sql.begin("isolation level repeatable read read only", async tx => {
    const q = tx as unknown as DbSql;
    await q`set local statement_timeout = '20s'`;
    const rows = await q`select n_flags, count(*)::text n from marts.entity_flags
      where role = ${state.role} and n_das >= 10 ${profileCounty(q, state.county)} group by n_flags order by n_flags`;
    return rows.map(r => ({ criteria: Number(r.n_flags), n: Number(r.n) }));
  });
}
export const getSignalTypeCounts = (state: SignalState) => readSignalTypeCounts(database(), state);
export const getRiskCriteriaDistribution = (state: SignalState) => readRiskCriteriaDistribution(database(), state);
