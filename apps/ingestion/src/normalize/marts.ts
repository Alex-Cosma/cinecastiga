import type { DbSql } from "@seap/db";

/**
 * Gold marts build (marts-layer DEC-001): truncate + recompute every mart from
 * core, atomically in one transaction (readers see the previous snapshot until
 * commit). This is the SINGLE source for the display marts — it covers both the
 * 2018–2020 dump import AND the live 2021+ scrape, because it reads core, not the
 * dump's precomputed aggregates. (`import-old`'s builder now only fills
 * `cpv_tree`, the one mart with no core-derivable equivalent.)
 *
 * Two plausibility bounds keep corrupt source values out of every total (the
 * same bounds the flag rules use): `da_max_plausible` (~2M — a DA is legally
 * capped near the works ceiling; ~275 dump rows carry billions) and
 * `award_max_plausible` (~1e9 — framework agreements are legitimately large, but
 * one award row carries 13.8B).
 *
 * A session-local `pair_spend` temp table is the shared spine: one row per
 * (authority, supplier) money movement, from DAs (single supplier) and from
 * AWARDS (the award notice value attributed to its winner(s), split equally
 * across a consortium — contract-level value is NULL in the source, so the money
 * lives on the award notice). `ron_full`/`ron_split` are equal here since the
 * consortium split is already applied.
 */
export interface MartsReport {
  nationalStats: number;
  spendByType: number;
  spendByCpv: number;
  spendByCounty: number;
  entityProfiles: number;
  topEntities: number;
  topPartners: number;
  concentration: number;
  contractTransactions: number;
}

const TOP_ENTITIES_LIMIT = 200;
const TOP_PARTNERS_PER_ENTITY = 5;
const DA_BOUND_FALLBACK = 2_000_000;
const AWARD_BOUND_FALLBACK = 1_000_000_000;

async function threshold(sql: DbSql, key: string, fallback: number): Promise<number> {
  const r = (await sql`
    select value_num from core.risk_thresholds where key = ${key}
    order by valid_from desc limit 1
  `) as unknown as { value_num: string }[];
  return r[0] ? Number(r[0].value_num) : fallback;
}

