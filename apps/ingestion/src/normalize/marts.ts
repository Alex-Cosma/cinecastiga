import { contractRonValue, canonicalContract, assertContractIdentityQuality } from "@seap/db";
import type { DbSql } from "@seap/db";

/**
 * Rebuild display marts atomically from the same procurement population used by
 * ordinary value queries: accepted, positive DAs up to the plausibility ceiling
 * and positive RON procedure contracts allocated equally to recorded winners.
 * Award notices and TED publications describe those procurements; their values
 * are never added to the transaction spine. Amounts are recorded commitments,
 * not evidence of payment. Contract counts are distinct source contracts.
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
  if (daBound !== DA_BOUND_FALLBACK || awBound !== AWARD_BOUND_FALLBACK) {
    throw new Error("Plausibility bounds differ from the query population; update all consumers together before rebuilding marts");
  }
  log(`marts bounds: da_max_plausible=${daBound} award_max_plausible=${awBound}`);

  const report = await sql.begin(async (q) => {
    await assertContractIdentityQuality(q);
    // Calendar days/years must match SEAP detail pages in Romanian time.
    await q`set local time zone 'Europe/Bucharest'`;
    await q`
      truncate
        marts.national_stats, marts.spend_by_type, marts.spend_by_cpv,
        marts.spend_by_county,
        marts.entity_profile, marts.entity_top_partners, marts.top_entities,
        marts.authority_concentration, marts.contract_transactions
    `;

    // ── contract_transactions: the canonical procedure-contract population ─────────
    // One row per (contract, winner); consortium value split equally into
    // closing_value; the last member receives the rounding remainder so the
    // allocations sum exactly to the source amount. Sub-cent shares keep enough
    // decimal places to retain every positive winner allocation. Competition columns
    // from the CONFIRMED TED crosswalk tier only; null = unknown.
    // Framework/call-off dedup: an "acord-cadru" row is a CEILING, not money —
    // when the same notice also published explicit "contract subsecvent" rows
    // (the actual orders), the framework row would double-count them and is
    // excluded. Frameworks whose call-offs were never published stay (they are
    // the available commitment record, not confirmed payments).
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
               aw.authority_entity_id authority_id, ${contractRonValue(q)} as contract_value, c.contract_date,
               aw.cpv_code, aw.procedure_type, aw.acquisition_type
        from core.contracts c
        join core.awards aw on aw.ca_notice_id = c.ca_notice_id
        where ${canonicalContract(q)} and ${contractRonValue(q)} is not null and ${contractRonValue(q)} > 0
          and ${contractRonValue(q)} <= ${awBound}
          and c.contract_date is not null
          and aw.authority_entity_id is not null
          and not (
            coalesce(c.title, '') ~* 'acord[- ]cadru' and coalesce(c.title, '') !~* 'subsecvent'
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
               count(*) over (partition by contract_id) n,
               row_number() over (partition by contract_id order by entity_id) winner_position
        from w
      )
      select
        b.contract_id, wn.entity_id, b.contract_no, b.ca_notice_id, b.notice_no,
        b.authority_id, ae.name_display, se.name_display, ae.county,
        b.cpv_code, cpv.name_ro, b.procedure_type, b.acquisition_type,
        case when wn.winner_position = wn.n
          then b.contract_value - trunc(b.contract_value / wn.n,
            case when b.contract_value / wn.n < 0.01
              then scale(b.contract_value) + length(wn.n::text) + 1 else 2 end) * (wn.n - 1)
          else trunc(b.contract_value / wn.n,
            case when b.contract_value / wn.n < 0.01
              then scale(b.contract_value) + length(wn.n::text) + 1 else 2 end) end,
        b.contract_value, wn.n,
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

    // Shared transaction population. Use contract values already allocated per
    // recorded winner, never an award-notice total repeated over its contracts.
    await q`
      create temp table award_spend on commit drop as
      select contract_id, authority_id auth, supplier_id winner,
             closing_value share, finalization_date::date dt,
             acquisition_type atype, cpv_code cpv
      from marts.contract_transactions where closing_value > 0
    `;
    await q`
      create temp table pair_spend on commit drop as
      select da.authority_entity_id authority_id, da.supplier_entity_id supplier_id,
             'da'::text src, da.id record_id, da.closing_value ron_full,
             da.closing_value ron_split, da.finalization_date activity_date
      from core.direct_acquisitions da
      where da.state = 'Oferta acceptata'
        and da.closing_value > 0 and da.closing_value <= ${daBound}
      union all
      select auth, winner, 'award', contract_id, share, share, dt from award_spend
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
          where state = 'Oferta acceptata' and closing_value > 0 and closing_value <= ${daBound}
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
          where state = 'Oferta acceptata' and closing_value > 0 and closing_value <= ${daBound}
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
            and closing_value > 0 and closing_value <= ${daBound}
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
        count(distinct record_id) filter (where src = 'award')::int,
        count(*) filter (where src = 'da')::int,
        sum(ron_full), sum(ron_split),
        min(activity_date)::text, max(activity_date)::text
      from pair_spend where supplier_id is not null
      group by supplier_id
    `;
    // ── entity_profile: authority side ──────────────────────────────────────
    await q`
      insert into marts.entity_profile
        (entity_id, role, n_contracts, n_das, total_ron_full, total_ron_split,
         first_activity, last_activity)
      select
        authority_id, 'authority',
        count(distinct record_id) filter (where src = 'award')::int,
        count(*) filter (where src = 'da')::int,
        sum(ron_split), sum(ron_split),
        min(activity_date)::text, max(activity_date)::text
      from pair_spend where authority_id is not null
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
      select coalesce(nullif(county, ''), 'Necunoscut'), role, count(*)::int, sum(total_ron_split)
      from marts.entity_profile
      group by coalesce(nullif(county, ''), 'Necunoscut'), role
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
        from pair_spend where supplier_id is not null and authority_id is not null group by supplier_id, authority_id
        union all
        select authority_id, 'authority', supplier_id,
               count(*)::int, sum(ron_split)
        from pair_spend where authority_id is not null and supplier_id is not null group by authority_id, supplier_id
      )
      select entity_id, role, partner_entity_id, rank, n, total_ron
      from (
        select *, row_number() over (partition by entity_id, role order by total_ron desc nulls last) rank
        from agg
      ) r
      where rank <= ${TOP_PARTNERS_PER_ENTITY}
    `;

    // ── authority_concentration (HHI + top-supplier share, split spend) ─────
    // Compute each authority's denominator once. A correlated scan of the
    // materialized supplier groups for every authority is quadratic at full size.
    await q`
      insert into marts.authority_concentration
        (authority_entity_id, distinct_suppliers, top_supplier_pct, hhi, total_ron)
      with per_supplier as (
        select authority_id, supplier_id, sum(ron_split) s_total
        from pair_spend where authority_id is not null and supplier_id is not null group by authority_id, supplier_id
      ),
      shares as (
        select authority_id, s_total,
               sum(s_total) over (partition by authority_id) a_total
        from per_supplier
      )
      select
        authority_id, count(*)::int,
        case when a_total > 0 then round(max(s_total) / a_total, 4) end,
        case when a_total > 0 then round(sum(power(s_total / nullif(a_total, 0), 2)), 4) end,
        a_total
      from shares group by authority_id, a_total
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
