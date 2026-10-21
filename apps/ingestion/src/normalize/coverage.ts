import { canonicalContract, contractAboveValueCap, contractDatePlausible, contractHasSupplier, contractWinnerIsAuthority, contractKind, contractKindFromTitle, contractReportable, contractRonValue, CONTRACT_VALUE_CAP_RON, frameworkHasCalloffs, type DbSql } from "@seap/db";
import { TED_NORMALIZATION_VERSION } from "./ted.js";

/** Collector tasks at or above this priority are background backfill (`BACKGROUND_PRIORITY`). */
const BACKGROUND_PRIORITY = 50;
/** A contract month counts as complete once it has this share of the same month a year earlier. */
export const CONTRACT_MONTH_COMPLETE_RATIO = 0.9;

/**
 * "Complete until" per stream (audit F10), a Bucharest calendar day or null when it cannot be
 * established. Nightly, from the collection record and the published marts; no source traffic.
 * - DA: the last day of the unbroken run of days, from the collector's first DA day, on which
 *   one scan of the day finished every ordinary task (complete or split, at least one complete,
 *   nothing queued, running, failed or deferred). A later re-scan of a finished day does not
 *   undo it; a day without tasks or with an unfinished scan ends the run.
 * - Contracts: the end of the latest ended month whose distinct included contracts reach
 *   CONTRACT_MONTH_COMPLETE_RATIO of the same month a year earlier. SEAP publishes award
 *   notices weeks or months after signature, so recent months fill in late.
 * - TED: the publication day of the newest OJ S package the collector archived, or the last
 *   day of the newest finished windowed TED import, whichever is later.
 */
export async function completeUntil(q: DbSql): Promise<Record<"da" | "contracts" | "ted", string | null>> {
  // Probed separately: a missing table must not abort the caller's transaction.
  const [tables] = await q`select to_regclass('app.collection_tasks') is not null tasks, to_regclass('core.scrape_runs') is not null runs`;
  let da: string | null = null, tedPackage: string | null = null, tedImport: string | null = null;
  if (tables?.["tasks"]) {
    const [row] = await q`
      with windows as (
        -- Group before expanding: days share few (window, scan) combinations.
        select (params->>'from')::date f, (params->>'to')::date t, coalesce(params->>'daScan', '') scan,
          count(*) filter (where status not in ('complete', 'split')) unfinished,
          count(*) filter (where status = 'complete') complete
        from app.collection_tasks
        where priority < ${BACKGROUND_PRIORITY} and params ? 'from' and params ? 'to'
          and ((stream = 'da' and kind in ('da', 'da-detail')) or (stream = 'catalogue' and kind = 'catalogue' and params ? 'daStrategy'))
        group by 1, 2, 3
      ), scans as (
        select g::date d, w.scan, sum(w.unfinished) = 0 and sum(w.complete) > 0 done
        from windows w cross join generate_series(w.f, w.t, interval '1 day') g group by 1, 2
      ), days as (select d, bool_or(done) done from scans group by 1),
      first_open as (
        select min(g::date) d from generate_series((select min(d) from days), (select max(d) from days) + 1, interval '1 day') g
        where not exists (select 1 from days x where x.d = g::date and x.done)
      )
      select case when f.d > (select min(d) from days) then (f.d - 1)::text end until from first_open f`;
    da = row?.["until"] == null ? null : String(row["until"]);
    const [pkg] = await q`select max(result->>'publicationDate') last_day from app.collection_tasks
      where stream = 'ted' and kind = 'ted-package' and status = 'complete' and result->>'published' = 'true'
        and result->>'publicationDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`;
    tedPackage = pkg?.["last_day"] == null ? null : String(pkg["last_day"]);
  }
  if (tables?.["runs"]) {
    // TED import windows are encoded in UTC (scrape/ted): the window end's UTC day is its last day.
    const [run] = await q`select max((window_end at time zone 'UTC')::date)::text last_day from core.scrape_runs
      where source like 'ted:%' and status = 'completed' and window_end is not null`;
    tedImport = run?.["last_day"] == null ? null : String(run["last_day"]);
  }
  const [contracts] = await q`
    with months as (
      select left(finalization_date, 7) ym, count(distinct contract_id) n
      from marts.contract_transactions where closing_value > 0 and finalization_date ~ '^[0-9]{4}-[0-9]{2}' group by 1
    )
    select (max(to_date(m.ym, 'YYYY-MM')) + interval '1 month' - interval '1 day')::date::text until
    from months m join months p on p.ym = to_char(to_date(m.ym, 'YYYY-MM') - interval '1 year', 'YYYY-MM')
    where to_date(m.ym, 'YYYY-MM') < date_trunc('month', now())::date and m.n >= ${CONTRACT_MONTH_COMPLETE_RATIO}::numeric * p.n`;
  const ted = [tedPackage, tedImport].filter((day): day is string => day !== null).sort().at(-1) ?? null;
  return { da, contracts: contracts?.["until"] == null ? null : String(contracts["until"]), ted };
}