export async function runMarts(
  sql: DbSql,
  opts: { log?: (m: string) => void } = {},
): Promise<MartsReport> {
  const log = opts.log ?? (() => {});
  const daBound = await threshold(sql, "da_max_plausible", DA_BOUND_FALLBACK);
  const awBound = await threshold(sql, "award_max_plausible", AWARD_BOUND_FALLBACK);
  log(`marts bounds: da_max_plausible=${daBound} award_max_plausible=${awBound}`);

  const report = await sql.begin(async (q) => {
    await q`
      truncate
        marts.national_stats, marts.spend_by_type, marts.spend_by_cpv,
        marts.spend_by_county,
        marts.entity_profile, marts.entity_top_partners, marts.top_entities,
        marts.authority_concentration, marts.contract_transactions
    `;

    // ── award value attributed to winners (award notice value / #winners) ─────
    // Contract-level value is NULL in the source; the money is on the award
    // notice (ron_contract_value). Split equally across a consortium.
    await q`
      create temp table award_spend on commit drop as
      with aw as (
        select a.id award_id, a.authority_entity_id auth, cw.entity_id winner,
               a.ron_contract_value val, a.state_date dt,
               a.acquisition_type atype, a.cpv_code cpv
        from core.awards a
        join core.contracts c on c.ca_notice_id = a.ca_notice_id
        join core.contract_winners cw on cw.contract_id = c.id
        where a.authority_entity_id is not null
          and a.ron_contract_value is not null
          and a.ron_contract_value >= 0 and a.ron_contract_value <= ${awBound}
        group by a.id, a.authority_entity_id, cw.entity_id, a.ron_contract_value,
                 a.state_date, a.acquisition_type, a.cpv_code
      )
      select auth, winner,
             val / count(*) over (partition by award_id) as share,
             dt, atype, cpv
      from aw
    `;

    // ── shared spine: DA + award money movements ──────────────────────────────
    await q`
      create temp table pair_spend on commit drop as
      select
        da.authority_entity_id as authority_id,
        da.supplier_entity_id  as supplier_id,
        'da'::text             as src,
        da.closing_value       as ron_full,
        da.closing_value       as ron_split,
        da.finalization_date   as activity_date
      from core.direct_acquisitions da
      where da.state = 'Oferta acceptata'
        and da.authority_entity_id is not null
        and da.supplier_entity_id is not null
        and da.closing_value is not null and da.closing_value <= ${daBound}
      union all
      select auth, winner, 'award', share, share, dt
      from award_spend
    `;

    // ── national_stats: per (kind, year) + headline year-null rows ────────────
    await q`
      insert into marts.national_stats (kind, year, n, total_ron)
      select kind, y, count(*)::int, sum(val)
      from (
        select 'notice'::text kind, extract(year from state_date)::int y,
               estimated_value_ron val
          from core.notices
        union all
        select 'award', extract(year from state_date)::int,
               case when ron_contract_value <= ${awBound} then ron_contract_value end
          from core.awards
        union all
        select 'da', extract(year from finalization_date)::int,
               case when closing_value <= ${daBound} then closing_value end
          from core.direct_acquisitions
          where state = 'Oferta acceptata'
      ) s
      group by grouping sets ((kind, y), (kind))
    `;
    // Headline rows the web reads (year null): entity counts + total spend.
    await q`
      insert into marts.national_stats (kind, year, n, total_ron)
      select 'spend', null, 0, coalesce(sum(ron_split), 0) from pair_spend
    `;

    // ── spend_by_type (kind 'all' = award+da combined; web reads 'all') ───────
    await q`
      insert into marts.spend_by_type (kind, acquisition_type, n, total_ron)
      with s as (
        select 'award'::text kind, atype, share val from award_spend
        union all
        select 'da', acquisition_type,
               case when closing_value <= ${daBound} then closing_value end
          from core.direct_acquisitions
          where state = 'Oferta acceptata'
      )
      select 'all', atype, count(*)::int, sum(val) from s group by atype
      union all
      select kind, atype, count(*)::int, sum(val) from s group by kind, atype
    `;

    // ── spend_by_cpv (division roots; web reads kind 'all') ───────────────────
    await q`
      insert into marts.spend_by_cpv (division, name_ro, kind, n, total_ron)
      with div_names as (
        select left(code, 2) as division, name_ro
        from core.cpv_codes where code like '__000000-_'
      ),
      s as (
        select left(cpv, 2) division, 'award'::text kind, share val
          from award_spend where cpv is not null
        union all
        select left(cpv_code, 2), 'da',
               case when closing_value <= ${daBound} then closing_value end
          from core.direct_acquisitions
          where state = 'Oferta acceptata' and cpv_code is not null
      ),
      agg as (
        select division, 'all'::text kind, count(*)::int n, sum(val) t from s group by division
        union all
        select division, kind, count(*)::int, sum(val) from s group by division, kind
      )
      select a.division, dn.name_ro, a.kind, a.n, a.t
      from agg a left join div_names dn on dn.division = a.division
    `;

    // ── entity_profile: supplier side (both attributions) ───────────────────
    await q`
      insert into marts.entity_profile
        (entity_id, role, n_contracts, n_das, total_ron_full, total_ron_split,
         first_activity, last_activity)
      select
        supplier_id, 'supplier',
        count(*) filter (where src = 'award')::int,
        count(*) filter (where src = 'da')::int,
        sum(ron_full), sum(ron_split),
        min(activity_date)::text, max(activity_date)::text
      from pair_spend
      group by supplier_id
    `;
    // ── entity_profile: authority side ──────────────────────────────────────
    await q`
      insert into marts.entity_profile
        (entity_id, role, n_contracts, n_das, total_ron_full, total_ron_split,
         first_activity, last_activity)
      select
        authority_id, 'authority',
        count(*) filter (where src = 'award')::int,
        count(*) filter (where src = 'da')::int,
        sum(ron_split), sum(ron_split),
        min(activity_date)::text, max(activity_date)::text
      from pair_spend
      group by authority_id
    `;

    // Denormalize display fields so the web reads marts only (build-time join).
    await q`
      update marts.entity_profile ep
      set name_display = e.name_display, county = e.county,
          country_code = e.country_code, is_foreign = e.is_foreign
      from core.entities e where e.id = ep.entity_id
    `;
    // Per-capita: attach the matched UAT population (durable reference, keyed by
    // entity_id). Survives this truncate+rebuild. NOTE: if entities are ever
    // remapped (a re-normalize that changes ids), reference.authority_uat must be
    // re-matched — the SIRUTA population in reference.uat is stable regardless.
    await q`
      update marts.entity_profile ep
      set population = au.population, uat_siruta = au.uat_siruta
      from reference.authority_uat au
      where au.entity_id = ep.entity_id and ep.role = 'authority'
    `;
    // MF bilanț financials (latest filing with an employee count) — suppliers
    // only; null = PFA/foreign/dissolved, an informative absence.
    await q`
      update marts.entity_profile ep
      set employees = cf.employees, employees_year = cf.year, net_turnover = cf.net_turnover
      from core.entities e
      cross join lateral (
        select year, employees, net_turnover
        from reference.company_financials cf
        where cf.cui = e.cui_canonical and cf.employees is not null
        order by year desc
        limit 1
      ) cf
      where e.id = ep.entity_id and ep.role = 'supplier'
    `;

    // ── spend_by_county (choropleth source, both roles) ─────────────────────
    await q`
      insert into marts.spend_by_county (county, role, n, total_ron)
      select county, role, count(*)::int, sum(total_ron_full)
      from marts.entity_profile
      where county is not null and county <> ''
      group by county, role
    `;

    // ── top_entities (leaderboards per role) ────────────────────────────────
    await q`
      insert into marts.top_entities (role, rank, entity_id, total_ron_full, n_contracts)
      select role, rank, entity_id, total_ron_full, n_contracts
      from (
        select role, entity_id, total_ron_full, n_contracts,
               row_number() over (partition by role order by total_ron_full desc nulls last) rank
        from marts.entity_profile
      ) r
      where rank <= ${TOP_ENTITIES_LIMIT}
    `;

    // ── entity_top_partners (top counterparties both directions) ────────────
    await q`
      insert into marts.entity_top_partners (entity_id, role, partner_entity_id, rank, n, total_ron)
      with agg as (
        select supplier_id as entity_id, 'supplier'::text role, authority_id as partner_entity_id,
               count(*)::int n, sum(ron_split) total_ron
        from pair_spend group by supplier_id, authority_id
        union all
        select authority_id, 'authority', supplier_id,
               count(*)::int, sum(ron_split)
        from pair_spend group by authority_id, supplier_id
      )
      select entity_id, role, partner_entity_id, rank, n, total_ron
      from (
        select *, row_number() over (partition by entity_id, role order by total_ron desc nulls last) rank
        from agg
      ) r
      where rank <= ${TOP_PARTNERS_PER_ENTITY}
    `;

    // ── authority_concentration (HHI + top-supplier share, split spend) ─────
    await q`
      insert into marts.authority_concentration
        (authority_entity_id, distinct_suppliers, top_supplier_pct, hhi, total_ron)
      with per_supplier as (
        select authority_id, supplier_id, sum(ron_split) s_total
        from pair_spend group by authority_id, supplier_id
      ),
      per_authority as (
        select authority_id, sum(s_total) a_total, count(*)::int distinct_suppliers,
               max(s_total) top_s
        from per_supplier group by authority_id
      )
      select
        pa.authority_id, pa.distinct_suppliers,
        case when pa.a_total > 0 then round(pa.top_s / pa.a_total, 4) end,
        case when pa.a_total > 0 then round(
          (select sum(power(ps.s_total / pa.a_total, 2)) from per_supplier ps
            where ps.authority_id = pa.authority_id), 4) end,
        pa.a_total
      from per_authority pa
    `;

    // ── contract_transactions: the ask engine's above-threshold twin ─────────
    // One row per (contract, winner); consortium value split equally into
    // closing_value (anti-double-count — sums stay honest). Competition columns
    // from the CONFIRMED TED crosswalk tier only; null = unknown.
    // Framework/call-off dedup: an "acord-cadru" row is a CEILING, not money —
    // when the same notice also published explicit "contract subsecvent" rows
    // (the actual orders), the framework row would double-count them and is
    // excluded. Frameworks whose call-offs were never published stay (they are
    // the only record of that money; the ceiling caveat covers them).
    await q`
      insert into marts.contract_transactions (
        contract_id, supplier_id, contract_no, ca_notice_id, notice_no,
        authority_id, authority_name, supplier_name, county,
        cpv_code, cpv_name, procedure_type, acquisition_type,
        closing_value, contract_value_full, n_winners, finalization_date,
        tenders_received, is_single_bidder, also_in_ted, ted_pubnum
      )
      with has_sub as (
        select distinct ca_notice_id from core.contracts
        where title ~* 'subsecvent'
      ),
      base as (
        select c.id contract_id, c.contract_no, c.ca_notice_id, aw.notice_no,
               aw.authority_entity_id authority_id, c.contract_value, c.contract_date,
               aw.cpv_code, aw.procedure_type, aw.acquisition_type
        from core.contracts c
        join core.awards aw on aw.ca_notice_id = c.ca_notice_id
        where c.contract_value is not null and c.contract_value > 0
          and c.contract_value <= ${awBound}
          and c.contract_date is not null
          and (c.currency is null or c.currency ilike '%ron%')
          and aw.authority_entity_id is not null
          and not (
            c.title ~* 'acord[- ]cadru' and c.title !~* 'subsecvent'
            and c.ca_notice_id in (select ca_notice_id from has_sub)
          )
      ),
      w as (
        select contract_id, entity_id
        from core.contract_winners
        group by contract_id, entity_id
      ),
      wn as (
        select contract_id, entity_id,
               count(*) over (partition by contract_id) n
        from w
      )
      select
        b.contract_id, wn.entity_id, b.contract_no, b.ca_notice_id, b.notice_no,
        b.authority_id, ae.name_display, se.name_display, ae.county,
        b.cpv_code, cpv.name_ro, b.procedure_type, b.acquisition_type,
        b.contract_value / wn.n, b.contract_value, wn.n,
        to_char(b.contract_date, 'YYYY-MM-DD'),
        cc.tenders_received, cc.is_single_bidder,
        cc.contract_id is not null,
        tn.publication_number
      from base b
      join wn on wn.contract_id = b.contract_id
      left join core.entities ae on ae.id = b.authority_id
      left join core.entities se on se.id = wn.entity_id
      left join core.cpv_codes cpv on cpv.code = b.cpv_code
      left join marts.contract_competition cc on cc.contract_id = b.contract_id
      left join core.ted_lot_results tlr on tlr.id = cc.ted_lot_result_id
      left join core.ted_notices tn on tn.id = tlr.ted_notice_id
    `;

    // Headline entity counts (year null) — after entity_profile exists.
    await q`
      insert into marts.national_stats (kind, year, n, total_ron)
      select role, null, count(*)::int, null
      from marts.entity_profile group by role
    `;

    const [ns] = await q`select count(*)::int c from marts.national_stats`;
    const [st] = await q`select count(*)::int c from marts.spend_by_type`;
    const [sc] = await q`select count(*)::int c from marts.spend_by_cpv`;
    const [sct] = await q`select count(*)::int c from marts.spend_by_county`;
    const [ep] = await q`select count(*)::int c from marts.entity_profile`;
    const [te] = await q`select count(*)::int c from marts.top_entities`;
    const [tp] = await q`select count(*)::int c from marts.entity_top_partners`;
    const [ac] = await q`select count(*)::int c from marts.authority_concentration`;
    const [ctx] = await q`select count(*)::int c from marts.contract_transactions`;
    return {
      nationalStats: ns!.c as number,
      spendByType: st!.c as number,
      spendByCpv: sc!.c as number,
      spendByCounty: sct!.c as number,
      entityProfiles: ep!.c as number,
      topEntities: te!.c as number,
      topPartners: tp!.c as number,
      concentration: ac!.c as number,
      contractTransactions: ctx!.c as number,
    };
  });

  log(
    `marts rebuilt: national_stats=${report.nationalStats}, spend_by_type=${report.spendByType}, ` +
      `spend_by_cpv=${report.spendByCpv}, spend_by_county=${report.spendByCounty}, ` +
      `entity_profile=${report.entityProfiles}, top_entities=${report.topEntities}, ` +
      `top_partners=${report.topPartners}, concentration=${report.concentration}, ` +
      `contract_transactions=${report.contractTransactions}`,
  );
  return report;
}
