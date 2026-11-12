import { createDb, type DbSql } from "@seap/db";
import { foldCounty } from "./map";
import { TOUR_TOPICS, type TourData, type TourFigures } from "./tour";

/**
 * The welcome tour's figures: for every county and subject, the last full year's direct awards and contracts.
 * Direct awards, the values and the institutions come from the site's own yearly aggregate
 * (marts.agg_authority_cpv_year); contracts are counted once each from marts.contract_transactions, since the
 * aggregate counts a consortium's contract once per winner. All 42 × 8 rows in two queries (about 0.3 s), kept in
 * memory for six hours; a failed read is not kept.
 */
const g = globalThis as unknown as { __seapTourSql?: DbSql; __seapTour?: { at: number; year: number; data: Promise<TourData> } };
function db(): DbSql {
  if (!g.__seapTourSql) g.__seapTourSql = createDb().sql;
  return g.__seapTourSql;
}

const KEEP_MS = 6 * 60 * 60 * 1000;

/** The last full calendar year. */
export const tourYear = (now: Date): number => now.getUTCFullYear() - 1;

type AggregateRow = { county: string; k: string; da_n: number; da_v: number; ct_v: number; na: number };
type ContractRow = { county: string; k: string; n: number };

export function shapeTourRows(year: number, aggregate: readonly AggregateRow[], contracts: readonly ContractRow[]): TourData {
  const contractCount = new Map(contracts.map((row) => [`${foldCounty(row.county)}|${row.k}`, Number(row.n)]));
  const rows: TourData["rows"] = {};
  for (const row of aggregate) {
    const county = foldCounty(row.county);
    const figures: TourFigures = [Number(row.da_n), Math.round(Number(row.da_v)), contractCount.get(`${county}|${row.k}`) ?? 0, Math.round(Number(row.ct_v)), Number(row.na)];
    (rows[county] ??= {})[row.k] = figures;
  }
  return { year, rows };
}

async function load(year: number): Promise<TourData> {
  const sql = db();
  const cpv2 = TOUR_TOPICS.flatMap((topic) => topic.cpv2), keys = TOUR_TOPICS.flatMap((topic) => topic.cpv2.map(() => topic.key));
  const from = `${year}-01-01`, to = `${year + 1}-01-01`;
  const [aggregate, contracts] = await Promise.all([
    sql<AggregateRow[]>`
      with t(cpv2, k) as (select * from unnest(${cpv2}::text[], ${keys}::text[]))
      select p.county, t.k,
        coalesce(sum(a.n) filter (where a.src = 'da'), 0)::float8 as da_n,
        coalesce(sum(a.v) filter (where a.src = 'da'), 0)::float8 as da_v,
        coalesce(sum(a.v) filter (where a.src = 'contracts'), 0)::float8 as ct_v,
        count(distinct a.authority_id)::int as na
      from marts.agg_authority_cpv_year a
      join t on t.cpv2 = a.cpv2
      join marts.entity_profile p on p.entity_id = a.authority_id and p.role = 'authority'
      where a.y = ${String(year)} and p.county is not null and p.county <> ''
      group by 1, 2`,
    sql<ContractRow[]>`
      with t(cpv2, k) as (select * from unnest(${cpv2}::text[], ${keys}::text[]))
      select c.county, t.k, count(distinct c.contract_id)::int as n
      from marts.contract_transactions c
      join t on t.cpv2 = left(c.cpv_code, 2)
      where c.finalization_date >= ${from} and c.finalization_date < ${to} and c.county is not null and c.county <> ''
      group by 1, 2`,
  ]);
  return shapeTourRows(year, aggregate, contracts);
}

export function getTourData(now = new Date()): Promise<TourData> {
  const year = tourYear(now), kept = g.__seapTour;
  if (kept && kept.year === year && now.getTime() - kept.at < KEEP_MS) return kept.data;
  const data = load(year);
  g.__seapTour = { at: now.getTime(), year, data };
  data.catch(() => { if (g.__seapTour?.data === data) delete g.__seapTour; });
  return data;
}
