import { createDb, type DbSql } from "@seap/db";
import { FLAG_META } from "./flags";
import { COUNTIES } from "./counties";
import type { FlagInstance, RiskEntity, RiskGroupSort, Role } from "./marts";

export const SIGNAL_PAGE_SIZE = 50;
export const RISK_PAGE_SIZE = 10;
export const RISK_SORTS: RiskGroupSort[] = ["cri", "flags", "das", "total", "name"];
export interface SignalState {
  code: string;
  role: Role;
  county: string | null;
  page: number;
  band: { from: number; to: number } | null;
  sort: RiskGroupSort;
  dir: "asc" | "desc";
}
const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function parseSignalState(params: Record<string, string | undefined>): SignalState {
  const code = params.tip && Object.hasOwn(FLAG_META, params.tip) ? params.tip : "da_split";
  const role = params.rol === "supplier" ? "supplier" : "authority";
  const county = params.jud?.trim() ? COUNTIES.find((name) => fold(name) === fold(params.jud!.trim())) ?? params.jud.trim().slice(0, 100) : null;
  const from = Number(params.criMin), to = Number(params.criMax);
  const validBand = params.criMin !== undefined && params.criMax !== undefined && Number.isFinite(from) && Number.isFinite(to) && from >= 0 && to <= 1 && from < to;
  const sort = RISK_SORTS.includes(params.sort as RiskGroupSort) ? params.sort as RiskGroupSort : "cri";
  const p = Number(params.p ?? 0);
  return { code, role, county, page: Number.isSafeInteger(p) && p >= 0 ? p : 0,
    band: validBand ? { from, to } : null, sort,
    dir: params.dir === "asc" || params.dir === "desc" ? params.dir : sort === "name" ? "asc" : "desc" };
}

/** Every navigation keeps the applied role/county; changing a condition resets paging. */
export function signalUrl(state: SignalState, patch: Partial<SignalState> = {}): string {
  const next = { ...state, ...patch };
  const changedFilter = ["code", "role", "county", "band", "sort", "dir"].some((key) => Object.hasOwn(patch, key));
  const page = patch.page ?? (changedFilter ? 0 : state.page);
  const q = new URLSearchParams({ tip: next.code, rol: next.role });
  if (next.county) q.set("jud", next.county);
  if (next.band) {
    q.set("criMin", String(next.band.from)); q.set("criMax", String(next.band.to));
    if (next.sort !== "cri" || next.dir !== "desc") { q.set("sort", next.sort); q.set("dir", next.dir); }
  }
  if (page > 0) q.set("p", String(page));
  return `/semnale?${q.toString()}`;
}

