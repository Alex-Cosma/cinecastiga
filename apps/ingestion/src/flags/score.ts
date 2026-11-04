import {
  PROFILE_FLAG_CODES, scoreCap, scoreOfCriteria, scorePoints, splitGroupWeight, strengthAbove, strengthCapacity,
  strengthConcentration, strengthDependence, strengthRound, strengthSplit, strengthYearEnd,
  type DbSql, type ProfileFlagCode, type ProfileFlagRole,
} from "@seap/db";
import { buyerRegimeSql, entityNameSql, INHOUSE_SUPPLIER_NAME, UTILITY_SUPPLIER_NAME } from "./regime.js";
import { daThresholdDateSql, daThresholdKeySql } from "./thresholds.js";

/*
 * The risk score of each profile (rf-2026.20, owner decisions of 3 November
 * 2026, after the six-reader audit of 200 profiles). The flag rules
 * (build.ts) decide which records a signal shows; this step measures how
 * pronounced each signal is against the size of the profile (strength x,
 * 0–3, the shared functions in @seap/db) and combines the families into the
 * score shown as "70 din 100". The design and its simulation on the local
 * copy: the risk-score audit of 3 November 2026.
 */

type Fragment = ReturnType<DbSql>;

/**
 * Exact Annex 2 CPVs (Legea 98/2016 art. 68(1)(h), art. 111: social and other
 * specific services with their own procedure below 3,741,750 lei). Repeated
 * purchases there count only at level 1 of "Achiziții repetate"; a purchase
 * there is never "Peste plafonul achiziției directe".
 */
export const ANNEX2_CPV_PATTERN = "^(75|80|85|92|551|552|553|554|5551|5552|791|7995|7970|7971|7972|641|98[1-2]|985|989)";
export const ANNEX2_CPV_EXACT = ["79611000", "79622000", "79624000", "79625000", "64000000", "50116510", "71550000", "79430000", "79995000", "79995100", "79995200", "98113100"];

export function annex2Sql(sql: DbSql, cpv: Fragment): Fragment {
  return sql`(btrim(${cpv}) ~ ${ANNEX2_CPV_PATTERN} or left(btrim(${cpv}), 8) = any(${ANNEX2_CPV_EXACT}::text[]))`;
}

/**
 * The kind of a buying institution for the December comparison: town halls
 * from the locality registry (reference.uat.tip: 3 = comună; 1, 2, 4, 9 =
 * oraș, municipiu, București), everything else by the name rules of Ask's
 * authority kinds (apps/web/lib/ask/authority-kind.ts), in SQL. Only the
 * December threshold uses it: each kind and year has its own 95th percentile.
 */
export function authorityKindSql(sql: DbSql): Fragment {
  return sql`
    select e.id eid,
      case
        when u.tip = '3' then 'comuna'
        when u.tip in ('1', '2', '4', '9') then 'oras_municipiu'
        when nm ~ '^(judetul |consiliul judetean|u\\.?a\\.?t\\.? judetul)' then 'consiliu_judetean'
        when nm ~ '^spital' or (nm ~ '^institutul ' and nm ~ '(clinic|oncologi|inimii|de boli|de urgenta|sanatatea mamei|hematologi|gastroenterologi|urologi|pneumoftiziologi|psihiatri|endocrinologi|diabet|neurologi|recuperare|gerontologi)' and nm !~ '(medicina legala|cercetare)') then 'spital'
        when nm ~ '(scoala|^liceul|^colegiul|^gradinita)' then 'scoala'
        when nm ~ '^(comuna |primaria comun)' then 'comuna'
        when nm ~ '^(oras|ors|munici|primaria )' then 'oras_municipiu'
        else 'alta' end kind
    from core.entities e
    cross join lateral (select lower(unaccent(coalesce(e.name_display, ''))) nm) n
    left join reference.authority_uat au on au.entity_id = e.id
    left join reference.uat u on u.siruta = au.uat_siruta`;
}