/** Persist expensive counts once per refresh. Publish all observations atomically. */
export async function runCoverage(sql: DbSql): Promise<void> {
  await sql.begin("isolation level repeatable read", async (q) => {
    // Calendar days/years must match SEAP detail pages in Romanian time.
    await q`set local time zone 'Europe/Bucharest'`;
    const until = await completeUntil(q as unknown as DbSql);
    const selfSupplied = q`state = 'Oferta acceptata' and closing_value > 0 and closing_value <= 2000000
      and supplier_entity_id = authority_entity_id`;
    await q`
      insert into marts.data_coverage (dataset, observation, calculated_at)
      with da as (
        select count(*)::text available,
          count(*) filter (where finalization_date is null)::text missing_date,
          count(*) filter (where cpv_code is null)::text missing_cpv,
          count(*) filter (where raw_id is null)::text missing_raw,
          -- Included DAs whose recorded supplier is their own authority (audit F12):
          -- in the authority's total, never a supplier's.
          count(*) filter (where ${selfSupplied})::text supplier_is_authority,
          coalesce(trim_scale(sum(closing_value) filter (where ${selfSupplied})), 0)::text supplier_is_authority_value,
          min(finalization_date)::date::text date_from, max(finalization_date)::date::text date_to
        from core.direct_acquisitions
      ), included as (
        select count(*)::text included from marts.da_transactions
        where closing_value > 0 and closing_value <= 2000000
      ) select 'da', to_jsonb(da) || jsonb_build_object('included', included.included, 'complete_until', ${until.da}::text), now() from da cross join included
      on conflict (dataset) do update set observation = excluded.observation, calculated_at = excluded.calculated_at
    `;
    await q`
      insert into marts.data_coverage (dataset, observation, calculated_at)
      with ct as (
        select count(*)::text available,
          count(*) filter (where contract_date is null)::text missing_date,
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
        'complete_until', ${until.contracts}::text,
        'temporarily_excluded_groups',(select count(distinct candidate_id)::text from marts.contract_identity_exclusions),
        'temporarily_excluded_publications',(select count(*)::text from marts.contract_identity_exclusions),
        'temporarily_excluded_financial_groups',(select count(distinct x.candidate_id)::text
          from marts.contract_identity_exclusions x join core.contracts c on c.id=x.contract_id
          join core.awards a using(ca_notice_id)
          where (${contractReportable(q)}) and ${contractRonValue(q)}>0 and ${contractRonValue(q)}<=1000000000
            and c.contract_date is not null and a.authority_entity_id is not null
            and ${contractHasSupplier(q)}))
        -- CPV as the totals use it (audit F38): the parser leaves contracts.cpv_code
        -- empty, so contract rows take the CPV of their award notice.
        || (select jsonb_build_object('missing_notice_cpv',count(*)::text)
            from core.contracts c left join core.awards a using(ca_notice_id) where a.cpv_code is null)
        -- Otherwise-included contracts kept out of every total by the value cap.
        || (select jsonb_build_object('above_value_cap',count(*)::text,
              'above_value_cap_value',coalesce(trim_scale(sum(${contractRonValue(q)})),0)::text,
              'value_cap',${String(CONTRACT_VALUE_CAP_RON)}::text)
            from core.contracts c join core.awards a using(ca_notice_id) where ${contractAboveValueCap(q)})
        -- Otherwise-included contracts whose only recorded winner is their own
        -- authority (audit F12): no known supplier, so outside every total.
        || (select jsonb_build_object('winner_is_authority',count(*)::text,
              'winner_is_authority_value',coalesce(trim_scale(sum(${contractRonValue(q)})),0)::text)
            from core.contracts c join core.awards a using(ca_notice_id)
            where ${contractWinnerIsAuthority(q)} and ${canonicalContract(q)} and (${contractReportable(q)})
              and ${contractRonValue(q)}>0 and ${contractRonValue(q)}<=${CONTRACT_VALUE_CAP_RON} and c.contract_date is not null)
        -- Canonical contracts typed by the title rule, without an archived SEAP
        -- type (audit F08), and the part of them that reached the totals. The
        -- value covers only the rows with a verifiable sum in lei: legacy EUR/USD
        -- rows have no verified conversion, so they are counted apart, not as zero.
        || (select jsonb_build_object('title_classified',count(*)::text,
              'title_classified_valued',count(*) filter (where ${contractRonValue(q)}>0)::text,
              'title_classified_value',coalesce(trim_scale(sum(${contractRonValue(q)}) filter (where ${contractRonValue(q)}>0)),0)::text,
              'title_classified_without_ron_value',count(*) filter (where coalesce(${contractRonValue(q)},0)<=0)::text)
            from core.contracts c where ${contractKindFromTitle(q)} and ${canonicalContract(q)})
        || (select jsonb_build_object('title_classified_included',count(distinct t.contract_id)::text,
              'title_classified_included_value',coalesce(trim_scale(sum(t.closing_value)),0)::text)
            from marts.contract_transactions t join core.contracts c on c.id=t.contract_id
            where t.closing_value>0 and ${contractKindFromTitle(q)}), now() from ct cross join included
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
      ) select 'ted', to_jsonb(notices) || to_jsonb(lots) || jsonb_build_object('complete_until', ${until.ted}::text), now() from notices cross join lots
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
