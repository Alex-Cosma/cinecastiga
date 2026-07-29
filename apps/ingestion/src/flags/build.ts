import type { DbSql } from "@seap/db";
import { METHODOLOGY_VERSION } from "./methodology.js";

/**
 * DA red-flag build (red-flags DEC-005). Truncate + recompute `core.flags` from
 * `core.direct_acquisitions`. Each rule is one SQL statement writing binary
 * flag instances with evidence. Legal ceilings come from `core.risk_thresholds`
 * (date-aware, DEC-006) joined PER ROW on the finalization date — art. 7(5)
 * changed twice (2016: 132.519 → iun. 2018: 135.060 → ian. 2023: 270.120 for
 * goods/services), so each DA is judged against the prag in force when it
 * closed. Statistical cutoffs are read from the same table with documented
 * fallbacks. DA acquisition type is inferred from CPV (division 45 = works)
 * since the imported DA rows carry no explicit type.
 */
const V = METHODOLOGY_VERSION;

const DEFAULTS: Record<string, number> = {
  // A DA is legally capped near the works ceiling (441.730); closing values far
  // above are corrupt source data (~275 rows carry billions). Exclude them from
  // every rule so one garbage row can't dominate a concentration total.
  da_max_plausible: 2_000_000,
  da_rapid_hours: 1,
  da_conc_top_pct: 0.6,
  da_conc_min_suppliers: 3,
  da_conc_min_total: 100_000,
  da_dep_top_pct: 0.85,
  da_dep_min_total: 50_000,
  da_split_min_count: 3,
  da_round_floor_pct: 0.9,
  da_year_end_share: 0.35,
  da_year_end_min_total: 100_000,
  // ── award (contract-award) thresholds ──────────────────────────────────────
  // Framework agreements carry legitimately large ceiling values, so the cap is
  // generous (1e9) — it only excludes clearly-corrupt outliers (a single 13.8B row).
  award_max_plausible: 1_000_000_000,
  award_sev_ref: 10_000_000, // value that maps to severity 1.0
  award_min_value: 100_000, // no-competition floor
  award_single_bid_min: 1_000_000, // single-bid only matters at real value
  award_conc_top_pct: 0.6,
  award_conc_min_suppliers: 3,
  award_conc_min_total: 100_000,
  award_dep_top_pct: 0.85,
  award_dep_min_auth: 2, // captive-but-active guard (short data window)
  award_dep_min_total: 500_000,
  // ── financials-based thresholds (reference.company_financials, MF bilanț) ──
  // Tiny staff, big public money: ≤5 employees winning ≥2M in a single year is
  // a shell/intermediary signal; severity saturates at 20M/year.
  fin_tiny_max_employees: 5,
  fin_tiny_min_value: 2_000_000,
  fin_tiny_sev_ref: 20_000_000,
  // Public-money reliance: over the matched years, public contracted value vs
  // the firm's entire net turnover. Ratio can legitimately exceed 1 (framework
  // ceilings, multi-year contracts) — that's why we sum across years first.
  fin_reliance_min_ratio: 0.75,
  fin_reliance_min_public: 1_000_000,
  fin_reliance_min_turnover: 250_000,
  // ── shared-administrator network (ONRC reps) ───────────────────────────────
  // Same person (name+birth identity) administering ≥2 supplier firms that all
  // take money from the SAME authority: concentration hidden behind sibling
  // companies (the "MARISAR constellation" pattern). Severity saturates at 5M.
  net_admin_min_firms: 2,
  net_admin_min_total: 250_000,
  net_admin_sev_ref: 5_000_000,
};

export interface FlagsReport {
  [code: string]: number;
}

async function num(sql: DbSql, key: string, fallback: number): Promise<number> {
  const rows = (await sql`
    select value_num from core.risk_thresholds where key = ${key}
    order by valid_from desc limit 1
  `) as unknown as { value_num: string }[];
  return rows[0] ? Number(rows[0].value_num) : fallback;
}

