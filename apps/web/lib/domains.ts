import { createDb, type DbSql } from "@seap/db";
import { unstable_cache } from "next/cache";
import { buildDomainDataset, defaultDomainYear, type DomainAggregate, type DomainCatalogueEntry, type DomainDataset } from "./domains-shared";

const globalDb = globalThis as unknown as { __seapSql?: DbSql };
const database = () => globalDb.__seapSql ??= createDb().sql;
const REVALIDATE_SECONDS = 3600;

export class DomainYearError extends Error {
  constructor(public readonly years: number[]) { super("Anul ales nu este disponibil. Alege unul dintre anii din listă."); }
}

/** Restrict the selector to Ask's supported coverage so source drill-down does
 * not silently clamp historical outliers to a different year. */
export async function readDomainYears(sql: DbSql): Promise<number[]> {
  const rows = await sql`
    select y::int as covered_year from marts.agg_years
    where y ~ '^[0-9]{4}$' and n_plaf > 0
      and y::int between
        coalesce((select min(year) from marts.national_stats where kind in ('da','award')), 2018)
        and coalesce((select max(year) from marts.national_stats where kind in ('da','award')), 2026)
    order by y desc
  `;
  return rows.map((row) => Number(row.covered_year));
}

/** Full-code rows fit well below Next's 2 MB per-entry cache limit. The larger
 * navigable tree and repeated source URLs are never stored in that cache. */
export async function readDomainAggregates(sql: DbSql, year: number): Promise<{ rows: DomainAggregate[]; generatedAt: string }> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new DomainYearError([]);
  const rows = await sql.begin("read only", async (q) => {
    await q`set local statement_timeout = '20s'`;
    // Match the production SSD cost setting. Existing covering CPV indexes can
    // satisfy this projection without reading each wide transaction row.
    await q`set local random_page_cost = 1.1`;
    return q`
      select code, sum(n)::text n, sum(v)::text v from (
        select cpv_code code, count(*) n, sum(closing_value) v
        from marts.da_transactions
        where finalization_date >= ${String(year)} and finalization_date < ${String(year + 1)}
          and closing_value > 0 and closing_value <= 2000000 and cpv_code is not null
        group by cpv_code
        union all
        select cpv_code code, count(*) n, sum(closing_value) v
        from marts.contract_transactions
        where finalization_date >= ${String(year)} and finalization_date < ${String(year + 1)}
          and closing_value > 0 and cpv_code is not null
        group by cpv_code
      ) channels group by code order by code
    `;
  });
  return { rows: rows.map((row) => ({ code: String(row.code), count: Number(row.n), valueExact: String(row.v) })), generatedAt: new Date().toISOString() };
}

export async function readDomainCatalogue(sql: DbSql): Promise<DomainCatalogueEntry[]> {
  const rows = await sql`select code, name_ro from core.cpv_codes order by code`;
  return rows.map((row) => ({ code: String(row.code), name: String(row.name_ro) }));
}

const cachedYears = unstable_cache(() => readDomainYears(database()), ["domains-years-v1"], { revalidate: REVALIDATE_SECONDS, tags: ["domains"] });
const cachedCatalogue = unstable_cache(() => readDomainCatalogue(database()), ["domains-catalogue-v1"], { revalidate: REVALIDATE_SECONDS, tags: ["domains"] });
const cachedAggregates = unstable_cache((year: number) => readDomainAggregates(database(), year), ["domains-annual-aggregates-v1"], { revalidate: REVALIDATE_SECONDS, tags: ["domains"] });

// Coalesce concurrent cold requests before they reach PostgreSQL. Completed
// promises are discarded; Next owns expiry/revalidation and persistent storage.
const pending = new Map<number, Promise<DomainDataset>>();

export async function getDomainDataset(requestedYear?: number, sql?: DbSql): Promise<DomainDataset> {
  const years = await (sql ? readDomainYears(sql) : cachedYears());
  const year = requestedYear ?? defaultDomainYear(years);
  if (year === undefined || !years.includes(year)) throw new DomainYearError(years);
  if (!sql) {
    const hit = pending.get(year);
    if (hit) return hit;
  }
  const load = async () => {
    const [aggregates, catalogue] = await Promise.all([
      sql ? readDomainAggregates(sql, year) : cachedAggregates(year),
      sql ? readDomainCatalogue(sql) : cachedCatalogue(),
    ]);
    return buildDomainDataset(aggregates.rows, catalogue, { year, years, generatedAt: aggregates.generatedAt });
  };
  if (sql) return load();
  const result = load().finally(() => pending.delete(year));
  pending.set(year, result);
  return result;
}
