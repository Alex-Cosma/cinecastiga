import type { DbSql } from "@seap/db";
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
          min(contract_date)::date::text date_from, max(contract_date)::date::text date_to
        from core.contracts
      ), included as (
        select count(distinct contract_id)::text included, count(*)::text allocations from marts.contract_transactions where closing_value > 0
      ) select 'contracts', to_jsonb(ct) || jsonb_build_object('included', included.included, 'allocations', included.allocations), now() from ct cross join included
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
        from core.contracts where contract_date is not null group by 2
        union all
        select 'ted', extract(year from publication_date)::int, count(*)::text
        from core.ted_notices where publication_date is not null group by 2
      ) y
      on conflict (dataset) do update set observation = excluded.observation, calculated_at = excluded.calculated_at
    `;
  });
}