/** The ceiling eras must be seeded (join-based rules silently drop rows otherwise). */
async function assertCeilingEras(sql: DbSql): Promise<number> {
  const rows = (await sql`
    select count(*)::int c from core.risk_thresholds
    where key in ('da_ceiling_goods_services', 'da_ceiling_works')
  `) as unknown as { c: number }[];
  const c = Number(rows[0]?.c ?? 0);
  if (c < 2) {
    throw new Error(
      "core.risk_thresholds has no DA ceiling eras — run `pnpm --filter ingestion seed-thresholds` first",
    );
  }
  return c;
}

export async function runFlags(
  sql: DbSql,
  opts: { log?: (m: string) => void } = {},
): Promise<FlagsReport> {
  const log = opts.log ?? (() => {});
  const t = async (k: string) => num(sql, k, DEFAULTS[k]!);

  const ceilingEras = await assertCeilingEras(sql);
  const maxPlausible = await t("da_max_plausible");
  const rapidHours = await t("da_rapid_hours");
  const concTopPct = await t("da_conc_top_pct");
  const concMinSup = await t("da_conc_min_suppliers");
  const concMinTot = await t("da_conc_min_total");
  const depTopPct = await t("da_dep_top_pct");
  const depMinTot = await t("da_dep_min_total");
  const splitMinN = await t("da_split_min_count");
  const roundFloor = await t("da_round_floor_pct");
  const yeShare = await t("da_year_end_share");
  const yeMinTot = await t("da_year_end_min_total");
  log(
    `thresholds: ceilings=date-aware (${ceilingEras} era rows) rapidH=${rapidHours} concTop=${concTopPct} ` +
      `depTop=${depTopPct} splitN=${splitMinN} roundFloor=${roundFloor} yeShare=${yeShare}`,
  );

  await sql`truncate core.flags`;

  // ── da_rapid (per DA) ────────────────────────────────────────────────────
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    select 'da', id, 'da_rapid', to_char(finalization_date,'YYYY'), true,
      greatest(0, least(1, 1 - (extract(epoch from (finalization_date - publication_date))/3600) / ${rapidHours}::float8)),
      jsonb_build_object(
        'minutes', round(extract(epoch from (finalization_date - publication_date))/60)::int,
        'closing', closing_value),
      ${V}
    from core.direct_acquisitions
    where state = 'Oferta acceptata'
      and publication_date is not null and finalization_date is not null
      and finalization_date >= publication_date
      and (closing_value is null or closing_value <= ${maxPlausible})
      and extract(epoch from (finalization_date - publication_date)) < ${rapidHours}::float8 * 3600
  `;

  // da_estimate_match was DROPPED after calibration: closing == estimate holds
  // for ~96% of DAs (the catalog-price process norm), so it carries no signal.

  // ── da_round: closing just under the applicable ceiling (per DA) ─────────
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    select 'da', id, 'da_round', to_char(finalization_date,'YYYY'), true,
      least(1, closing_value / ceil),
      jsonb_build_object('closing', closing_value, 'ceiling', ceil, 'type', typ), ${V}
    from (
      select da.id, da.finalization_date, da.closing_value,
        th.value_num::numeric as ceil,
        case when left(da.cpv_code,2) = '45' then 'lucrari' else 'produse/servicii' end as typ
      from core.direct_acquisitions da
      join core.risk_thresholds th
        on th.key = case when left(da.cpv_code,2) = '45'
                         then 'da_ceiling_works' else 'da_ceiling_goods_services' end
       and th.valid_from <= da.finalization_date
       and (th.valid_to is null or th.valid_to > da.finalization_date)
      where da.state = 'Oferta acceptata'
        and da.closing_value is not null and da.closing_value > 0
        and da.closing_value <= ${maxPlausible}
        and da.finalization_date is not null
    ) d
    where closing_value >= ${roundFloor}::float8 * ceil and closing_value < ceil
  `;

  // ── da_split: sub-ceiling DAs from a pair summing past ceiling (per pair) ─
  await sql`
    insert into core.flags (subject_type, subject_id, partner_id, flag_code, period, triggered, severity, evidence, methodology_version)
    with da as (
      select d.authority_entity_id a, d.supplier_entity_id s,
        extract(year from d.finalization_date)::int y, d.closing_value cv,
        th.value_num::numeric ceil
      from core.direct_acquisitions d
      join core.risk_thresholds th
        on th.key = case when left(d.cpv_code,2) = '45'
                         then 'da_ceiling_works' else 'da_ceiling_goods_services' end
       and th.valid_from <= d.finalization_date
       and (th.valid_to is null or th.valid_to > d.finalization_date)
      where d.state = 'Oferta acceptata'
        and d.authority_entity_id is not null and d.supplier_entity_id is not null
        and d.closing_value is not null and d.closing_value > 0 and d.closing_value <= ${maxPlausible}
        and d.finalization_date is not null
    ),
    g as (
      select a, s, y, count(*) n, sum(cv) total, max(ceil) ceil
      from da where cv < ceil
      group by a, s, y
      having count(*) >= ${splitMinN} and sum(cv) > max(ceil)
    )
    select 'pair', a, s, 'da_split', y::text, true,
      least(1, (total / ceil) / 3),
      jsonb_build_object('year', y, 'count', n, 'total', total, 'ceiling', ceil), ${V}
    from g
  `;

  // ── da_concentration: one supplier captures an authority (per authority) ─
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    with per as (
      select authority_entity_id a, supplier_entity_id s, sum(closing_value) st
      from core.direct_acquisitions
      where state = 'Oferta acceptata'
        and authority_entity_id is not null and supplier_entity_id is not null
        and closing_value is not null and closing_value <= ${maxPlausible}
      group by a, s
    ),
    agg as (
      select a, sum(st) total, count(*) suppliers, max(st) top, sum(power(st,2)) sumsq
      from per group by a
    )
    select 'authority', a, 'da_concentration', 'all', true,
      least(1, top / nullif(total,0)),
      jsonb_build_object('total', total, 'suppliers', suppliers,
        'top_supplier_pct', round(top/nullif(total,0),4),
        'hhi', round(sumsq/nullif(power(total,2),0),4)), ${V}
    from agg
    where total >= ${concMinTot} and suppliers >= ${concMinSup}
      and top/nullif(total,0) >= ${concTopPct}
  `;

  // ── da_dependence: supplier lives off one authority (per supplier) ───────
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    with per as (
      select supplier_entity_id s, authority_entity_id a, sum(closing_value) st
      from core.direct_acquisitions
      where state = 'Oferta acceptata'
        and authority_entity_id is not null and supplier_entity_id is not null
        and closing_value is not null and closing_value <= ${maxPlausible}
      group by s, a
    ),
    agg as (
      select s, sum(st) total, count(*) authorities, max(st) top from per group by s
    )
    select 'supplier', s, 'da_dependence', 'all', true,
      least(1, top / nullif(total,0)),
      jsonb_build_object('total', total, 'authorities', authorities,
        'top_authority_pct', round(top/nullif(total,0),4)), ${V}
    from agg
    where total >= ${depMinTot} and top/nullif(total,0) >= ${depTopPct}
  `;

  // ── da_year_end: December spend spike (per authority-year) ────────────────
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    with m as (
      select authority_entity_id a, extract(year from finalization_date)::int y,
        sum(closing_value) tot,
        sum(case when extract(month from finalization_date) = 12 then closing_value else 0 end) dec
      from core.direct_acquisitions
      where state = 'Oferta acceptata'
        and authority_entity_id is not null and closing_value is not null
        and closing_value <= ${maxPlausible} and finalization_date is not null
      group by a, y
    )
    select 'authority', a, 'da_year_end', y::text, true,
      least(1, dec / nullif(tot,0)),
      jsonb_build_object('year', y, 'total', tot, 'december', dec,
        'december_pct', round(dec/nullif(tot,0),4)), ${V}
    from m
    where tot >= ${yeMinTot} and dec/nullif(tot,0) >= ${yeShare}
  `;

  // ══ Award (contract-award notice) flags ═══════════════════════════════════
  // Live 2026 award stream (short window vs the 2018–2020 DA snapshot). Award
  // value lives at notice level (ron_contract_value); contract-level value is
  // absent, so concentration/dependence attribute the award value to its
  // winner(s), split equally across a consortium.
  const awMaxPlausible = await t("award_max_plausible");
  const awSevRef = await t("award_sev_ref");
  const awMinValue = await t("award_min_value");
  const awSingleBidMin = await t("award_single_bid_min");
  const awConcTopPct = await t("award_conc_top_pct");
  const awConcMinSup = await t("award_conc_min_suppliers");
  const awConcMinTot = await t("award_conc_min_total");
  const awDepTopPct = await t("award_dep_top_pct");
  const awDepMinAuth = await t("award_dep_min_auth");
  const awDepMinTot = await t("award_dep_min_total");

  // ── award_no_competition: negotiation without prior publication (per award) ─
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    select 'award', id, 'award_no_competition', to_char(state_date,'YYYY'), true,
      least(1, ron_contract_value / ${awSevRef}::numeric),
      jsonb_build_object('procedure', procedure_type, 'value', ron_contract_value,
        'estimate', estimated_value_ron, 'cpv', cpv_code), ${V}
    from core.awards
    where procedure_type ilike '%fara publicare prealabila%'
      and ron_contract_value is not null
      and ron_contract_value >= ${awMinValue}::numeric
      and ron_contract_value <= ${awMaxPlausible}::numeric
  `;

  // ── award_single_bid: open procedure, single offer, high value (per award) ──
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    select 'award', id, 'award_single_bid', to_char(state_date,'YYYY'), true,
      least(1, ron_contract_value / ${awSevRef}::numeric),
      jsonb_build_object('procedure', procedure_type, 'value', ron_contract_value,
        'offer', lowest_offer_value, 'cpv', cpv_code), ${V}
    from core.awards
    where lowest_offer_value is not null and lowest_offer_value = highest_offer_value
      and procedure_type in ('Licitatie deschisa','Licitatie deschisa accelerata','Licitatie restransa')
      and ron_contract_value is not null
      and ron_contract_value >= ${awSingleBidMin}::numeric
      and ron_contract_value <= ${awMaxPlausible}::numeric
  `;

  // ── award_concentration: one winner captures an authority (per authority) ───
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    with aw as (
      select a.id award_id, a.authority_entity_id auth, a.ron_contract_value val, cw.entity_id winner
      from core.awards a
      join core.contracts c on c.ca_notice_id = a.ca_notice_id
      join core.contract_winners cw on cw.contract_id = c.id
      where a.authority_entity_id is not null and a.ron_contract_value is not null
        and a.ron_contract_value >= 0 and a.ron_contract_value <= ${awMaxPlausible}::numeric
      group by a.id, a.authority_entity_id, a.ron_contract_value, cw.entity_id
    ),
    sh as (select auth, winner, val / count(*) over (partition by award_id) share from aw),
    per as (select auth, winner, sum(share) st from sh group by auth, winner),
    agg as (select auth, sum(st) total, count(*) nsup, max(st) top, sum(power(st,2)) sq from per group by auth)
    select 'authority', auth, 'award_concentration', 'all', true,
      least(1, top / nullif(total,0)),
      jsonb_build_object('total', round(total), 'winners', nsup,
        'top_winner_pct', round(top/nullif(total,0),4),
        'hhi', round(sq/nullif(power(total,2),0),4)), ${V}
    from agg
    where total >= ${awConcMinTot}::numeric and nsup >= ${awConcMinSup}::int
      and top/nullif(total,0) >= ${awConcTopPct}::float8
  `;

  // ── award_dependence: winner lives off one authority, but active (per supplier)
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    with aw as (
      select a.id award_id, a.authority_entity_id auth, a.ron_contract_value val, cw.entity_id winner
      from core.awards a
      join core.contracts c on c.ca_notice_id = a.ca_notice_id
      join core.contract_winners cw on cw.contract_id = c.id
      where a.authority_entity_id is not null and a.ron_contract_value is not null
        and a.ron_contract_value >= 0 and a.ron_contract_value <= ${awMaxPlausible}::numeric
      group by a.id, a.authority_entity_id, a.ron_contract_value, cw.entity_id
    ),
    sh as (select winner, auth, val / count(*) over (partition by award_id) share from aw),
    per as (select winner, auth, sum(share) st from sh group by winner, auth),
    agg as (select winner, sum(st) total, count(*) nauth, max(st) top from per group by winner)
    select 'supplier', winner, 'award_dependence', 'all', true,
      least(1, top / nullif(total,0)),
      jsonb_build_object('total', round(total), 'authorities', nauth,
        'top_authority_pct', round(top/nullif(total,0),4)), ${V}
    from agg
    where total >= ${awDepMinTot}::numeric and nauth >= ${awDepMinAuth}::int
      and top/nullif(total,0) >= ${awDepTopPct}::float8
  `;

  // ── financials-based flags (MF bilanț via reference.company_financials) ────
  const finTinyMaxEmpl = await t("fin_tiny_max_employees");
  const finTinyMinVal = await t("fin_tiny_min_value");
  const finTinySevRef = await t("fin_tiny_sev_ref");
  const finRelMinRatio = await t("fin_reliance_min_ratio");
  const finRelMinPublic = await t("fin_reliance_min_public");
  const finRelMinTurnover = await t("fin_reliance_min_turnover");

  // Public value per supplier-YEAR: DA actuals + award value split equally
  // across the distinct winners of each award (same convention as
  // award_dependence). Only years where a bilanț filing exists can match.
  const pubYearCte = sql`
    pub as (
      select supplier_entity_id eid, extract(year from finalization_date)::int y,
             sum(closing_value) val
      from core.direct_acquisitions
      where state = 'Oferta acceptata'
        and supplier_entity_id is not null and finalization_date is not null
        and closing_value is not null and closing_value > 0
        and closing_value <= ${maxPlausible}::numeric
      group by 1, 2
      union all
      select winner, y, sum(share) from (
        select aw.winner, aw.y, aw.val / count(*) over (partition by aw.award_id) share
        from (
          select a.id award_id, extract(year from a.state_date)::int y,
                 a.ron_contract_value val, cw.entity_id winner
          from core.awards a
          join core.contracts c on c.ca_notice_id = a.ca_notice_id
          join core.contract_winners cw on cw.contract_id = c.id
          where a.state_date is not null and a.ron_contract_value is not null
            and a.ron_contract_value > 0
            and a.ron_contract_value <= ${awMaxPlausible}::numeric
          group by a.id, y, a.ron_contract_value, cw.entity_id
        ) aw
      ) sh group by 1, 2
    ),
    tot as (select eid, y, sum(val) val from pub group by 1, 2),
    fin as (
      select e.id eid, cf.year y, cf.employees, cf.net_turnover
      from core.entities e
      join reference.company_financials cf on cf.cui = e.cui_canonical
    )
  `;

  // ── fin_tiny_staff: ≤N employees, ≥X lei public money in that year ─────────
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    with ${pubYearCte}
    select 'supplier', t.eid, 'fin_tiny_staff', t.y::text, true,
      least(1, t.val / ${finTinySevRef}::numeric),
      jsonb_build_object('year', t.y, 'employees', f.employees, 'total', round(t.val),
        'per_employee', round(t.val / greatest(f.employees, 1))), ${V}
    from tot t
    join fin f on f.eid = t.eid and f.y = t.y
    where f.employees is not null and f.employees <= ${finTinyMaxEmpl}::int
      and t.val >= ${finTinyMinVal}::numeric
  `;

  // ── fin_public_reliance: firm's turnover is (almost) all public money ──────
  // Summed over the matched years so multi-year contracts don't distort a
  // single year's ratio.
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    with ${pubYearCte},
    rel as (
      select t.eid, sum(t.val) pub_total, sum(f.net_turnover) rev_total, count(*) yrs
      from tot t
      join fin f on f.eid = t.eid and f.y = t.y
      where f.net_turnover is not null and f.net_turnover > 0
      group by t.eid
    )
    select 'supplier', eid, 'fin_public_reliance', 'all', true,
      least(1, pub_total / nullif(rev_total, 0)),
      jsonb_build_object('public_total', round(pub_total), 'revenue_total', round(rev_total),
        'ratio', round(pub_total / nullif(rev_total, 0), 4), 'years', yrs), ${V}
    from rel
    where rev_total >= ${finRelMinTurnover}::numeric
      and pub_total >= ${finRelMinPublic}::numeric
      and pub_total / rev_total >= ${finRelMinRatio}::float8
  `;

  // ── net_shared_admin: sibling firms of one person milking one authority ────
  const netMinFirms = await t("net_admin_min_firms");
  const netMinTotal = await t("net_admin_min_total");
  const netSevRef = await t("net_admin_sev_ref");
  await sql`
    insert into core.flags (subject_type, subject_id, partner_id, flag_code, period, triggered, severity, evidence, methodology_version)
    with reps as (
      -- person (solid identity only) → their firms that exist as entities
      select r.person_key, max(r.person_name) pname,
             max(extract(year from r.birth_date))::int pby, e.id sid
      from reference.company_reps r
      join core.entities e on e.cui_canonical = r.cui
      where r.birth_date is not null
      group by r.person_key, e.id
    ),
    pair as (
      -- money per (supplier, authority): DAs + award values split per winner
      select supplier_entity_id sid, authority_entity_id aid, sum(closing_value) v
      from core.direct_acquisitions
      where state = 'Oferta acceptata'
        and supplier_entity_id is not null and authority_entity_id is not null
        and closing_value > 0 and closing_value <= ${maxPlausible}::numeric
      group by 1, 2
      union all
      select sh.winner, sh.aid, sum(sh.share) from (
        select cw.entity_id winner, aw.authority_entity_id aid,
               aw.ron_contract_value / count(*) over (partition by aw.id) share
        from core.awards aw
        join core.contracts c on c.ca_notice_id = aw.ca_notice_id
        join core.contract_winners cw on cw.contract_id = c.id
        where aw.authority_entity_id is not null and aw.ron_contract_value is not null
          and aw.ron_contract_value > 0 and aw.ron_contract_value <= ${awMaxPlausible}::numeric
      ) sh group by 1, 2
    ),
    pp as (select sid, aid, sum(v) v from pair group by 1, 2),
    g as (
      select rp.person_key, max(rp.pname) pname, max(rp.pby) pby, pp.aid,
             count(distinct pp.sid) nf, sum(pp.v) total,
             array_agg(distinct pp.sid) sids
      from reps rp
      join pp on pp.sid = rp.sid
      group by rp.person_key, pp.aid
      having count(distinct pp.sid) >= ${netMinFirms}::int
         and sum(pp.v) >= ${netMinTotal}::numeric
    )
    select 'supplier', s.sid, g.aid, 'net_shared_admin', 'all', true,
      least(1, g.total / ${netSevRef}::numeric),
      jsonb_build_object('person', g.pname, 'birth_year', g.pby,
        'authority_id', g.aid, 'authority', a.name_display,
        'n_firms', g.nf, 'combined', round(g.total)), ${V}
    from g
    cross join lateral unnest(g.sids) s(sid)
    left join core.entities a on a.id = g.aid
  `;

  const rows = (await sql`
    select flag_code, count(*)::int c from core.flags group by flag_code order by flag_code
  `) as unknown as { flag_code: string; c: number }[];
  const report: FlagsReport = {};
  for (const r of rows) report[r.flag_code] = r.c;
  return report;
}
