import { createDb, type DbSql } from "@seap/db";
import type { FlagInstance, RiskEntity } from "./marts";
import type { ScoreParts } from "./risk-score";
import { riskActive } from "./ask/entity-card";
import { SPLIT_COUNTS_ABOVE } from "./signal-mirror";

import { SIGNAL_PAGE_SIZE, RISK_PAGE_SIZE, signalColumns, signalFiltered, type SignalState } from "./signals-shared";
import { RISK_CRITERIA } from "./risk-score";
import { channelWhere, facetOf, normalizedPattern, type Binding, type Channel, type FacetRequest, type FilterSource, type Fragment } from "./table-filters/server/query";
import type { Facet } from "./table-filters/types";
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
/** `under`: the national list of „Adunate, trec de plafon” leaves out the groups at 1,2× the ceiling or under, unless asked (UX audit Z6-04); how many. */
export interface SignalPage { rows: SignalInstance[]; total: number; page: number; pageSize: number; under?: number }
const globalDb = globalThis as unknown as { __seapSignalSql?: DbSql };
const database = () => globalDb.__seapSignalSql ??= createDb().sql;

/** Complete population refreshed with transaction marts, never the 500-example
 * flag_instances mart. A notice is counted once even with several winners. */
export function signalPopulation(sql: DbSql, state: Pick<SignalState, "role" | "county"> & { entity?: string | null }, code?: string) {
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
        where c.ca_notice_id = f.source_id and cw.entity_id is distinct from f.entity_id ${countyFor(sql`cw.entity_id`)})`;
  const type = code ? sql`and f.flag_code = ${code}` : sql``;
  // One entity's occurrences in the same population, so its profile counts equal
  // /entitati/{id}/semnale. The endpoint test is exact; the OR only lets the planner use
  // the entity/partner indexes. A supplier's award signals are the notices it won;
  // an authority recorded as winner of its own notice is not a supplier (audit F12).
  const entity = state.entity ?? null;
  const ownEntity = entity === null ? sql``
    : sql`and ${entityId} = ${entity} and (f.entity_id = ${entity} or f.partner_id = ${entity})`;
  const ownAward = entity === null ? sql``
    : state.role === "authority" ? sql`and f.entity_id = ${entity}`
    : sql`and f.entity_id is distinct from ${entity} and f.source_id in (select own_c.ca_notice_id from core.contract_winners own_cw
        join core.contracts own_c on own_c.id = own_cw.contract_id where own_cw.entity_id = ${entity})`;
  return sql`(
    select f.id, f.flag_code, f.subject_type, ${entityId} entity_id, ${partnerId} partner_id,
      f.severity, f.total_ron, f.source_id
    from marts.signal_lookup f
    where f.subject_type in (${state.role}, 'pair') ${type}
      and ${entityId} is not null ${countyFor(entityId)} ${ownEntity}
    union all
    select f.id, f.flag_code, f.subject_type, ${entityId}, ${partnerId}, f.severity, f.total_ron, f.source_id
    from marts.signal_lookup f
    where f.subject_type = 'da' ${type} and ${entityId} is not null ${countyFor(entityId)} ${ownEntity}
    union all
    select f.id, f.flag_code, f.subject_type, f.entity_id, f.partner_id, f.severity, f.total_ron, f.source_id
    from marts.signal_lookup f where f.subject_type = 'award' ${type} and ${awardMembership} ${ownAward}
  )`;
}

/**
 * A group of „Adunate, trec de plafon” that adds to the score by its multiple: above 1,2 times its ceiling (signal-mirror
 * SPLIT_COUNTS_ABOVE, read from the build's evidence). `alias` is a row of the population, its id core.flags'.
 */
const splitScored = (sql: DbSql, alias: string) => sql`(select (sf.evidence->>'total')::numeric / nullif((sf.evidence->>'ceiling')::numeric, 0)
  from core.flags sf where sf.id = ${sql(alias)}.id) > ${SPLIT_COUNTS_ABOVE}`;
/** The national list leaves the groups under 1,2× out (owner, 16 November 2026, variant B of Z6-04); a case page lists them all. */
const leavesUnder = (state: SignalState) => state.code === "da_split" && !state.entity && !state.under;

interface RiskRow { entity_id: string; name_display: string | null; county: string | null; cri: string | null; n_flags: number; n_das: number; total_ron: string | null; flags: string[] | null; score: number; score_parts?: ScoreParts | null; historic?: string | null }
const riskRow = (r: RiskRow): RiskEntity & { historic?: string } => ({ entityId: String(r.entity_id), name: r.name_display, county: r.county, cri: Number(r.cri ?? 0), nFlags: Number(r.n_flags), nDas: Number(r.n_das), totalRon: Number(r.total_ron ?? 0), flags: r.flags ?? [], score: Number(r.score ?? 0), parts: r.score_parts ?? {},
  ...(typeof r.historic === "string" ? { historic: r.historic } : {}) });
/** The ranking's profiles with a record in the last 24 months (lib/ask/entity-card.ts riskActive); `ef` is marts.entity_flags. */
const activeOnly = (sql: DbSql, state: Pick<SignalState, "inactive">) => state.inactive ? sql`` : sql`and ${riskActive(sql, "ef")}`;
/** One page of /semnale's risk list, and how many inactive profiles its selection has (left out, or listed). */
export interface SignalRiskGroup { rows: (RiskEntity & { historic?: string })[]; page: number; total: number; pageSize: number; inactive: number }
const profileCounty = (sql: DbSql, county: string | null) => county ? sql`and lower(unaccent(county)) = lower(unaccent(${county}))` : sql``;

/** A number of a pattern's evidence, or null when it is not one. */
const evidenceNumber = (sql: DbSql, key: string) => sql`(case when population.evidence->>${key} ~ '^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$' then (population.evidence->>${key})::numeric end)`;
/**
 * The number a pattern's row shows on its right (CaseMeter.tsx), as SQL for its funnel: the same reading of the same
 * evidence. Null for a pattern without one.
 */
function measureOf(sql: DbSql, code: string): ReturnType<DbSql> | null {
  const n = (key: string) => evidenceNumber(sql, key);
  switch (code) {
    case "da_split": return sql`${n("total")} / nullif(${n("ceiling")}, 0)`;
    case "da_round": return sql`${n("ceiling")} - ${n("closing")}`;
    case "da_above_ceiling": return sql`(case when population.evidence->>'basis' = 'estimate' then coalesce(nullif(${n("estimate")}, 0), ${n("closing")}) else ${n("closing")} end) - ${n("ceiling")}`;
    case "da_year_end": return sql`100 * coalesce(nullif(${n("december_pct")}, 0), ${n("december")} / nullif(${n("total")}, 0))`;
    case "da_concentration": return sql`100 * ${n("top_supplier_pct")}`;
    case "da_dependence": return sql`100 * ${n("top_authority_pct")}`;
    case "da_capacity": return sql`${n("ratio")}`;
    case "da_first_month": case "da_first_month_buyer": return sql`${n("age_days")}`;
    default: return null;
  }
}
/** An entity column of a list: its ids counted, named and searched from core.entities. */
const entityBinding = (sql: DbSql, id: ReturnType<DbSql>): Binding => ({
  kind: "list", value: sql`(${id})::text`,
  match: (ids) => sql`${id} = any(${sql.array(ids.filter((v) => /^\d+$/.test(v)))}::bigint[])`,
  names: {
    lookup: (ids) => sql`select id::text v, name_display l from core.entities where id = any(${sql.array(ids.filter((v) => /^\d+$/.test(v)))}::bigint[])`,
    search: (term) => sql`${id} in (select id from core.entities where name_normalized like ${normalizedPattern(term)})`,
  },
});

/**
 * A pattern's cases under the column filters (owner, 20 November 2026): the population of the list (its scored groups
 * only, for „Adunate, trec de plafon” when the list leaves the others out), each row with its period and evidence for
 * the year and the measure. The same channel counts each funnel's options under the other filters.
 */
export function signalCaseSource(sql: DbSql, state: SignalState): { source: FilterSource; channel: Channel } {
  const all = signalPopulation(sql, state, state.code);
  const measure = measureOf(sql, state.code);
  const channel: Channel = {
    name: "cases",
    from: sql`(select p.*, cf.period, cf.evidence from ${all} p join core.flags cf on cf.id = p.id) population`,
    where: (leavesUnder(state) ? splitScored(sql, "population") : sql`true`) as Fragment,
    bindings: {
      cine: entityBinding(sql, sql`population.entity_id`),
      partener: entityBinding(sql, sql`population.partner_id`),
      an: { kind: "list", value: sql`case when population.period ~ '^[0-9]{4}$' then population.period end` },
      ...(measure ? { masura: { kind: "range", value: measure } satisfies Binding } : {}),
      valoare: { kind: "range", value: sql`population.total_ron` },
    },
  };
  return { source: { columns: signalColumns(state), channels: [channel] }, channel };
}

/** The ranking's profiles under the column filters: the same selection, each column bound to marts.entity_flags. */
export function signalRiskSource(sql: DbSql, state: SignalState): { source: FilterSource; channel: Channel } {
  const criteria: string[] = [...RISK_CRITERIA[state.role]];
  const { from, to } = state.band ?? { from: 0, to: 1 };
  const lo = Math.round(from * 100), hi = Math.round(to * 100);
  const band = state.criteria !== null ? sql`n_flags = ${state.criteria}` : !state.band ? sql`true`
    : hi >= 100 ? sql`score >= ${lo}` : sql`score >= ${lo} and score < ${hi}`;
  const channel: Channel = {
    name: "risk",
    from: sql`marts.entity_flags ef`,
    where: sql`role = ${state.role} and n_das >= 10 and ${band} ${profileCounty(sql, state.county)} ${activeOnly(sql, state)}`,
    bindings: {
      nume: entityBinding(sql, sql`ef.entity_id`),
      tipare: {
        kind: "list", value: sql`unnest(array(select x from jsonb_array_elements_text(coalesce(ef.flags, '[]'::jsonb)) x where x = any(${sql.array(criteria)}::text[])))`,
        match: (codes) => sql`ef.flags ?| ${sql.array(codes.filter((c) => criteria.includes(c)))}::text[]`,
      },
      achizitii: { kind: "range", value: sql`ef.n_das` },
      valoare: { kind: "range", value: sql`ef.total_ron` },
      risc: { kind: "range", value: sql`coalesce(ef.score, 0)` },
    },
  };
  return { source: { columns: signalColumns(state), channels: [channel] }, channel };
}

/** A funnel's options on /semnale, under the other filters: the list of the state's view. */
export async function readSignalFacet(sql: DbSql, state: SignalState, key: string, request: FacetRequest = {}): Promise<Facet> {
  // facetOf opens its own read-only transaction with the request's time budget.
  const { source } = state.view === "cri" ? signalRiskSource(sql, state) : signalCaseSource(sql, state);
  return facetOf(sql, source, key, state.filters, request);
}
export const getSignalFacet = (state: SignalState, key: string, request: FacetRequest = {}) => readSignalFacet(database(), state, key, request);

/** One page of a signal type's occurrences, largest first; an entity's case page reads longer pages (CASE_PAGE_SIZE). */
export async function readSignalPage(sql: DbSql, state: SignalState, pageSize = SIGNAL_PAGE_SIZE): Promise<SignalPage> {
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    const q = tx as unknown as DbSql;
    await q`set local statement_timeout = '20s'`;
    const all = signalPopulation(q, state, state.code);
    // Under column filters the list is the case source's rows that pass them (owner, 20 November 2026).
    const filtered = signalFiltered(state) ? (() => { const { channel } = signalCaseSource(q, state); const where = channelWhere(q, channel, state.filters);
      return where === null ? q`(select * from ${all} none where false)` : q`(select population.id, population.flag_code, population.subject_type, population.entity_id,
        population.partner_id, population.severity, population.total_ron, population.source_id from ${channel.from} where ${where})`; })() : null;
    const population = filtered ?? (leavesUnder(state) ? q`(select scored.* from ${all} scored where ${splitScored(q, "scored")})` : all);
    const totals = await q`select count(*)::text n from ${population} population`;
    const total = Number(totals[0]?.n ?? 0);
    // How many groups under 1,2× the national list has: left out (the line that brings them back), or listed on request.
    const under = state.code === "da_split" && !state.entity && !filtered
      ? Number((await q`select count(*)::int n from ${all} population where not ${splitScored(q, "population")}`)[0]?.n ?? 0) : undefined;
    const page = Math.min(state.page, Math.max(0, Math.ceil(total / pageSize) - 1));
    const rows = await q`
      select selected.*, selected.total_ron::text total_exact, f.period, f.evidence, f.methodology_version,
        case when selected.flag_code = 'da_round' then f.evidence || jsonb_build_object(
          'closing', f.evidence->>'closing', 'ceiling', f.evidence->>'ceiling') else f.evidence end display_evidence,
        e.name_display entity_name, e.county entity_county, p.name_display partner_name,
        case when selected.subject_type = 'award' then (
          -- The winners of the contracts the signal cites (a single bid: its lots), else of the notice; the largest first
          -- (UX audit Z6-06: they are named on the case page's rows).
          select coalesce(jsonb_agg(jsonb_build_object('entity_id', winner.entity_id, 'name', winner.name, 'county', winner.county)
            order by winner.cited_value desc nulls last, winner.won desc nulls last, winner.entity_id), '[]'::jsonb) from (
            select cw.entity_id::text entity_id, max(we.name_display) name, max(we.county) county, sum(c.value_ron) won,
              bool_or(c.ca_notice_contract_id::text in (select x->>'contract_id' from jsonb_array_elements(case when jsonb_typeof(f.evidence->'contracts') = 'array'
                then f.evidence->'contracts' else '[]'::jsonb end) x)) cited,
              sum(c.value_ron) filter (where c.ca_notice_contract_id::text in (select x->>'contract_id' from jsonb_array_elements(case when jsonb_typeof(f.evidence->'contracts') = 'array'
                then f.evidence->'contracts' else '[]'::jsonb end) x)) cited_value
            from core.contracts c join core.contract_winners cw on cw.contract_id = c.id
            left join core.entities we on we.id = cw.entity_id where c.ca_notice_id = selected.source_id
              and cw.entity_id is distinct from selected.entity_id
            group by cw.entity_id
          ) winner where winner.cited or not exists (select 1 from core.contracts cc where cc.ca_notice_id = selected.source_id
            and cc.ca_notice_contract_id::text in (select x->>'contract_id' from jsonb_array_elements(case when jsonb_typeof(f.evidence->'contracts') = 'array'
              then f.evidence->'contracts' else '[]'::jsonb end) x))
        ) else '[]'::jsonb end winners
      from (select * from ${population} population
        order by total_ron desc nulls last, severity desc nulls last, id limit ${pageSize} offset ${page * pageSize}) selected
      join core.flags f on f.id = selected.id
      left join core.entities e on e.id = selected.entity_id
      left join core.entities p on p.id = selected.partner_id
      order by selected.total_ron desc nulls last, selected.severity desc nulls last, selected.id`;
    return { total, page, pageSize, ...(under !== undefined ? { under } : {}), rows: rows.map((r) => ({
      id: String(r.id), totalExact: r.total_exact ?? null, flagCode: String(r.flag_code), subjectType: String(r.subject_type),
      entityId: r.entity_id == null ? null : String(r.entity_id), entityName: r.entity_name ?? null, entityCounty: r.entity_county ?? null,
      partnerId: r.partner_id == null ? null : String(r.partner_id), partnerName: r.partner_name ?? null,
      severity: Number(r.severity ?? 0), totalRon: Number(r.total_ron ?? 0), period: r.period ?? null, evidence: r.display_evidence ?? r.evidence ?? null,
      sourceId: r.source_id == null ? null : String(r.source_id), methodology: String(r.methodology_version),
      winners: (r.winners as { entity_id: string; name: string | null; county: string | null }[]).map((winner) => ({ entityId: winner.entity_id, name: winner.name, county: winner.county })),
    })) };
  });
}

/**
 * The profiles of /semnale's risk list (≥ 10 DAs). A band is a range of the
 * risk score: the link keeps it on 0–1 (criMin=0.4&criMax=0.5 is 40–49%),
 * the last one includes 100%. `criteria` is the number of patterns met.
 * Without `inactive` the list leaves out the profiles with no record in 24 months, as Întreabă's rankings by risk
 * (rf-2026.22 S8; owner, 16 November 2026), and counts them for the line that brings them back; listed, each says its last month.
 */
export async function readSignalRiskGroup(sql: DbSql, state: SignalState): Promise<SignalRiskGroup> {
  const { from, to } = state.band ?? { from: 0, to: 1 };
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    const q = tx as unknown as DbSql;
    await q`set local statement_timeout = '20s'`;
    const lo = Math.round(from * 100), hi = Math.round(to * 100);
    const band = state.criteria !== null ? q`n_flags = ${state.criteria}` : !state.band ? q`true`
      : hi >= 100 ? q`score >= ${lo}` : q`score >= ${lo} and score < ${hi}`;
    const columns = signalFiltered(state) ? channelWhere(q, { ...signalRiskSource(q, state).channel, where: q`true` }, state.filters) : q`true`;
    const selection = q`role = ${state.role} and n_das >= 10 and ${band} ${profileCounty(q, state.county)} and ${columns ?? q`false`}`;
    const where = q`${selection} ${activeOnly(q, state)}`;
    const [totals, old] = [await q`select count(*)::text n from marts.entity_flags ef where ${where}`,
      await q`select count(*)::int inactive from marts.entity_flags ef where ${selection} and not ${riskActive(q, "ef")}`];
    const total = Number(totals[0]?.n ?? 0);
    const page = Math.min(state.page, Math.max(0, Math.ceil(total / RISK_PAGE_SIZE) - 1));
    const col = { cri: q`score`, flags: q`n_flags`, das: q`n_das`, total: q`coalesce(total_ron, 0)`, name: q`lower(unaccent(coalesce(name_display, '')))` }[state.sort];
    const order = state.dir === "asc" ? q`${col} asc` : q`${col} desc`;
    // Listed, an inactive profile's last record (its day), for its tag; null for an active one (scatter.ts historicDay).
    const historic = state.inactive ? q`, case when ${riskActive(q, "ef")} then null else coalesce((select left(ep.last_activity, 10)
      from marts.entity_profile ep where ep.entity_id = ef.entity_id and ep.role = ef.role), '') end historic` : q``;
    const rows = await q`select entity_id, name_display, county, cri, n_flags, n_das, total_ron, flags, score, score_parts${historic}
      from marts.entity_flags ef where ${where} order by ${order}, total_ron desc nulls last, entity_id
      limit ${RISK_PAGE_SIZE} offset ${page * RISK_PAGE_SIZE}`;
    return { total, page, pageSize: RISK_PAGE_SIZE, inactive: Number(old[0]?.inactive ?? 0), rows: (rows as unknown as RiskRow[]).map(riskRow) };
  });
}

export const getSignalPage = (state: SignalState) => readSignalPage(database(), state);
export const getSignalRiskGroup = (state: SignalState) => readSignalRiskGroup(database(), state);

/** Counts only: the signal view does not compute unused CRI leaders/distribution. */
export async function readSignalTypeCounts(sql: DbSql, state: SignalState): Promise<Record<string, number>> {
  return sql.begin("isolation level repeatable read read only", async tx => {
    const q = tx as unknown as DbSql;
    await q`set local statement_timeout = '20s'`;
    const population = signalPopulation(q, state);
    // „Adunate, trec de plafon” counts the groups its list shows (above 1,2× unless the list includes them, UX audit Z6-04).
    const shown = state.under ? q`true` : q`(flag_code <> 'da_split' or ${splitScored(q, "population")})`;
    const rows = await q`select flag_code, count(*)::text n from ${population} population where ${shown} group by flag_code`;
    return Object.fromEntries(rows.map(r => [String(r.flag_code), Number(r.n)]));
  });
}
/**
 * How many profiles (≥ 10 DAs) in each tenth of the risk score: 0 alone, then 10–19 … 90–100 (none score 1–9); the
 * profiles the list shows, so without the inactive ones unless it includes them.
 */
export async function readRiskScoreDistribution(sql: DbSql, state: SignalState): Promise<{ bin: number; n: number }[]> {
  return sql.begin("isolation level repeatable read read only", async tx => {
    const q = tx as unknown as DbSql;
    await q`set local statement_timeout = '20s'`;
    const rows = await q`select case when score = 0 then 0 when score < 10 then 1 else least(score / 10, 9) * 10 end bin, count(*)::text n from marts.entity_flags ef
      where role = ${state.role} and n_das >= 10 ${profileCounty(q, state.county)} ${activeOnly(q, state)} group by 1 order by 1`;
    return rows.map(r => ({ bin: Number(r.bin), n: Number(r.n) }));
  });
}
export const getSignalTypeCounts = (state: SignalState) => readSignalTypeCounts(database(), state);

/** Every signal type of one entity in one role: the same population and counts
 * as /entitati/{id}/semnale, including types outside the CRI (procedures, MF, ONRC). */
export async function readEntitySignalCounts(sql: DbSql, entityId: string, role: SignalState["role"]): Promise<Record<string, number>> {
  if (!/^[1-9]\d{0,17}$/.test(entityId)) return {};
  return sql.begin("isolation level repeatable read read only", async tx => {
    const q = tx as unknown as DbSql;
    await q`set local statement_timeout = '20s'`;
    const population = signalPopulation(q, { role, county: null, entity: entityId });
    const rows = await q`select flag_code, count(*)::text n from ${population} population group by flag_code`;
    return Object.fromEntries(rows.map(r => [String(r.flag_code), Number(r.n)]));
  });
}
export const getEntitySignalCounts = (entityId: string, role: SignalState["role"]) => readEntitySignalCounts(database(), entityId, role);

export const getRiskScoreDistribution = (state: SignalState) => readRiskScoreDistribution(database(), state);
