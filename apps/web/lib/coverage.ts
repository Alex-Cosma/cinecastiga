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
  /** DA and TED: CPV absent from the record itself. */
  missing_cpv?: string;
  /** Contracts (audit F38): records whose award notice, the CPV the totals use, has none. */
  missing_notice_cpv?: string;
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
  /** Included DAs whose recorded supplier is their own authority (audit F12): in the
   * authority's total, never a supplier's. */
  supplier_is_authority?: string;
  supplier_is_authority_value?: string;
  /** Canonical contracts typed by the title rule, without an archived SEAP type (audit F08):
   * all of them, those with a verifiable sum in lei and that sum, those without one
   * (legacy EUR/USD or no amount), and the distinct contracts and value inside the totals. */
  title_classified?: string;
  title_classified_valued?: string;
  title_classified_value?: string;
  title_classified_without_ron_value?: string;
  title_classified_included?: string;
  title_classified_included_value?: string;
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
  /** Newest window a completed import covered (largest window end), with that import's counts
   * (audit F17): the last started import is often an old backfill window. Null without one. */
  completed_window_from: string | null;
  completed_window_to: string | null;
  completed_reported: number | null;
  completed_fetched: number | null;
  completed_deviation: number | null;
}
export interface Coverage {
  observations: { dataset: Dataset; observation: Observation; calculated_at: string }[];
  years: { src: Dataset; year: number; n: string }[];
  /** Continuous collector: when its streams were last collected (audit F17). */
  collector: CollectorCoverage;
  /** Windowed import commands (`core.scrape_runs`), which the collector never writes. They stay the
   * current record for a source the collector has not collected (TED while its stream is off). */
  collections: Collection[];
  normalized: { transform: string; updated_at: string }[];
}
const globalDb = globalThis as unknown as { __seapSql?: DbSql };

export async function readCoverage(sql: DbSql): Promise<Coverage> {
  const [observations, collector, collections, normalized] = await Promise.all([
    sql`select dataset, observation, calculated_at::text from marts.data_coverage order by dataset`,
    collectorCoverage(sql),
    // Run times in Bucharest. Windows are decoded as the importers encoded the requested days:
    // SEAP as `T00:00:00+03:00` (scrape/elicitatie), TED as UTC (scrape/ted). The window shown is
    // the newest one a completed import covered, not the last started import's (audit F17).
    sql`select l.source, l.status latest_status,
          (l.started_at at time zone 'Europe/Bucharest')::text latest_started,
          (s.finished_at at time zone 'Europe/Bucharest')::text last_success,
          ((c.window_start at time zone 'UTC') + case when l.source like 'elicitatie:%' then interval '3 hours' else interval '0' end)::text completed_window_from,
          ((c.window_end at time zone 'UTC') + case when l.source like 'elicitatie:%' then interval '3 hours' else interval '0' end)::text completed_window_to,
          c.reported_total completed_reported, c.fetched_count completed_fetched, c.deviation completed_deviation
        from (select distinct on (source) source, status, started_at from core.scrape_runs
          where source in ('elicitatie:das', 'elicitatie:awards', 'ted:can-standard', 'ted:fforms')
          order by source, started_at desc, id desc) l
        left join lateral (select max(r.finished_at) finished_at from core.scrape_runs r
          where r.source = l.source and r.status = 'completed') s on true
        left join lateral (select r.window_start, r.window_end, r.reported_total, r.fetched_count, r.deviation
          from core.scrape_runs r where r.source = l.source and r.status = 'completed' and r.window_end is not null
          order by r.window_end desc, r.finished_at desc nulls last, r.id desc limit 1) c on true
        order by l.source`,
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
}, ["data-coverage-v7"], { revalidate: 300 });

/** Date only, as recorded by the source; don't shift source days to browser time zones. */
export function coverageDate(value: string | null | undefined): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "necunoscută";
}
