import {
  PROFILE_FLAG_CODES, SCORE_GATE, scoreOf, strengthAbove, strengthConcentration, strengthDependence, strengthRound,
  strengthSplit, strengthYearEnd, type DbSql, type ProfileFlagCode, type ProfileFlagRole,
} from "@seap/db";

/*
 * The risk score of each profile (rf-2026.18, owner decision of 1 November
 * 2026). The flag rules (build.ts) decide which signals a profile has; this
 * step measures how pronounced each one is (strength x, 0–3, the shared
 * functions in @seap/db) and combines them into the score over 100 that the
 * site shows as a percentage. The design and its validation on the local
 * copy: the signals investigation of 1 November 2026 (E, "continuous score").
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

interface MetricRow {
  eid: string; role: ProfileFlagRole; n: number; v: number;
  split_groups: number; v_split: number; v_a2: number;
  n_round: number; n_above: number; v_above: number;
  ye_k: number; ye_r: number; ye_years: { y: number; pct: number }[] | null;
  conc_met: boolean; conc_t: number | null; conc_partner: string | null;
  dep_met: boolean; dep_share: number | null; dep_rev: number | null; dep_partner: string | null;
}

export interface ProfileScore {
  eid: string; role: ProfileFlagRole; score: number; scoreRaw: number;
  /** Criteria met (x ≥ 1), in the role's order. */
  codes: ProfileFlagCode[];
  parts: Record<string, Record<string, unknown>>;
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** Strengths, score and the facts behind each criterion, for one profile's measures. */
export function scoreProfile(m: MetricRow): ProfileScore {
  const gate = m.n >= SCORE_GATE.minDas && m.v >= SCORE_GATE.minValue;
  const share = (x: number) => (m.v > 0 ? x / m.v : 0);
  const x: Partial<Record<ProfileFlagCode, number>> = {
    da_split: strengthSplit(m.role, m.split_groups, gate, share(m.v_split - m.v_a2)),
    da_round: strengthRound(m.role, m.n, gate, m.n_round),
    da_above_ceiling: strengthAbove(m.n_above, gate, share(m.v_above)),
    ...(m.role === 'authority'
      ? { da_year_end: strengthYearEnd(m.ye_k, gate, m.ye_r), da_concentration: strengthConcentration(m.conc_met, gate, m.conc_t ?? 0) }
      : { da_dependence: strengthDependence(m.dep_met, gate, m.dep_rev ?? 0) }),
  };
  const facts: Record<ProfileFlagCode, Record<string, unknown>> = {
    da_split: { groups: m.split_groups, share: round4(share(m.v_split - m.v_a2)), annex2Share: round4(share(m.v_a2)) },
    da_round: { n: m.n_round, share: m.n > 0 ? round4(m.n_round / m.n) : 0 },
    da_above_ceiling: { n: m.n_above, value: m.v_above, share: round4(share(m.v_above)) },
    da_year_end: { years: m.ye_years ?? [] },
    da_concentration: { share: round4(m.conc_t ?? 0), partnerId: m.conc_partner },
    da_dependence: { share: round4(m.dep_share ?? 0), partnerShare: round4(m.dep_rev ?? 0), partnerId: m.dep_partner },
  };
  const codes = (PROFILE_FLAG_CODES[m.role] as readonly ProfileFlagCode[]).filter((c) => (x[c] ?? 0) >= 1);
  const parts = Object.fromEntries(codes.map((c) => [c, { x: round4(x[c]!), ...facts[c] }]));
  const scoreRaw = scoreOf(codes.map((c) => x[c]!));
  return { eid: m.eid, role: m.role, score: Math.round(scoreRaw), scoreRaw, codes, parts };
}

/**
 * Measure, score and write every profile of marts.entity_flags (inside the
 * flag marts transaction, after its rows are inserted). The population is the
 * profile's: accepted DAs, 0 < value ≤ `maxPlausible`, a supplier equal to the
 * institution is not a supplier.
 */
