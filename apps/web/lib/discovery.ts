import { createDb, type DbSql } from "@seap/db";

export interface DiscoveryCounty {
  county: string;
  totalRon: number;
  records: number;
}

export interface DiscoverySummary {
  directRecords: number;
  contractRecords: number;
  totalRecords: number;
  totalRon: number;
  yearFrom: string | null;
  yearTo: string | null;
  counties: DiscoveryCounty[];
}

const globalDb = globalThis as unknown as { __seapSql?: DbSql };

/** The discovery links use Ask's positive-value transaction population.
 * These marts apply the same accepted-DA/2-million ceiling and allocate
 * consortium contracts across their suppliers. Legacy award-notice and
 * entity-profile aggregates intentionally retain their existing definitions.
 */
export async function getDiscoverySummary(database?: DbSql): Promise<DiscoverySummary> {
  const sql = database ?? (globalDb.__seapSql ??= createDb().sql);
  const [national, counties, coverage] = await Promise.all([
    sql`select src, v_plaf, n_plaf from marts.agg_national order by src`,
    sql`select county, v_plaf, n_plaf from marts.agg_map_county order by v_plaf desc`,
    sql`select min(y) year_from, max(y) year_to from marts.agg_years
        where y ~ '^[0-9]{4}$' and n_plaf > 0`,
  ]);
  const streams = new Map(national.map((row) => [String(row.src), row]));
  return {
    directRecords: Number(streams.get("da")?.n_plaf ?? 0),
    contractRecords: Number(streams.get("contracts")?.n_plaf ?? 0),
    totalRecords: national.reduce((total, row) => total + Number(row.n_plaf), 0),
    totalRon: national.reduce((total, row) => total + Number(row.v_plaf), 0),
    yearFrom: coverage[0]?.year_from ?? null,
    yearTo: coverage[0]?.year_to ?? null,
    counties: counties.map((row) => ({ county: String(row.county), totalRon: Number(row.v_plaf), records: Number(row.n_plaf) })),
  };
}
