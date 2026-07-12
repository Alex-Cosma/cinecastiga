import type { DbSql } from "@seap/db";

/**
 * Gold marts build (marts-layer DEC-001): truncate + recompute every mart from
 * core, atomically in one transaction (readers see the previous snapshot until
 * commit). Runs entirely offline over core — independent of scraping.
 *
 * A session-local `pair_spend` temp table is the shared spine: one row per
 * (authority, supplier) money movement, from DAs (single supplier) and contract
 * winners (consortia exploded). `ron_full` credits each winner the whole
 * contract; `ron_split` = contract / winner-count and reconciles to the true
 * spend (DEC-006). Authority-side totals use `ron_split` so a 3-winner contract
 * counts once; supplier-side keeps both.
 */
export interface MartsReport {
  nationalStats: number;
  spendByType: number;
  spendByCpv: number;
  entityProfiles: number;
  topEntities: number;
  topPartners: number;
  concentration: number;
}

const TOP_ENTITIES_LIMIT = 200;
const TOP_PARTNERS_PER_ENTITY = 5;

export async function runMarts(
  sql: DbSql,
  opts: { log?: (m: string) => void } = {},
): Promise<MartsReport> {
  const log = opts.log ?? (() => {});

  const report = await sql.begin(async (q) => {
    await q`
      truncate
        marts.national_stats, marts.spend_by_type, marts.spend_by_cpv,
        marts.entity_profile, marts.entity_top_partners, marts.top_entities,
        marts.authority_concentration
    `;

    // ── shared spine ────────────────────────────────────────────────────────
    await q`
      create temp table pair_spend on commit drop as
      select
        da.authority_entity_id as authority_id,
        da.supplier_entity_id  as supplier_id,
        'da'::text             as src,
        null::bigint           as contract_id,
        da.closing_value       as ron_full,
        da.closing_value       as ron_split,
        da.finalization_date   as activity_date
      from core.direct_acquisitions da
      where da.authority_entity_id is not null
        and da.supplier_entity_id is not null
      union all
      select
        aw.authority_entity_id,
        cw.entity_id,
        'contract',
        c.id,
        c.contract_value,
        c.contract_value / nullif(count(*) over (partition by cw.contract_id), 0),
        c.contract_date
      from core.contracts c
      join core.contract_winners cw on cw.contract_id = c.id
      left join core.awards aw on aw.ca_notice_id = c.ca_notice_id
      where aw.authority_entity_id is not null
    `;

    // ── national_stats (independent of pair_spend) ──────────────────────────
    await q`
      insert into marts.national_stats (kind, year, n, total_ron)
      select kind, y, count(*)::int, sum(val)
      from (
        select 'notice'::text kind, extract(year from state_date)::int y, estimated_value_ron val
          from core.notices
        union all
        select 'award', extract(year from state_date)::int, ron_contract_value from core.awards
        union all
        select 'da', extract(year from finalization_date)::int, closing_value
          from core.direct_acquisitions
      ) s
      group by grouping sets ((kind, y), (kind))
    `;

    // ── spend_by_type (acquisition type — the 2020 build's cut) ─────────────
    await q`
      insert into marts.spend_by_type (kind, acquisition_type, n, total_ron)
      select 'award', acquisition_type, count(*)::int, sum(ron_contract_value)
        from core.awards group by acquisition_type
      union all
      select 'da', acquisition_type, count(*)::int, sum(closing_value)
        from core.direct_acquisitions group by acquisition_type
    `;

    // ── spend_by_cpv (award + da streams, division names from CPV roots) ─────
    await q`
      insert into marts.spend_by_cpv (division, name_ro, kind, n, total_ron)
      with div_names as (
        select left(code, 2) as division, name_ro
        from core.cpv_codes
        where code like '__000000-_'
      ),
      raw as (
        select left(cpv_code, 2) division, 'award'::text kind, ron_contract_value val
          from core.awards where cpv_code is not null
        union all
        select left(cpv_code, 2), 'da', closing_value
          from core.direct_acquisitions where cpv_code is not null
      )
      select r.division, dn.name_ro, r.kind, count(*)::int, sum(r.val)
      from raw r
      left join div_names dn on dn.division = r.division
      group by r.division, dn.name_ro, r.kind
    `;

    // ── entity_profile: supplier side (both attributions) ───────────────────
    await q`
      insert into marts.entity_profile
        (entity_id, role, n_contracts, n_das, total_ron_full, total_ron_split,
         first_activity, last_activity)
      select
        supplier_id, 'supplier',
        count(*) filter (where src = 'contract')::int,
        count(*) filter (where src = 'da')::int,
        sum(ron_full), sum(ron_split),
        min(activity_date)::text, max(activity_date)::text
      from pair_spend
      group by supplier_id
    `;

    // ── entity_profile: authority side (split reconciles; full = split) ─────
    await q`
      insert into marts.entity_profile
        (entity_id, role, n_contracts, n_das, total_ron_full, total_ron_split,
         first_activity, last_activity)
      select
        authority_id, 'authority',
        count(distinct contract_id)::int,
        count(*) filter (where src = 'da')::int,
        sum(ron_split), sum(ron_split),
        min(activity_date)::text, max(activity_date)::text
      from pair_spend
      group by authority_id
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

    const [ns] = await q`select count(*)::int c from marts.national_stats`;
    const [st] = await q`select count(*)::int c from marts.spend_by_type`;
    const [sc] = await q`select count(*)::int c from marts.spend_by_cpv`;
    const [ep] = await q`select count(*)::int c from marts.entity_profile`;
    const [te] = await q`select count(*)::int c from marts.top_entities`;
    const [tp] = await q`select count(*)::int c from marts.entity_top_partners`;
    const [ac] = await q`select count(*)::int c from marts.authority_concentration`;
    return {
      nationalStats: ns!.c as number,
      spendByType: st!.c as number,
      spendByCpv: sc!.c as number,
      entityProfiles: ep!.c as number,
      topEntities: te!.c as number,
      topPartners: tp!.c as number,
      concentration: ac!.c as number,
    };
  });

  log(
    `marts rebuilt: national_stats=${report.nationalStats}, spend_by_type=${report.spendByType}, ` +
      `spend_by_cpv=${report.spendByCpv}, ` +
      `entity_profile=${report.entityProfiles}, top_entities=${report.topEntities}, ` +
      `top_partners=${report.topPartners}, concentration=${report.concentration}`,
  );
  return report;
}
