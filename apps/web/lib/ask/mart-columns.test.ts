import { afterEach, describe, expect, it, vi } from "vitest";
import { AGG_MAP_COUNTY_SEAT_COLUMNS, type DbSql } from "@seap/db";
import { martColumns, NO_MART_COLUMNS } from "./mart-columns";

/** SQL tag harness: information_schema answers with `columns`, the exists() probes with `filled`. */
function database(state: { columns: [string, string][]; filled: string[] }) {
  const statements: string[] = [];
  const tag = ((chunks: TemplateStringsArray) => {
    const text = chunks.join("?");
    statements.push(text);
    if (text.includes("information_schema.columns"))
      return Promise.resolve(state.columns.map(([table_name, column_name]) => ({ table_name, column_name })));
    const column = /where (\w+) is not null/.exec(text)?.[1];
    return Promise.resolve([{ ok: column != null && state.filled.includes(column) }]);
  }) as unknown as DbSql;
  Object.assign(tag, { array: (values: unknown[]) => values });
  return { sql: tag, statements };
}
const profile: [string, string][] = [["entity_profile", "seat_county"], ["entity_profile", "seat_source"], ["entity_profile", "registered_year"]];
const flags: [string, string][] = [["entity_flags", "main_cpv_div"]];
const map: [string, string][] = AGG_MAP_COUNTY_SEAT_COLUMNS.map((column) => ["agg_map_county", column]);

afterEach(() => { vi.useRealTimers(); });

describe("firm columns of the marts (migration 0086)", () => {
  it("reports nothing before the migration, without reading the missing columns", async () => {
    const { sql, statements } = database({ columns: [], filled: [] });
    expect(await martColumns(sql)).toEqual(NO_MART_COLUMNS);
    expect(statements).toHaveLength(1);
  });

  it("keeps the fallback while the deployed columns are still empty, then uses them once filled", async () => {
    vi.useFakeTimers();
    const state = { columns: [...profile, ...flags], filled: [] as string[] };
    const { sql, statements } = database(state);
    // After the deploy, before the nightly rebuild: the old agg_map_county, empty columns.
    expect(await martColumns(sql)).toEqual(NO_MART_COLUMNS);
    // The nightly marts and transactions stages ran; the weekly flag-marts did not.
    state.columns.push(...map);
    state.filled.push("seat_source", "registered_year");
    expect(await martColumns(sql)).toEqual(NO_MART_COLUMNS); // still cached
    vi.advanceTimersByTime(600_001);
    expect(await martColumns(sql)).toEqual({ seat: true, registeredYear: true, mainCpvDiv: false, mapSeat: true });
    state.filled.push("main_cpv_div");
    vi.advanceTimersByTime(600_001);
    expect(await martColumns(sql)).toEqual({ seat: true, registeredYear: true, mainCpvDiv: true, mapSeat: true });
    // Complete: never probed again in this process.
    const seen = statements.length;
    vi.advanceTimersByTime(86_400_000);
    await martColumns(sql);
    expect(statements).toHaveLength(seen);
  });

  it("needs both seat columns and every seat column of the map", async () => {
    const { sql } = database({ columns: [["entity_profile", "seat_county"], ...map.slice(1)], filled: ["seat_source"] });
    expect(await martColumns(sql)).toEqual(NO_MART_COLUMNS);
  });

  it("leaves registered_year off without an ONRC import, the seat still on", async () => {
    const { sql } = database({ columns: [...profile, ...flags, ...map], filled: ["seat_source", "main_cpv_div"] });
    expect(await martColumns(sql)).toEqual({ seat: true, registeredYear: false, mainCpvDiv: true, mapSeat: true });
  });
});