/**
 * Every institution-year the December comparison can judge: full calendar
 * years of the DA archive (audit F20) with at least `minTotal` lei of accepted
 * DAs, the December share, and the kind-year 95th percentile and median. A
 * year is flagged at max(95th percentile, `shareFloor`). The flag rule
 * (build.ts) and the strength (below) read this one statement.
 */
export function authorityDecemberSql(sql: DbSql, opts: { maxPlausible: number; minTotal: number; shareFloor: number }): Fragment {
  return sql`
    with span as (
      select min(finalization_date)::date date_from, max(finalization_date)::date date_to
      from core.direct_acquisitions
    ),
    m as (
      select authority_entity_id a, extract(year from finalization_date)::int y, sum(closing_value) tot,
        sum(case when extract(month from finalization_date) = 12 then closing_value else 0 end) dec
      from core.direct_acquisitions
      where state = 'Oferta acceptata' and authority_entity_id is not null and closing_value > 0
        and closing_value <= ${opts.maxPlausible} and finalization_date is not null
      group by 1, 2
    ),
    kinds as (${authorityKindSql(sql)}),
    ev as (
      select m.a, m.y, m.tot, m.dec, m.dec / m.tot share, coalesce(k.kind, 'alta') kind
      from m cross join span left join kinds k on k.eid = m.a
      where m.tot >= ${opts.minTotal} and span.date_from <= make_date(m.y, 1, 1) and span.date_to >= make_date(m.y, 12, 31)
    ),
    peers as (
      select kind, y, percentile_cont(0.95) within group (order by share) p95, percentile_cont(0.5) within group (order by share) med
      from ev group by 1, 2
    )
    select ev.a, ev.y, ev.tot, ev.dec, ev.share, ev.kind, p.p95, p.med,
      greatest(p.p95, ${opts.shareFloor}::float8) threshold, ev.share >= greatest(p.p95, ${opts.shareFloor}::float8) flagged
    from ev join peers p using (kind, y)`;
}

/** The measures of one profile, from the SQL below. */
export interface ProfileMeasures {
  eid: string; role: ProfileFlagRole; n: number; v: number;
  /** Institutions: classic, association or private_buyer (regime.ts). */
  regime: string | null;
  /** Firms: a utility or mass supplier; a firm of its institution (in-house). */
  utility: boolean; inhouse: boolean;
  above: { n: number; events: number; value: number; top2: number; partners: number } | null;
  /** Repeated-purchase groups of the profile. */
  groups: { partner: string; total: number; n: number; ceiling: number; annex2Share: number; association: boolean; massSupplier: boolean }[];
  round: { o: number; e: number } | null;
  december: { years: number; top2: number; flagged: { y: number; pct: number }[] } | null;
  concentration: { share: number; rawShare: number; partner: string } | null;
  dependence: { share: number; partnerShare: number; partner: string } | null;
  capacity: { year: number; ratio: number | null; turnover: number | null; turnoverYear: number | null; value: number;
    employees: number | null; implausible: boolean; young: boolean; zeroStaff: boolean }[];
}

