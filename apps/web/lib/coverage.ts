import { collectorCoverage, createDb, type CollectorCoverage, type DbSql } from "@seap/db";
import { unstable_cache } from "next/cache";

export type Dataset = "da" | "contracts" | "ted";
export interface Observation {
  available: string;
  included?: string;
  allocations?: string;
  results?: string;
  missing_date: string;
  /** Contracts dated before the archive start: counted, given no year. */
  implausible_date?: string;
  missing_cpv: string;
  missing_raw?: string;
  missing_currency?: string;
  non_additive_amendments?: string;
  unverified_contract_type?: string;
  framework_publications?: string;
  frameworks_without_identified_calloffs?: string;
  temporarily_excluded_groups?: string;
  temporarily_excluded_financial_groups?: string;
  temporarily_excluded_publications?: string;
  /** Otherwise-included contracts above the value cap, kept out of totals. */
  above_value_cap?: string;
  above_value_cap_value?: string;
  value_cap?: string;
  /** Otherwise-included contracts whose only winner is their own authority (audit F12). */
  winner_is_authority?: string;
  winner_is_authority_value?: string;
  unknown_competition?: string;
  unverified?: string;
  date_from: string | null;
  date_to: string | null;
}
export interface Collection {
  source: string;
  last_success: string | null;
  latest_status: string;
  latest_started: string;
  window_from: string | null;
  window_to: string | null;
  reported: number | null;
  fetched: number;
  deviation: number | null;
}
export interface Coverage {
  observations: { dataset: Dataset; observation: Observation; calculated_at: string }[];
  years: { src: Dataset; year: number; n: string }[];
  /** Continuous collector: the only current record of when sources were collected. */
  collector: CollectorCoverage;
  /** Earlier windowed imports (`core.scrape_runs`); historical, no longer written by the collector. */
  collections: Collection[];
  normalized: { transform: string; updated_at: string }[];
}
const globalDb = globalThis as unknown as { __seapSql?: DbSql };

export async function readCoverage(sql: DbSql): Promise<Coverage> {
  const [observations, collector, collections, normalized] = await Promise.all([
    sql`select dataset, observation, calculated_at::text from marts.data_coverage order by dataset`,
    collectorCoverage(sql),
    // Run times in Bucharest. Windows are decoded as the importers encoded the requested days:
    // SEAP as `T00:00:00+03:00` (scrape/elicitatie), TED as UTC (scrape/ted).
    sql`select distinct on (source) source, status latest_status,
          (started_at at time zone 'Europe/Bucharest')::text latest_started,
          (max(finished_at) filter (where status = 'completed') over (partition by source) at time zone 'Europe/Bucharest')::text last_success,
          ((window_start at time zone 'UTC') + case when source like 'elicitatie:%' then interval '3 hours' else interval '0' end)::text window_from,
          ((window_end at time zone 'UTC') + case when source like 'elicitatie:%' then interval '3 hours' else interval '0' end)::text window_to,
          reported_total reported, fetched_count fetched, deviation
        from core.scrape_runs
        where source in ('elicitatie:das', 'elicitatie:awards', 'ted:can-standard', 'ted:fforms')
        order by source, started_at desc, id desc`,
    sql`select transform, updated_at::text from core.normalize_watermarks order by transform`,
  ]);
  return {
    observations: observations.filter(r => ["da", "contracts", "ted"].includes(r.dataset)
      && r.observation && !Array.isArray(r.observation) && typeof r.observation.available === "string") as unknown as Coverage["observations"],
    years: observations.find(r => r.dataset === "years")?.observation ?? [],
    collector,
    collections: collections as unknown as Collection[],
    normalized: normalized as unknown as Coverage["normalized"],
  };
}

export const getCoverage = unstable_cache(async (): Promise<Coverage | null> => {
  try {
    const result = await readCoverage(globalDb.__seapSql ??= createDb().sql);
    return result.observations.length === 3 ? result : null;
  } catch (error) {
    // Additive deployment: an unmigrated database must not masquerade as zero records.
    if ((error as { code?: string }).code === "42P01") return null;
    throw error;
  }
}, ["data-coverage-v5"], { revalidate: 300 });

/** Date only, as recorded by the source; don't shift source days to browser time zones. */
export function coverageDate(value: string | null | undefined): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "necunoscută";
}
