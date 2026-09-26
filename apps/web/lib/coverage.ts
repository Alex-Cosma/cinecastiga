import { createDb, type DbSql } from "@seap/db";
import { unstable_cache } from "next/cache";

export type Dataset = "da" | "contracts" | "ted";
export interface Observation {
  available: string;
  included?: string;
  allocations?: string;
  results?: string;
  missing_date: string;
  missing_cpv: string;
  missing_raw?: string;
  missing_currency?: string;
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
  collections: Collection[];
  normalized: { transform: string; updated_at: string }[];
}
const globalDb = globalThis as unknown as { __seapSql?: DbSql };

export async function readCoverage(sql: DbSql): Promise<Coverage> {
  const [observations, collections, normalized] = await Promise.all([
    sql`select dataset, observation, calculated_at::text from marts.data_coverage order by dataset`,
    sql`select distinct on (source) source, status latest_status, started_at::text latest_started,
          max(finished_at) filter (where status = 'completed') over (partition by source)::text last_success,
          window_start::text window_from, window_end::text window_to,
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
}, ["data-coverage-v2"], { revalidate: 300 });

/** Date only, as recorded by the source; don't shift source days to browser time zones. */
export function coverageDate(value: string | null | undefined): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "necunoscută";
}
