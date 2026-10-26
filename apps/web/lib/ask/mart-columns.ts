import { AGG_MAP_COUNTY_SEAT_COLUMNS, type DbSql } from "@seap/db";

/**
 * Which columns and tables of the marts (plan F5 and F6a phase 2,
 * migrations 0085–0086) the engine may read. runSpec reads logTotal (the
 * scatter's density layer); the others wait for the filters that need them.
 *
 * The web is published before the marts are rebuilt, and the deploy migration
 * adds the entity_profile/entity_flags columns empty: they fill at the next
 * nightly marts build (main_cpv_div at the next weekly flag-marts), and
 * registered_year only where an ONRC import exists. A column counts as
 * available once it exists and holds a value; until then the engine keeps its
 * fallback (entity_profile.county for the seat) and the chips that need the
 * column ("Înmatriculate", "același domeniu principal", "Firme din județ")
 * show as disabled, with the reason. The agg_map_county columns appear with
 * the table, which the transactions stage rebuilds every night; they count
 * once a county has a firm with a known seat, so a table rebuilt before the
 * seats were filled (a manual flags run between the deploy and the first
 * marts build) does not show every county as 100% unknown.
 */
export interface MartColumns {
  /** entity_profile.seat_county + seat_source. */
  seat: boolean;
  /** entity_profile.registered_year. */
  registeredYear: boolean;
  /** entity_flags.main_cpv_div. */
  mainCpvDiv: boolean;
  /** The seat split of agg_map_county (AGG_MAP_COUNTY_SEAT_COLUMNS), built from filled seats. */
  mapSeat: boolean;
  /** entity_flags.log_total_ron (0085, generated: present means filled). */
  logTotal: boolean;
  /** marts.agg_map_county_top, the county card of the unfiltered maps (built with agg_map_county). */
  mapTop: boolean;
}

export const NO_MART_COLUMNS: MartColumns = { seat: false, registeredYear: false, mainCpvDiv: false, mapSeat: false, logTotal: false, mapTop: false };

const PROFILE_COLUMNS = ["seat_county", "seat_source", "registered_year"];
const FLAG_COLUMNS = ["main_cpv_div", "log_total_ron"];
/** A complete answer is kept for the process; a partial one is probed again after 10 minutes. */
const RETRY_MS = 600_000;
/**
 * One database per process, so one cache: not per DbSql, since postgres.js
 * makes a new one for every transaction. Call it with the pool, before
 * sql.begin; inside a transaction it still answers, without a new probe.
 */
let cached: { columns: MartColumns; at: number } | null = null;

export async function martColumns(sql: DbSql): Promise<MartColumns> {
  if (cached && (Object.values(cached.columns).every(Boolean) || Date.now() - cached.at < RETRY_MS)) return cached.columns;
  const rows = (await sql`
    select table_name, column_name from information_schema.columns
    where table_schema = 'marts'
      and ((table_name = 'entity_profile' and column_name = any(${sql.array(PROFILE_COLUMNS)}::text[]))
        or (table_name = 'entity_flags' and column_name = any(${sql.array(FLAG_COLUMNS)}::text[]))
        or (table_name = 'agg_map_county' and column_name = any(${sql.array([...AGG_MAP_COUNTY_SEAT_COLUMNS])}::text[]))
        or (table_name = 'agg_map_county_top' and column_name = 'top_record_id'))
  `) as unknown as { table_name: string; column_name: string }[];
  // The tables themselves too: a caller may read another copy of the marts than information_schema describes (a test
  // fixture's, which rewrites marts. in the text), and a missing one has nothing filled.
  const [tables] = rows.length ? (await sql`select to_regclass('marts.entity_profile') is not null profile,
    to_regclass('marts.entity_flags') is not null flags, to_regclass('marts.agg_map_county') is not null map`) as unknown as { profile: boolean; flags: boolean; map: boolean }[] : [];
  const has = (table: string, column: string) => rows.some((r) => r.table_name === table && r.column_name === column)
    && (table === "entity_profile" ? tables?.profile : table === "entity_flags" ? tables?.flags : table === "agg_map_county" ? tables?.map : true) !== false;
  const filled = async (query: () => Promise<unknown>) => Boolean(((await query()) as { ok: boolean }[])[0]?.ok);
  const columns: MartColumns = {
    // Supplier rows are written first, so a filled table answers on its first pages.
    seat: has("entity_profile", "seat_county") && has("entity_profile", "seat_source")
      && await filled(() => sql`select exists (select 1 from marts.entity_profile where seat_source is not null) ok`),
    registeredYear: has("entity_profile", "registered_year")
      && await filled(() => sql`select exists (select 1 from marts.entity_profile where registered_year is not null) ok`),
    mainCpvDiv: has("entity_flags", "main_cpv_div")
      && await filled(() => sql`select exists (select 1 from marts.entity_flags where main_cpv_div is not null) ok`),
    mapSeat: AGG_MAP_COUNTY_SEAT_COLUMNS.every((column) => has("agg_map_county", column))
      && await filled(() => sql`select exists (select 1 from marts.agg_map_county where n_all_unknown < n_all) ok`),
    logTotal: has("entity_flags", "log_total_ron"),
    mapTop: has("agg_map_county_top", "top_record_id"),
  };
  cached = { columns, at: Date.now() };
  return columns;
}

/** Tests only: forget the probe, so the next call reads the database. */
export function forgetMartColumns(): void { cached = null; }