export async function applyProfileScores(q: DbSql, opts: { maxPlausible: number; yearEndMinTotal: number; yearEndShare: number }): Promise<{ profiles: number; scored: number }> {
  const b = opts.maxPlausible;
  const rows = (await q`
    with prof as (select entity_id eid, role, n_das n, coalesce(total_ron, 0)::float8 v from marts.entity_flags),
    split_da as (
      select f.subject_id a, f.partner_id s, d.closing_value::float8 v, ${annex2Sql(q, q`d.cpv_code`)} a2
      from core.flags f
      cross join lateral jsonb_array_elements_text(f.evidence->'source_ids') sid(id)
      join core.direct_acquisitions d on d.sicap_da_id = sid.id::bigint
      where f.flag_code = 'da_split' and f.subject_type = 'pair'
    ),
    split as (
      select 'authority' role, a eid, sum(v) v_split, coalesce(sum(v) filter (where a2), 0) v_a2 from split_da group by 2
      union all select 'supplier', s, sum(v), coalesce(sum(v) filter (where a2), 0) from split_da group by 2
    ),
    groups as (
      select 'authority' role, subject_id eid, count(*) n from core.flags where flag_code = 'da_split' and subject_type = 'pair' group by 2
      union all select 'supplier', partner_id, count(*) from core.flags where flag_code = 'da_split' and subject_type = 'pair' group by 2
    ),
    daf as (
      select role, eid, flag_code, count(*) n, sum(v) v from (
        select 'authority' role, d.authority_entity_id eid, f.flag_code, d.closing_value::float8 v
        from core.flags f join core.direct_acquisitions d on d.id = f.subject_id
        where f.subject_type = 'da' and f.flag_code in ('da_round', 'da_above_ceiling')
          and d.state = 'Oferta acceptata' and d.closing_value > 0 and d.closing_value <= ${b}
        union all
        select 'supplier', nullif(d.supplier_entity_id, d.authority_entity_id), f.flag_code, d.closing_value::float8
        from core.flags f join core.direct_acquisitions d on d.id = f.subject_id
        where f.subject_type = 'da' and f.flag_code in ('da_round', 'da_above_ceiling')
          and d.state = 'Oferta acceptata' and d.closing_value > 0 and d.closing_value <= ${b}
      ) z where eid is not null group by 1, 2, 3
    ),
    dec as (${authorityDecemberSql(q, { maxPlausible: b, minTotal: opts.yearEndMinTotal, shareFloor: opts.yearEndShare })}),
    ye as (
      select a eid, count(*) filter (where flagged) k,
        coalesce(max(greatest(0, least(0.999, (share - med) / nullif(threshold - med, 0)))) filter (where not flagged), 0) r,
        jsonb_agg(jsonb_build_object('y', y, 'pct', round(share::numeric, 4)) order by y) filter (where flagged) years
      from dec group by 1
    ),
    pairs as (
      select authority_entity_id a, supplier_entity_id s, sum(closing_value)::float8 st, count(*) n
      from core.direct_acquisitions
      where state = 'Oferta acceptata' and authority_entity_id is not null and supplier_entity_id is not null
        and supplier_entity_id <> authority_entity_id and closing_value > 0 and closing_value <= ${b}
      group by 1, 2
    ),
    auth_tot as (select a, sum(st) tot from pairs group by 1),
    auth_top as (select distinct on (a) a, s, st from pairs order by a, st desc, s),
    sup_tot as (select s, sum(st) tot from pairs group by 1),
    sup_top as (select distinct on (s) s, a, st from pairs order by s, st desc, a),
    conc as (
      select t.a eid, t.st / at.tot t, t.s partner, exists (select 1 from core.flags f where f.flag_code = 'da_concentration' and f.subject_id = t.a) met
      from auth_top t join auth_tot at using (a)
    ),
    dep as (
      select t.s eid, t.st / st.tot share, t.st / at.tot rev, t.a partner, exists (select 1 from core.flags f where f.flag_code = 'da_dependence' and f.subject_id = t.s) met
      from sup_top t join sup_tot st using (s) join auth_tot at on at.a = t.a
    )
    select p.eid::text eid, p.role, p.n, p.v,
      coalesce(g.n, 0)::int split_groups, coalesce(sp.v_split, 0) v_split, coalesce(sp.v_a2, 0) v_a2,
      coalesce(r.n, 0)::int n_round, coalesce(ab.n, 0)::int n_above, coalesce(ab.v, 0) v_above,
      coalesce(ye.k, 0)::int ye_k, coalesce(ye.r, 0)::float8 ye_r, ye.years ye_years,
      coalesce(c.met, false) conc_met, c.t conc_t, c.partner::text conc_partner,
      coalesce(d.met, false) dep_met, d.share dep_share, d.rev dep_rev, d.partner::text dep_partner
    from prof p
    left join groups g on g.role = p.role and g.eid = p.eid
    left join split sp on sp.role = p.role and sp.eid = p.eid
    left join daf r on r.role = p.role and r.eid = p.eid and r.flag_code = 'da_round'
    left join daf ab on ab.role = p.role and ab.eid = p.eid and ab.flag_code = 'da_above_ceiling'
    left join ye on p.role = 'authority' and ye.eid = p.eid
    left join conc c on p.role = 'authority' and c.eid = p.eid
    left join dep d on p.role = 'supplier' and d.eid = p.eid
  `) as unknown as MetricRow[];

  const scores = rows.map((r) => scoreProfile({ ...r, n: Number(r.n), v: Number(r.v), v_split: Number(r.v_split), v_a2: Number(r.v_a2), v_above: Number(r.v_above) }));
  // One statement per 20k profiles keeps the parameter arrays small.
  for (let i = 0; i < scores.length; i += 20_000) {
    const chunk = scores.slice(i, i + 20_000);
    await q`
      update marts.entity_flags ef set
        score = u.score, score_raw = u.raw, score_parts = u.parts::jsonb,
        cri = round(u.score / 100.0, 4), n_flags = jsonb_array_length(u.codes::jsonb), flags = u.codes::jsonb
      from unnest(${chunk.map((s) => s.eid)}::bigint[], ${chunk.map((s) => s.role)}::text[], ${chunk.map((s) => s.score)}::int[],
        ${chunk.map((s) => s.scoreRaw)}::float8[], ${chunk.map((s) => JSON.stringify(s.parts))}::text[], ${chunk.map((s) => JSON.stringify(s.codes))}::text[])
        u(eid, role, score, raw, parts, codes)
      where ef.entity_id = u.eid and ef.role = u.role
    `;
  }
  return { profiles: scores.length, scored: scores.filter((s) => s.score > 0).length };
}