export interface ProfileScore {
  eid: string; role: ProfileFlagRole; score: number; scoreRaw: number;
  /** Criteria that add at least a point, in the role's order. */
  codes: ProfileFlagCode[];
  parts: Record<string, Record<string, unknown>>;
  /** association, private_buyer, inhouse or null (marts.entity_flags.score_note). */
  note: string | null;
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** Strengths, score, points and the facts behind each criterion, for one profile's measures. */
export function scoreProfile(m: ProfileMeasures): ProfileScore {
  const gate = scoreCap(m.n, m.v);
  const share = (x: number) => (m.v > 0 ? x / m.v : 0);
  const note = m.role === "supplier" ? (m.inhouse ? "inhouse" : null)
    : m.regime === "association" || m.regime === "private_buyer" ? m.regime : null;
  const x: Partial<Record<ProfileFlagCode, number>> = {};
  const facts: Partial<Record<ProfileFlagCode, Record<string, unknown>>> = {};

  if (m.above) {
    const w = share(m.above.value);
    x.da_above_ceiling = strengthAbove(m.role, m.above.events, w, gate, { top2: m.above.top2, utility: m.utility });
    facts.da_above_ceiling = { n: m.above.n, events: m.above.events, value: m.above.value, share: r4(w), partners: m.above.partners, top2: r4(m.above.top2) };
  }

  const weighted = m.groups.map((g) => ({ ...g, w: splitGroupWeight({ role: m.role, ...g }) })).filter((g) => g.w > 0);
  if (weighted.length) {
    const byPartner = new Map<string, number>();
    for (const g of weighted) byPartner.set(g.partner, (byPartner.get(g.partner) ?? 0) + g.total * g.w);
    const vals = [...byPartner.values()].sort((a, b) => b - a);
    const sum = vals.reduce((a, b) => a + b, 0);
    const top2 = sum > 0 ? (vals[0]! + (vals[1] ?? 0)) / sum : 1;
    const s = share(sum);
    x.da_split = strengthSplit(m.role, s, gate, { top2, utility: m.utility });
    facts.da_split = { groups: weighted.length, partners: byPartner.size, share: r4(s), rawShare: r4(share(weighted.reduce((a, g) => a + g.total, 0))), top2: r4(top2) };
  }

  if (m.round) {
    x.da_round = strengthRound(m.round.o, m.round.e, gate);
    facts.da_round = { n: m.round.o, expected: Math.round(m.round.e * 10) / 10 };
  }

  if (m.role === "authority" && m.december) {
    const zs = m.december.years >= 2 ? (m.december.top2 * m.december.years) / (m.december.years + 2) : 0;
    x.da_year_end = strengthYearEnd(zs);
    facts.da_year_end = { years: m.december.flagged, zs: r4(zs) };
  }
  if (m.role === "authority" && m.concentration) {
    x.da_concentration = strengthConcentration(m.concentration.share, gate);
    facts.da_concentration = { share: r4(m.concentration.share), rawShare: r4(m.concentration.rawShare), partnerId: m.concentration.partner };
  }

  if (m.role === "supplier") {
    let best: (typeof m.capacity)[number] | null = null;
    let xCap = 0;
    for (const c of m.capacity) {
      const xc = strengthCapacity(c);
      if (xc > xCap) { xCap = xc; best = c; }
    }
    if (best) {
      x.da_capacity = xCap;
      facts.da_capacity = { year: best.year, ratio: best.ratio == null ? null : Math.round(best.ratio * 10) / 10, turnover: best.turnover,
        turnoverYear: best.turnoverYear, value: best.value, employees: best.employees, implausible: best.implausible, young: best.young, zeroStaff: best.zeroStaff };
    }
    if (m.dependence) {
      x.da_dependence = strengthDependence(m.dependence.share, m.dependence.partnerShare, xCap, gate);
      facts.da_dependence = { share: r4(m.dependence.share), partnerShare: r4(m.dependence.partnerShare), partnerId: m.dependence.partner,
        capture: m.dependence.share >= 0.85 && xCap >= 1 };
    }
  }

  const empty: ProfileScore = { eid: m.eid, role: m.role, score: 0, scoreRaw: 0, codes: [], parts: {}, note };
  if (m.role === "supplier" && m.inhouse) return empty;
  const scoreRaw = scoreOfCriteria(m.role, x);
  const pts = scorePoints(m.role, x);
  const codes = (PROFILE_FLAG_CODES[m.role] as readonly ProfileFlagCode[]).filter((c) => (x[c] ?? 0) > 0 && (pts[c] ?? 0) >= 1);
  if (!codes.length) return empty;
  const parts = Object.fromEntries(codes.map((c) => [c, { x: r4(x[c]!), pts: pts[c]!, ...facts[c] }]));
  return { eid: m.eid, role: m.role, score: Math.round(scoreRaw), scoreRaw, codes, parts, note };
}

type Row = Record<string, unknown>;
const num = (v: unknown): number => Number(v ?? 0);
const key = (role: unknown, eid: unknown) => `${String(role)}:${String(eid)}`;

/**
 * Measure, score and write every profile of marts.entity_flags (inside the
 * flag marts transaction, after its rows are inserted). The population is the
 * profile's: accepted DAs, 0 < value ≤ `maxPlausible`, a supplier equal to the
 * institution is not a supplier.
 */
type ScoreOptions = { maxPlausible: number; yearEndMinTotal: number; yearEndShare: number };

/** The measures of every profile of marts.entity_flags (reads only; a temp table of buyer regimes). */
export async function measureProfiles(q: DbSql, opts: ScoreOptions): Promise<ProfileMeasures[]> {
  const b = opts.maxPlausible;
  const accepted = q`d.state = 'Oferta acceptata' and d.closing_value > 0 and d.closing_value <= ${b}
    and d.authority_entity_id is not null and d.supplier_entity_id is not null and d.supplier_entity_id <> d.authority_entity_id`;
  await q`drop table if exists pg_temp.score_regime`;
  await q`create temp table score_regime on commit drop as ${buyerRegimeSql(q)}`;
  await q`create index on score_regime (eid)`;

  const profiles = (await q`
    select ef.entity_id::text eid, ef.role, ef.n_das n, coalesce(ef.total_ron, 0)::float8 v,
      case when ef.role = 'authority' then coalesce(r.regime, 'classic') end regime,
      ef.role = 'supplier' and n.nm ~ ${UTILITY_SUPPLIER_NAME} utility,
      ef.role = 'supplier' and n.nm ~ ${INHOUSE_SUPPLIER_NAME} inhouse
    from marts.entity_flags ef
    join core.entities e on e.id = ef.entity_id
    cross join lateral (select ${entityNameSql(q, "e")} nm) n
    left join score_regime r on ef.role = 'authority' and r.eid = ef.entity_id
  `) as unknown as Row[];

  // Above the ceiling: records, events (partner × month), value, the share of the top two partners.
  const above = (await q`
    with h as (
      select d.authority_entity_id a, d.supplier_entity_id s, d.closing_value::float8 v, to_char(d.finalization_date, 'YYYY-MM') m
      from core.flags f join core.direct_acquisitions d on d.id = f.subject_id
      where f.subject_type = 'da' and f.flag_code = 'da_above_ceiling' and ${accepted}
    ),
    r as (select 'authority' role, a eid, s partner, m, v from h union all select 'supplier', s, a, m, v from h),
    pp as (select role, eid, partner, sum(v) pv, row_number() over (partition by role, eid order by sum(v) desc, partner) rk from r group by 1, 2, 3),
    t as (select role, eid, sum(pv) filter (where rk <= 2) / nullif(sum(pv), 0) top2, count(*) partners from pp group by 1, 2)
    select r.role, r.eid::text eid, count(*)::int n, count(distinct (r.partner, r.m))::int events, sum(r.v) value, t.top2, t.partners
    from r join t using (role, eid) group by r.role, r.eid, t.top2, t.partners
  `) as unknown as Row[];

  // Repeated-purchase groups with what their weight needs.
  const groups = (await q`
    with g as (
      select f.id, f.subject_id a, f.partner_id s, (f.evidence->>'count')::int n, (f.evidence->>'total')::float8 total,
        (f.evidence->>'ceiling')::float8 ceil, f.evidence->'source_ids' ids
      from core.flags f where f.flag_code = 'da_split' and f.subject_type = 'pair'
    ),
    a2 as (
      select g.id, avg(case when ${annex2Sql(q, q`d.cpv_code`)} then 1.0 else 0.0 end)::float8 a2
      from g cross join lateral jsonb_array_elements_text(g.ids) sid(id)
      join core.direct_acquisitions d on d.sicap_da_id = sid.id::bigint
      group by g.id
    ),
    pairs as (
      select d.authority_entity_id a, d.supplier_entity_id s, sum(d.closing_value)::float8 st
      from core.direct_acquisitions d where ${accepted} group by 1, 2
    ),
    sup as (select s, count(*) nb, sum(st) tot from pairs group by 1)
    select g.a::text a, g.s::text s, g.n, g.total, g.ceil, coalesce(a2.a2, 0) a2,
      coalesce(r.regime = 'association', false) assoc,
      coalesce(sup.nb >= 200 and p.st / nullif(sup.tot, 0) < 0.01, false) mass
    from g left join a2 using (id)
    left join pairs p on p.a = g.a and p.s = g.s
    left join sup on sup.s = g.s
    left join score_regime r on r.eid = g.a
  `) as unknown as Row[];

  // Just under the ceiling: o DAs at 96–100%, e expected from the DAs at 50–96% and the national ratio of type × era.
  const daKey = daThresholdKeySql(q, q`d.cpv_code`, q`d.acquisition_type`);
  const daDate = daThresholdDateSql(q, q`d.publication_date`, q`d.finalization_date`);
  const round = (await q`
    with x as (
      select d.authority_entity_id a, d.supplier_entity_id s, d.closing_value::float8 / th.value_num::float8 r, th.key typ, th.valid_from era
      from core.direct_acquisitions d
      join core.risk_thresholds th on th.key = ${daKey}
        and (th.valid_from at time zone 'UTC')::date <= ${daDate}
        and (th.valid_to is null or (th.valid_to at time zone 'UTC')::date > ${daDate})
      where ${accepted} and d.finalization_date is not null
    ),
    y as (select * from x where r >= 0.5 and r < 1),
    nat as (
      select typ, era, (count(*) filter (where r >= 0.96))::float8 / nullif(count(*) filter (where r < 0.96), 0) ratio
      from y group by 1, 2
    ),
    z as (select y.*, coalesce(nat.ratio, 0) ratio from y join nat using (typ, era))
    select 'authority' role, a::text eid, count(*) filter (where r >= 0.96)::int o, coalesce(sum(ratio) filter (where r < 0.96), 0)::float8 e from z group by a
    union all
    select 'supplier', s::text, count(*) filter (where r >= 0.96)::int, coalesce(sum(ratio) filter (where r < 0.96), 0)::float8 from z group by s
  `) as unknown as Row[];

  // December: each full year's distance from the kind-year median in units of (95th percentile − median).
  const december = (await q`
    with dec as (${authorityDecemberSql(q, { maxPlausible: b, minTotal: opts.yearEndMinTotal, shareFloor: opts.yearEndShare })}),
    z as (
      select a, y, share, flagged, coalesce((share - med) / nullif(p95 - med, 0), 0) z,
        row_number() over (partition by a order by coalesce((share - med) / nullif(p95 - med, 0), 0) desc, y) rk
      from dec
    )
    select a::text eid, count(*)::int years, coalesce(avg(z) filter (where rk <= 2), 0)::float8 top2,
      coalesce(jsonb_agg(jsonb_build_object('y', y, 'pct', round(share::numeric, 4)) order by y) filter (where flagged), '[]'::jsonb) flagged
    from z group by a
  `) as unknown as Row[];

  const relation = (await q`
    select flag_code, subject_id::text eid, partner_id::text partner, evidence
    from core.flags where flag_code in ('da_concentration', 'da_dependence', 'da_capacity')
  `) as unknown as Row[];

  const prof = new Map<string, ProfileMeasures>();
  for (const p of profiles) {
    prof.set(key(p["role"], p["eid"]), {
      eid: String(p["eid"]), role: p["role"] as ProfileFlagRole, n: num(p["n"]), v: num(p["v"]),
      regime: (p["regime"] as string | null) ?? null, utility: Boolean(p["utility"]), inhouse: Boolean(p["inhouse"]),
      above: null, groups: [], round: null, december: null, concentration: null, dependence: null, capacity: [],
    });
  }
  for (const r of above) {
    const m = prof.get(key(r["role"], r["eid"]));
    if (m) m.above = { n: num(r["n"]), events: num(r["events"]), value: num(r["value"]), top2: num(r["top2"]), partners: num(r["partners"]) };
  }
  for (const g of groups) {
    const base = { total: num(g["total"]), n: num(g["n"]), ceiling: num(g["ceil"]), annex2Share: num(g["a2"]),
      association: Boolean(g["assoc"]), massSupplier: Boolean(g["mass"]) };
    prof.get(key("authority", g["a"]))?.groups.push({ ...base, partner: String(g["s"]) });
    prof.get(key("supplier", g["s"]))?.groups.push({ ...base, partner: String(g["a"]) });
  }
  for (const r of round) {
    const m = prof.get(key(r["role"], r["eid"]));
    if (m) m.round = { o: num(r["o"]), e: num(r["e"]) };
  }
  for (const r of december) {
    const m = prof.get(key("authority", r["eid"]));
    if (m) m.december = { years: num(r["years"]), top2: num(r["top2"]), flagged: (r["flagged"] as { y: number; pct: number }[]) ?? [] };
  }
  for (const r of relation) {
    const e = (r["evidence"] ?? {}) as Record<string, unknown>;
    if (r["flag_code"] === "da_concentration") {
      const m = prof.get(key("authority", r["eid"]));
      if (m) m.concentration = { share: num(e["adjusted_pct"]), rawShare: num(e["top_supplier_pct"]), partner: String(r["partner"]) };
    } else if (r["flag_code"] === "da_dependence") {
      const m = prof.get(key("supplier", r["eid"]));
      if (m) m.dependence = { share: num(e["top_authority_pct"]), partnerShare: num(e["authority_share"]), partner: String(r["partner"]) };
    } else {
      const m = prof.get(key("supplier", r["eid"]));
      if (m) m.capacity.push({
        year: num(e["year"]), ratio: e["ratio"] == null ? null : num(e["ratio"]), turnover: e["turnover"] == null ? null : num(e["turnover"]),
        turnoverYear: e["turnover_year"] == null ? null : num(e["turnover_year"]), value: num(e["da_value"]),
        employees: e["employees"] == null ? null : num(e["employees"]),
        implausible: e["implausible"] === true, young: e["young"] === true, zeroStaff: e["zero_staff"] === true,
      });
    }
  }

  return [...prof.values()];
}

export async function applyProfileScores(q: DbSql, opts: ScoreOptions): Promise<{ profiles: number; scored: number }> {
  const scores = (await measureProfiles(q, opts)).map(scoreProfile);
  // One statement per 20k profiles keeps the parameter arrays small.
  for (let i = 0; i < scores.length; i += 20_000) {
    const chunk = scores.slice(i, i + 20_000);
    await q`
      update marts.entity_flags ef set
        score = u.score, score_raw = u.raw, score_parts = u.parts::jsonb, score_note = u.note,
        cri = round(u.score / 100.0, 4), n_flags = jsonb_array_length(u.codes::jsonb), flags = u.codes::jsonb
      from unnest(${chunk.map((s) => s.eid)}::bigint[], ${chunk.map((s) => s.role)}::text[], ${chunk.map((s) => s.score)}::int[],
        ${chunk.map((s) => s.scoreRaw)}::float8[], ${chunk.map((s) => JSON.stringify(s.parts))}::text[], ${chunk.map((s) => JSON.stringify(s.codes))}::text[],
        ${chunk.map((s) => s.note)}::text[])
        u(eid, role, score, raw, parts, codes, note)
      where ef.entity_id = u.eid and ef.role = u.role
    `;
  }
  return { profiles: scores.length, scored: scores.filter((s) => s.score > 0).length };
}
