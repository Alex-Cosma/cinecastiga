import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { runSpec, TABLE_PAGE_SIZE, type TableOpts } from "./compile";
import type { AskSpec } from "./spec";

// Regression (review of C1, 24 Oct 2026): the total of a paged ranking was a
// second statement, count(distinct id) over the whole selection, 5–8 s on the
// national supplier ranking (slower still on custom plans). The ranking's own
// count(*) over () window counts the same groups before LIMIT/OFFSET.

/** SQL tag harness: the ranking returns `ranked`, a separate count returns 37. */
function database(ranked: Record<string, string>[]) {
  const statements: string[] = [];
  class Fragment {
    constructor(public text: string) {}
    then(resolve: (value: unknown[]) => unknown) {
      statements.push(this.text);
      if (this.text.includes("marts.national_stats")) return Promise.resolve(resolve([{ year: 2025 }, { year: 2026 }]));
      if (this.text.includes("count(distinct")) return Promise.resolve(resolve([{ t: "37" }]));
      if (this.text.includes("count(*) over ()")) return Promise.resolve(resolve(ranked));
      return Promise.resolve(resolve([]));
    }
  }
  const tag = ((chunks: TemplateStringsArray | string, ...params: unknown[]) => typeof chunks === "string" ? new Fragment(chunks) : new Fragment(chunks.reduce((query, text, i) => {
    if (i >= params.length) return query + text;
    const value = params[i];
    return query + text + (value instanceof Fragment ? value.text : "?");
  }, ""))) as unknown as DbSql;
  Object.assign(tag, {
    array: () => new Fragment("?"),
    begin: async (_options: string, fn: (tx: DbSql) => Promise<unknown>) => fn(tag),
    unsafe: async () => [],
  });
  return { sql: tag, statements };
}

const row = { id: "10", nm: "Furnizor", co: "Cluj", c: "Cluj", v: "100", n: "2", tv: "1000", tn: "20", te: "23", pop: "1000" };
/** Paged mode: a clasament without topN, on every ranking path. */
const RANKINGS: [string, AskSpec, Omit<TableOpts, "page">][] = [
  ["firme după valoare", { block: "table", dataset: "all", dim: "supplier", measure: "value", filters: {} }, {}],
  ["instituții după număr", { block: "table", dataset: "all", dim: "authority", measure: "count", filters: { yearFrom: 2025 } }, {}],
  ["firme după nume", { block: "table", dataset: "all", dim: "supplier", measure: "value", filters: {} }, { sort: "name", dir: "asc" }],
  ["firme după județ", { block: "table", dataset: "da", dim: "supplier", measure: "value", filters: { yearFrom: 2025 } }, { sort: "county", dir: "desc" }],
  ["județe", { block: "table", dataset: "all", dim: "county", measure: "value", filters: {} }, {}],
  ["pe locuitor", { block: "table", dataset: "all", dim: "authority", measure: "value_per_capita", filters: {} }, {}],
];
const table = async (sql: DbSql, spec: AskSpec, opts: Omit<TableOpts, "page">, page: number) => {
  const result = await runSpec(sql, spec, {}, { ...opts, page });
  if ("error" in result || result.data.block !== "table") throw new Error(JSON.stringify(result));
  return result.data;
};

describe("paged ranking total", () => {
  it.each(RANKINGS)("%s: one ranking statement carries the total", async (_label, spec, opts) => {
    const db = database([row]);
    const data = await table(db.sql, spec, opts, 2);
    expect(data).toMatchObject({ total: 23, page: 2, pageSize: TABLE_PAGE_SIZE });
    expect(db.statements.filter((s) => s.includes("count(distinct"))).toEqual([]);
    expect(db.statements.filter((s) => s.includes("count(*) over ()"))).toHaveLength(1);
  });

  it.each(RANKINGS)("%s: a page past the end still states the total", async (_label, spec, opts) => {
    const db = database([]);
    const data = await table(db.sql, spec, opts, 9);
    expect(data).toMatchObject({ rows: [], total: 37, page: 9 });
    expect(db.statements.filter((s) => s.includes("count(distinct"))).toHaveLength(1);
  });

  it.each(RANKINGS)("%s: an empty first page is 0 without a count", async (_label, spec, opts) => {
    const db = database([]);
    expect(await table(db.sql, spec, opts, 0)).toMatchObject({ rows: [], total: 0, page: 0 });
    expect(db.statements.filter((s) => s.includes("count(distinct"))).toEqual([]);
  });

  it("a top-N table has no paged total", async () => {
    const db = database([row]);
    const data = await table(db.sql, { block: "table", dataset: "all", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: 2025 } }, {}, 0);
    expect(data.total).toBeUndefined();
    expect(db.statements.filter((s) => s.includes("count(distinct"))).toEqual([]);
  });
});
