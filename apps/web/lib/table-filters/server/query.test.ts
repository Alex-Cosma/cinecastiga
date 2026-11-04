import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { channelWhere, facetOf, normalizedPattern, unionOf, type Channel, type FilterSource } from "./query";
import type { TableColumns } from "../types";

/** A stand-in for postgres.js: fragments keep their text (values as ?) and each awaited query answers `answer(text)`. */
function fakeSql(answer: (query: string) => unknown[] = () => []) {
  const queries: { query: string; values: unknown[] }[] = [];
  class Fragment {
    constructor(public query: string, public values: unknown[] = []) {}
    then(resolve: (rows: unknown[]) => unknown) {
      queries.push(this);
      return Promise.resolve(resolve(answer(this.query)));
    }
  }
  const sql = ((chunks: TemplateStringsArray, ...params: unknown[]) => {
    const values: unknown[] = [];
    const query = chunks.reduce((text, part, i) => {
      if (i >= params.length) return text + part;
      const p = params[i];
      if (p instanceof Fragment) { values.push(...p.values); return text + part + p.query; }
      values.push(p); return text + part + "?";
    }, "");
    return new Fragment(query, values);
  }) as unknown as DbSql;
  Object.assign(sql, { array: (values: unknown[]) => values });
  return { sql, queries };
}

const columns: TableColumns = [
  { key: "data", kind: "dates", label: "Data", chip: "", param: "an" },
  { key: "tip", kind: "options", label: "Tip", chip: "", param: "tip", labels: { a: "tipul a", b: "tipul b", x: "excluse" } },
  { key: "cine", kind: "pick", label: "Cine", chip: "cine", param: "cine" },
  { key: "suma", kind: "range", label: "Suma", chip: "suma", param: "suma" },
];

function source(sql: DbSql): FilterSource {
  const channel = (name: string, extra: Partial<Channel> = {}): Channel => ({
    name,
    from: sql`t_${sql`${name}`}`,
    where: sql`own = ${1}`,
    bindings: {
      data: { kind: "dates", date: sql`d` },
      tip: { kind: "constant", value: name },
      cine: { kind: "list", value: sql`who`, names: { lookup: (v) => sql`select names ${v}`, search: (t) => sql`who_named ${t}` } },
      suma: { kind: "range", value: sql`amount` },
    },
    ...extra,
  });
  return { columns, channels: [channel("a"), channel("b"), channel("x", { optIn: "tip" })] };
}

describe("filters as SQL", () => {
  it("adds one condition per active filter and none for an empty one", () => {
    const { sql } = fakeSql();
    const [a] = source(sql).channels;
    const where = channelWhere(sql, a!, {
      data: { kind: "dates", years: ["2021"], from: null, to: null },
      cine: { kind: "pick", values: [] },
      suma: { kind: "range", min: 10, max: null },
    }) as unknown as { query: string; values: unknown[] };
    expect(where.query).toBe("own = ? and left(d, 4) = any(?::text[]) and amount is not null and amount >= ?::numeric");
    expect(where.values).toEqual([1, ["2021"], 10]);
  });

  it("drops a channel its constant does not match, and reads an opt-in channel only when chosen", () => {
    const { sql } = fakeSql();
    const { channels } = source(sql);
    const names = (state: Parameters<typeof unionOf>[2], except?: string) =>
      ((unionOf(sql, channels, state, () => sql`*`, except) as unknown as { query: string } | null)?.query ?? "").match(/t_\?/g)?.length ?? 0;
    expect(names({})).toBe(2); // a and b, not the excluded x
    expect(names({ tip: { kind: "options", values: ["b"] } })).toBe(1);
    expect(names({ tip: { kind: "options", values: ["x"] } })).toBe(1);
    expect(names({ tip: { kind: "options", values: ["b"] } }, "tip")).toBe(3); // the type funnel counts every channel
    expect(unionOf(sql, channels, { tip: { kind: "options", values: ["z"] } }, () => sql`*`)).toBeNull();
  });

  it("counts a pick column without names, then names only the shown values, the chosen first", async () => {
    const { sql, queries } = fakeSql((q) => q.startsWith("select names") ? [{ v: "7", l: "ROTACO" }] : q.includes("group by v") ? [{ v: "7", l: null, n: 3 }] : []);
    const facet = await facetOf(sql, source(sql), "cine", { cine: { kind: "pick", values: ["9"] } }, { limit: 50 });
    expect(queries[0]!.query).toContain("order by (v = any(?::text[])) desc, count(*) desc");
    expect(queries[0]!.query).not.toContain("own = ? and who = any"); // its own filter is left out
    expect(queries[1]!.values).toEqual([["7", "9"]]);
    expect(facet).toEqual({ kind: "pick", options: [{ value: "7", label: "ROTACO", n: 3 }, { value: "9", label: "9", n: 0 }], more: false });
  });

  it("searches a pick column through its names, inside each channel", async () => {
    const { sql, queries } = fakeSql();
    await facetOf(sql, source(sql), "cine", {}, { term: "rota" });
    expect(queries[0]!.query).toContain("and who_named ?");
    expect(normalizedPattern("Școala  Nr. 5_")).toBe("%scoala nr 5%");
  });

  it("counts the months of a date column and its undated rows", async () => {
    const { sql } = fakeSql(() => [{ m: "2021-02", n: 6 }, { m: null, n: 2 }]);
    expect(await facetOf(sql, source(sql), "data", {})).toEqual({ kind: "dates", months: [{ month: "2021-02", n: 6 }], undated: 2 });
  });

  it("spreads a range column's values over logarithmic bins", async () => {
    const { sql } = fakeSql(() => [{ lo: 10, hi: 100000, bin: 1, n: 4 }, { lo: 10, hi: 100000, bin: 8, n: 1 }]);
    const facet = await facetOf(sql, source(sql), "suma", {});
    expect(facet.kind).toBe("range");
    if (facet.kind !== "range") return;
    expect(facet.bins).toHaveLength(8);
    expect(facet.bins[0]).toMatchObject({ n: 4 });
    expect(facet.bins[0]!.from).toBeCloseTo(10);
    expect(facet.bins[7]!.to).toBeCloseTo(100000);
  });
});
