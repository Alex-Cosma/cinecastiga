import { AGG_MAP_COUNTY_SEAT_COLUMNS, type DbSql } from "@seap/db";

/**
 * Which firm columns of the marts (plan F5 and F6a phase 2, migration 0086)
 * the engine may read. Not wired into runSpec yet.
 *
 * The web is published before the marts are rebuilt, and the deploy migration
 * adds the entity_profile/entity_flags columns empty: they fill at the next
 * nightly marts build (main_cpv_div at the next weekly flag-marts), and
 * registered_year only where an ONRC import exists. A column counts as
 * available once it exists and holds a value; until then the engine keeps its
 * fallback (entity_profile.county for the seat) and the chips that need the
 * column ("Înmatriculate", "același domeniu principal", "Firme din județ")
 * show as disabled, with the reason. The agg_map_county columns appear with
 * the table, which the transactions stage rebuilds every night.
 */
export interface MartColumns {
  /** entity_profile.seat_county + seat_source. */
  seat: boolean;
  /** entity_profile.registered_year. */
  registeredYear: boolean;
  /** entity_flags.main_cpv_div. */
  mainCpvDiv: boolean;
  /** The seat split of agg_map_county (AGG_MAP_COUNTY_SEAT_COLUMNS). */
  mapSeat: boolean;
}

export const NO_MART_COLUMNS: MartColumns = { seat: false, registeredYear: false, mainCpvDiv: false, mapSeat: false };

const PROFILE_COLUMNS = ["seat_county", "seat_source", "registered_year"];
/** A complete answer is kept for the process; a partial one is probed again after 10 minutes. */
const RETRY_MS = 600_000;
const cache = new WeakMap<DbSql, { columns: MartColumns; at: number }>();

export async function martColumns(sql: DbSql): Promise<MartColumns> {
  const hit = cache.get(sql);
  if (hit && (Object.values(hit.columns).every(Boolean) || Date.now() - hit.at < RETRY_MS)) return hit.columns;
  const rows = (await sql`
    select table_name, column_name from information_schema.columns
    where table_schema = 'marts'
      and ((table_name = 'entity_profile' and column_name = any(${sql.array(PROFILE_COLUMNS)}::text[]))
        or (table_name = 'entity_flags' and column_name = 'main_cpv_div')
        or (table_name = 'agg_map_county' and column_name = any(${sql.array([...AGG_MAP_COUNTY_SEAT_COLUMNS])}::text[])))
  `) as unknown as { table_name: string; column_name: string }[];
  const has = (table: string, column: string) => rows.some((r) => r.table_name === table && r.column_name === column);
  const filled = async (query: () => Promise<unknown>) => Boolean(((await query()) as { ok: boolean }[])[0]?.ok);
  const columns: MartColumns = {
    // Supplier rows are written first, so a filled table answers on its first pages.
    seat: has("entity_profile", "seat_county") && has("entity_profile", "seat_source")
      && await filled(() => sql`select exists (select 1 from marts.entity_profile where seat_source is not null) ok`),
    registeredYear: has("entity_profile", "registered_year")
      && await filled(() => sql`select exists (select 1 from marts.entity_profile where registered_year is not null) ok`),
    mainCpvDiv: has("entity_flags", "main_cpv_div")
      && await filled(() => sql`select exists (select 1 from marts.entity_flags where main_cpv_div is not null) ok`),
    mapSeat: AGG_MAP_COUNTY_SEAT_COLUMNS.every((column) => has("agg_map_county", column)),
  };
  cache.set(sql, { columns, at: Date.now() });
  return columns;
}