export interface SignalInstance extends FlagInstance {
  id: string;
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

/** Core flags already contain the calibrated materiality/threshold rules.
 * This reads the complete triggered population, never the 500-example mart.
 * Each branch emits a flag once. Supplier award membership uses EXISTS so a
 * consortium cannot multiply the number of signals or its notice value. */
export function signalPopulation(sql: DbSql, state: Pick<SignalState, "role" | "county">, code?: string) {
  const type = code ? sql`and f.flag_code = ${code}` : sql``;
  const entityId = state.role === "authority" ? sql`f.subject_id` : sql`case when f.subject_type = 'pair' then f.partner_id else f.subject_id end`;
  const partnerId = state.role === "authority" ? sql`f.partner_id` : sql`case when f.subject_type = 'pair' then f.subject_id else f.partner_id end`;
  const daEntity = state.role === "authority" ? sql`da.authority_entity_id` : sql`da.supplier_entity_id`;
  const daPartner = state.role === "authority" ? sql`da.supplier_entity_id` : sql`da.authority_entity_id`;
  const countyFor = (id: typeof entityId) => state.county
    ? sql`and exists (select 1 from core.entities county_entity where county_entity.id = ${id} and lower(unaccent(county_entity.county)) = lower(unaccent(${state.county})))`
    : sql``;
  const awardMembership = state.role === "authority"
    ? sql`aw.authority_entity_id is not null ${countyFor(sql`aw.authority_entity_id`)}`
    : sql`exists (select 1 from core.contracts c join core.contract_winners cw on cw.contract_id = c.id
        where c.ca_notice_id = aw.ca_notice_id ${countyFor(sql`cw.entity_id`)})`;
  return sql`(
    select f.id, f.flag_code, f.subject_type, ${entityId} entity_id, ${partnerId} partner_id,
      f.severity, coalesce(nullif(f.evidence->>'total',''), nullif(f.evidence->>'public_total',''), nullif(f.evidence->>'combined',''))::numeric total_ron,
      f.period, f.evidence, f.methodology_version, null::bigint source_id
    from core.flags f
    where f.triggered and f.subject_type in (${state.role}, 'pair') ${type}
      and ${entityId} is not null ${countyFor(entityId)}
    union all
    select f.id, f.flag_code, f.subject_type, ${daEntity}, ${daPartner}, f.severity,
      da.closing_value, f.period, f.evidence, f.methodology_version, da.sicap_da_id
    from core.flags f join core.direct_acquisitions da on da.id = f.subject_id
    where f.triggered and f.subject_type = 'da' ${type} and ${daEntity} is not null ${countyFor(daEntity)}
    union all
    select f.id, f.flag_code, f.subject_type, aw.authority_entity_id, null::bigint, f.severity,
      aw.ron_contract_value, f.period, f.evidence, f.methodology_version, aw.ca_notice_id
    from core.flags f join core.awards aw on aw.id = f.subject_id
    where f.triggered and f.subject_type = 'award' ${type} and ${awardMembership}
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
      select selected.*, e.name_display entity_name, e.county entity_county, p.name_display partner_name,
        case when selected.subject_type = 'award' then (
          select coalesce(jsonb_agg(winner order by winner.entity_id), '[]'::jsonb) from (
            select distinct cw.entity_id::text entity_id, we.name_display name, we.county
            from core.contracts c join core.contract_winners cw on cw.contract_id = c.id
            left join core.entities we on we.id = cw.entity_id where c.ca_notice_id = selected.source_id
          ) winner
        ) else '[]'::jsonb end winners
      from (select * from ${population} population
        order by total_ron desc nulls last, severity desc nulls last, id limit ${SIGNAL_PAGE_SIZE} offset ${page * SIGNAL_PAGE_SIZE}) selected
      left join core.entities e on e.id = selected.entity_id
      left join core.entities p on p.id = selected.partner_id
      order by selected.total_ron desc nulls last, selected.severity desc nulls last, selected.id`;
    return { total, page, pageSize: SIGNAL_PAGE_SIZE, rows: rows.map((r) => ({
      id: String(r.id), flagCode: String(r.flag_code), subjectType: String(r.subject_type),
      entityId: r.entity_id == null ? null : String(r.entity_id), entityName: r.entity_name ?? null, entityCounty: r.entity_county ?? null,
      partnerId: r.partner_id == null ? null : String(r.partner_id), partnerName: r.partner_name ?? null,
      severity: Number(r.severity ?? 0), totalRon: Number(r.total_ron ?? 0), period: r.period ?? null, evidence: r.evidence ?? null,
      sourceId: r.source_id == null ? null : String(r.source_id), methodology: String(r.methodology_version),
      winners: (r.winners as { entity_id: string; name: string | null; county: string | null }[]).map((winner) => ({ entityId: winner.entity_id, name: winner.name, county: winner.county })),
    })) };
  });
}

/** Complete CRI cohort, retaining the existing ≥10-DA rule and histogram's
 * actual width_bucket boundaries (not rounded labels such as 0.2). */
export async function readSignalRiskGroup(sql: DbSql, state: SignalState) {
  if (!state.band) throw new Error("Interval CRI lipsă.");
  const { from, to } = state.band;
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    const q = tx as unknown as DbSql;
    await q`set local statement_timeout = '20s'`;
    const tenthBand = Math.abs(from * 10 - Math.round(from * 10)) < 1e-8 && Math.abs(to * 10 - Math.round(to * 10)) < 1e-8;
    const band = tenthBand ? q`width_bucket(coalesce(cri, 0), 0, 1.0000001, 10) between ${Math.round(from * 10) + 1} and ${Math.round(to * 10)}`
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
