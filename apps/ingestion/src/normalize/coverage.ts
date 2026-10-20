import { contractAboveValueCap, contractDatePlausible, contractKind, contractReportable, contractRonValue, CONTRACT_VALUE_CAP_RON, frameworkHasCalloffs, type DbSql } from "@seap/db";
import { TED_NORMALIZATION_VERSION } from "./ted.js";

/** Persist expensive counts once per refresh. Publish all observations atomically. */
export async function runCoverage(sql: DbSql): Promise<void> {
  await sql.begin("isolation level repeatable read", async (q) => {
    // Calendar days/years must match SEAP detail pages in Romanian time.
    await q`set local time zone 'Europe/Bucharest'`;
    await q`
      insert into marts.data_coverage (dataset, observation, calculated_at)
      with da as (
        select count(*)::text available,
          count(*) filter (where finalization_date is null)::text missing_date,
          count(*) filter (where cpv_code is null)::text missing_cpv,
          count(*) filter (where raw_id is null)::text missing_raw,
          min(finalization_date)::date::text date_from, max(finalization_date)::date::text date_to
        from core.direct_acquisitions
      ), included as (
        select count(*)::text included from marts.da_transactions
        where closing_value > 0 and closing_value <= 2000000
      ) select 'da', to_jsonb(da) || jsonb_build_object('included', included.included), now() from da cross join included
      on conflict (dataset) do update set observation = excluded.observation, calculated_at = excluded.calculated_at
    `;
    await q`
      insert into marts.data_coverage (dataset, observation, calculated_at)
      with ct as (
        select count(*)::text available,
          count(*) filter (where contract_date is null)::text missing_date,
          count(*) filter (where cpv_code is null)::text missing_cpv,
          count(*) filter (where currency is null)::text missing_currency,
          count(*) filter (where ${contractKind(q)}='amendment')::text non_additive_amendments,
          count(*) filter (where ${contractKind(q)}='review')::text unverified_contract_type,
          count(*) filter (where ${contractKind(q)}='framework')::text framework_publications,
          count(*) filter (where ${contractKind(q)}='framework' and not ${frameworkHasCalloffs(q)})::text frameworks_without_identified_calloffs,
          -- Source dates before the archive start are counted, not used as its interval.
          count(*) filter (where not ${contractDatePlausible(q)})::text implausible_date,
          (min(contract_date) filter (where ${contractDatePlausible(q)}))::date::text date_from,
          (max(contract_date) filter (where ${contractDatePlausible(q)}))::date::text date_to
        from core.contracts c
      ), included as (
        select count(distinct contract_id)::text included, count(*)::text allocations from marts.contract_transactions where closing_value > 0
      ) select 'contracts', to_jsonb(ct) || jsonb_build_object('included', included.included, 'allocations', included.allocations,
        'temporarily_excluded_groups',(select count(distinct candidate_id)::text from marts.contract_identity_exclusions),
        'temporarily_excluded_publications',(select count(*)::text from marts.contract_identity_exclusions),
        'temporarily_excluded_financial_groups',(select count(distinct x.candidate_id)::text
          from marts.contract_identity_exclusions x join core.contracts c on c.id=x.contract_id
          join core.awards a using(ca_notice_id)
          where (${contractReportable(q)}) and ${contractRonValue(q)}>0 and ${contractRonValue(q)}<=1000000000
            and c.contract_date is not null and a.authority_entity_id is not null
            and exists(select 1 from core.contract_winners w where w.contract_id=c.id)))
        -- Otherwise-included contracts kept out of every total by the value cap.
        || (select jsonb_build_object('above_value_cap',count(*)::text,
              'above_value_cap_value',coalesce(trim_scale(sum(${contractRonValue(q)})),0)::text,
              'value_cap',${String(CONTRACT_VALUE_CAP_RON)}::text)
            from core.contracts c join core.awards a using(ca_notice_id) where ${contractAboveValueCap(q)}), now() from ct cross join included
      on conflict (dataset) do update set observation = excluded.observation, calculated_at = excluded.calculated_at
    `;
    await q`
      insert into marts.data_coverage (dataset, observation, calculated_at)
      with notices as (
        select count(*)::text available,
          count(*) filter (where publication_date is null)::text missing_date,
          count(*) filter (where cpv_code is null)::text missing_cpv,
          count(*) filter (where normalization_version is distinct from ${TED_NORMALIZATION_VERSION})::text unverified,
          min(publication_date)::date::text date_from, max(publication_date)::date::text date_to
        from core.ted_notices
      ), lots as (
        select count(*)::text results,
          count(*) filter (where tenders_received is null)::text unknown_competition
        from core.ted_lot_results
      ) select 'ted', to_jsonb(notices) || to_jsonb(lots), now() from notices cross join lots
      on conflict (dataset) do update set observation = excluded.observation, calculated_at = excluded.calculated_at
    `;
    await q`
      insert into marts.data_coverage (dataset, observation, calculated_at)
      select 'years', coalesce(jsonb_agg(to_jsonb(y) order by y.src, y.year), '[]'::jsonb), now()
      from (
        select 'da' src, extract(year from finalization_date)::int as year, count(*)::text n
        from core.direct_acquisitions where finalization_date is not null group by 2
        union all
        select 'contracts', extract(year from contract_date)::int, count(*)::text
        from core.contracts c where ${contractDatePlausible(q)} group by 2
        union all
        select 'ted', extract(year from publication_date)::int, count(*)::text
        from core.ted_notices where publication_date is not null group by 2
      ) y
      on conflict (dataset) do update set observation = excluded.observation, calculated_at = excluded.calculated_at
    `;
  });
}
