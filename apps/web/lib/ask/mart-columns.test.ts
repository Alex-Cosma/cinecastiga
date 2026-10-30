import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGG_MAP_COUNTY_SEAT_COLUMNS, type DbSql } from "@seap/db";
import { forgetMartColumns, martColumns, NO_MART_COLUMNS } from "./mart-columns";

/**
 * SQL tag harness: information_schema answers with `columns`, the exists() probes with
 * `filled` (a column name, or "agg_map_county" for a map split with a known seat).
 */
function database(state: { columns: [string, string][]; filled: string[] }) {
  const statements: string[] = [];
  const tag = ((chunks: TemplateStringsArray) => {
    const text = chunks.join("?");
    statements.push(text);
    if (text.includes("information_schema.columns"))
      return Promise.resolve(state.columns.map(([table_name, column_name]) => ({ table_name, column_name })));
    // The tables are there (a fixture's copy may lack one: mart-columns.integration.test.ts).
    if (text.includes("to_regclass")) return Promise.resolve([{ profile: true, flags: true, map: true }]);
    const probed = text.includes("n_all_unknown < n_all") ? "agg_map_county" : /where (\w+) is not null/.exec(text)?.[1];
    return Promise.resolve([{ ok: probed != null && state.filled.includes(probed) }]);
  }) as unknown as DbSql;
  Object.assign(tag, { array: (values: unknown[]) => values });
  return { sql: tag, statements };
}
const profile: [string, string][] = [["entity_profile", "seat_county"], ["entity_profile", "seat_source"], ["entity_profile", "registered_year"]];
const flags: [string, string][] = [["entity_flags", "main_cpv_div"], ["entity_flags", "log_total_ron"]];
const map: [string, string][] = AGG_MAP_COUNTY_SEAT_COLUMNS.map((column): [string, string] => ["agg_map_county", column]);
const ALL = { seat: true, registeredYear: true, mainCpvDiv: true, mapSeat: true, logTotal: true };

beforeEach(() => { forgetMartColumns(); });
afterEach(() => { vi.useRealTimers(); });

describe("firm columns of the marts (migrations 0085–0086)", () => {
  it("reports nothing before the migrations, without reading the missing columns", async () => {
    const { sql, statements } = database({ columns: [], filled: [] });
    expect(await martColumns(sql)).toEqual(NO_MART_COLUMNS);
    expect(statements).toHaveLength(1);
  });

  it("keeps the fallback while the deployed columns are still empty, then uses them once filled", async () => {
    vi.useFakeTimers();
    const state = { columns: [...profile, ...flags], filled: [] as string[] };
    const { sql, statements } = database(state);
    // After the deploy, before the nightly rebuild: the old agg_map_county, empty columns.
    expect(await martColumns(sql)).toEqual({ ...NO_MART_COLUMNS, logTotal: true });
    // The nightly marts and transactions stages ran; the weekly flag-marts did not.
    state.columns.push(...map);
    state.filled.push("seat_source", "registered_year", "agg_map_county");
    expect(await martColumns(sql)).toEqual({ ...NO_MART_COLUMNS, logTotal: true }); // still cached
    vi.advanceTimersByTime(600_001);
    expect(await martColumns(sql)).toEqual({ ...ALL, mainCpvDiv: false });
    state.filled.push("main_cpv_div");
    vi.advanceTimersByTime(600_001);
    expect(await martColumns(sql)).toEqual(ALL);
    // Complete: never probed again in this process.
    const seen = statements.length;
    vi.advanceTimersByTime(86_400_000);
    await martColumns(sql);
    expect(statements).toHaveLength(seen);
  });

  it("answers from the process cache for another DbSql (a transaction is a new one)", async () => {
    const pool = database({ columns: [...profile, ...flags, ...map], filled: ["seat_source", "registered_year", "main_cpv_div", "agg_map_county"] });
    const tx = database({ columns: [], filled: [] });
    expect(await martColumns(pool.sql)).toEqual(ALL);
    expect(await martColumns(tx.sql)).toEqual(ALL);
    expect(tx.statements).toHaveLength(0);
  });

  it("needs both seat columns and every seat column of the map", async () => {
    const { sql } = database({ columns: [["entity_profile", "seat_county"], ...map.slice(1)], filled: ["seat_source", "agg_map_county"] });
    expect(await martColumns(sql)).toEqual(NO_MART_COLUMNS);
  });

  it("leaves the map split off while every county is unknown (rebuilt before the seats were filled)", async () => {
    const { sql } = database({ columns: [...profile, ...flags, ...map], filled: ["seat_source", "registered_year", "main_cpv_div"] });
    expect(await martColumns(sql)).toEqual({ ...ALL, mapSeat: false });
  });

  it("leaves registered_year off without an ONRC import, the seat still on", async () => {
    const { sql } = database({ columns: [...profile, ...flags, ...map], filled: ["seat_source", "main_cpv_div", "agg_map_county"] });
    expect(await martColumns(sql)).toEqual({ ...ALL, registeredYear: false });
  });
});
