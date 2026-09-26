import type { DbSql } from "@seap/db";

/** Preserve observation/collection times; checkpoint publication is not collection. */
export async function monitoringSourceCoverage(q: DbSql): Promise<Record<string, unknown>> {
  const observations = await q`select dataset, observation, calculated_at::text "calculatedAt" from marts.data_coverage order by dataset`;
  const collections = await q`select distinct on (source) source, status "latestStatus", started_at::text "latestStartedAt",
    max(finished_at) filter (where status = 'completed') over (partition by source)::text "lastSucceededAt",
    window_start::text "windowFrom", window_end::text "windowTo", reported_total::text "reportedCount",
    fetched_count::text "fetchedCount", deviation
    from core.scrape_runs order by source, started_at desc, id desc`;
  const normalized = await q`select transform, last_raw_id::text "lastRawId", updated_at::text "updatedAt" from core.normalize_watermarks order by transform`;
  return { observations: [...observations], collections: [...collections], normalized: [...normalized],
    sourceCompletenessVerified: false,
    note: "Datele de achiziție, ultima colectare reușită și calcularea inventarului sunt momente diferite. Publicarea acestei versiuni nu înseamnă o colectare nouă." };
}

/** A well-shaped but stale inventory cannot establish a baseline. */
export async function validateCoverageCounts(q: DbSql) {
  const rows = await q`with current_counts as (
    select 'da' dataset, count(*)::text available from core.direct_acquisitions
    union all select 'contracts', count(*)::text from core.contracts
    union all select 'ted', count(*)::text from core.ted_notices
  ) select n.dataset, n.available, c.observation->>'available' recorded,
    n.available is not distinct from c.observation->>'available' matches
    from current_counts n left join marts.data_coverage c using(dataset) order by n.dataset`;
  return { check: "coverage_record_counts", passed: rows.length === 3 && rows.every(row => row["matches"] === true),
    scope: "all source record counts compared with the preserved inventory", details: [...rows] };
}
