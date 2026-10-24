import { beforeEach, describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { DATA_CHANGED, runRows, runSpec, useSnapshotCoverage } from "./compile";
import { forgetRollupsReady } from "./rollups";
import { autoMonthsUnresolved } from "./months-window";
import { validateSpec, type AskSpec } from "./spec";

// F2 (plan §2.8, §4.7): the trend's lenses in the engine, without a database. A
// tag harness answers the coverage and checkpoint reads and records every
// statement with its parameters; the rows of the answer are not the point here.

type Coverage = { dataset: string; date_from: string; date_to: string; complete_until?: string | null }[];
function database(coverage: Coverage, opts: { rollups?: boolean; members?: string[] } = {}) {
  const statements: { text: string; values: unknown[] }[] = [];
  class Fragment {
    constructor(public text: string, public values: unknown[]) {}
    then(resolve: (value: unknown[]) => unknown) {
      const text = this.text;
      statements.push({ text, values: this.values });
      if (text.includes("to_regclass('marts.agg_entity_year')")) return Promise.resolve(resolve([{ ok: opts.rollups ?? false }]));
      if (text.includes("to_regclass('marts.data_coverage')")) return Promise.resolve(resolve([{ ok: true, refreshes: true }]));
      if (text.includes("from app.monitoring_refreshes")) return Promise.resolve(resolve([{ id: "checkpoint-12" }]));
      if (text.includes("from marts.data_coverage")) return Promise.resolve(resolve(coverage));
      if (text.includes("marts.national_stats")) return Promise.resolve(resolve([2019, 2024, 2025, 2026].map((year) => ({ year }))));
      if (/select \S+::text m from/.test(text)) return Promise.resolve(resolve((opts.members ?? []).map((m) => ({ m }))));
      return Promise.resolve(resolve([]));
    }
  }
  const tag = ((chunks: TemplateStringsArray | string, ...params: unknown[]) => {
    if (typeof chunks === "string") return new Fragment(chunks, []);
    const values: unknown[] = [];
    const text = chunks.reduce((query, part, i) => {
      if (i >= params.length) return query + part;
      const value = params[i];
      if (value instanceof Fragment) { values.push(...value.values); return query + part + value.text; }
      values.push(value);
      return query + part + "?";
    }, "");
    return new Fragment(text.replace(/\s+/g, " "), values);
  }) as unknown as DbSql;
  Object.assign(tag, {
    array: (items: unknown[]) => new Fragment("?array", [items]),
    begin: async (_options: string, fn: (tx: DbSql) => Promise<unknown>) => fn(tag),
    unsafe: async () => [],
  });
  return { sql: useSnapshotCoverage(tag), statements };
}

/** Local copy: no "complet până la" day. Production-like: both channels complete through 31 May 2026. */
const LOCAL: Coverage = [
  { dataset: "da", date_from: "2018-04-02", date_to: "2026-09-25" },
  { dataset: "contracts", date_from: "2000-01-06", date_to: "2026-09-25" },
];
const PROD: Coverage = [
  { dataset: "da", date_from: "2018-04-02", date_to: "2026-10-20", complete_until: "2026-05-31" },
  { dataset: "contracts", date_from: "2018-01-03", date_to: "2026-10-20", complete_until: "2026-06-30" },
];
const trend = (options?: AskSpec["trend"], filters: AskSpec["filters"] = { yearFrom: 2025, yearTo: 2026 }): AskSpec => {
  const spec = validateSpec({ block: "trend", dim: "supplier", measure: "value", topN: 10, filters, ...(options ? { trend: options } : {}) });
  if ("error" in spec) throw new Error(spec.error);
  return spec;
};
const grouped = (statements: { text: string; values: unknown[] }[]) => statements.filter((s) => s.text.includes("group by d.supplier_id"));

beforeEach(() => forgetRollupsReady());

describe("the trend's answer with its lenses", () => {
  it("keeps today's answer, shape and query without trend options", async () => {
    const db = database(PROD);
    const result = await runSpec(db.sql, trend(), {});
    if ("error" in result) throw new Error(result.error);
    expect(result.data).toEqual({ block: "trend", yearA: 2025, yearB: 2026, rowsTrend: [] });
    expect(result.executed).toBeUndefined();
    const [query] = grouped(db.statements);
    expect(query!.text).not.toContain("having");
    expect(query!.text).toContain("order by abs(");
    expect(query!.text).not.toContain("substr(d.finalization_date,6,2)");
    expect(result.displaySql).toContain("order by abs(dupa - inainte) desc");
    // Empty options (accepted since F0a as today's answer) keep today's shape too.
    const empty = await runSpec(database(PROD).sql, trend({}), {});
    if ("error" in empty) throw new Error(empty.error);
    expect(empty.data).toEqual(result.data);
  });

  it("resolves `auto` to the months both channels have complete, keeps `auto` in the spec and returns the executed window", async () => {
    const db = database(PROD);
    const spec = trend({ change: "up", months: "auto" });
    const result = await runSpec(db.sql, spec, {});
    if ("error" in result) throw new Error(result.error);
    expect(spec.trend).toEqual({ change: "up", months: "auto" });
    expect(result.executed).toEqual({ months: [1, 5], mode: "auto", checkpoint: "checkpoint-12" });
    expect(result.data).toMatchObject({ block: "trend", change: "up", months: { from: 1, to: 5, mode: "auto" } });
    expect(result.caveats).toContain("Ambii ani se compară pe aceleași luni: ian.–mai.");
    const [query] = grouped(db.statements);
    expect(query!.text).toContain("substr(d.finalization_date,6,2) between ? and ?");
    expect(query!.values).toEqual(expect.arrayContaining(["01", "05"]));
    expect(query!.text).toMatch(/having .* > 0 and .* > /);
    expect(result.displaySql).toContain("luna between '01' and '05'");
    expect(result.displaySql).toContain("having inainte > 0 and dupa > inainte  -- Creșteri");
  });

  it("compares whole years when the later year is complete, and says nothing of months", async () => {
    const result = await runSpec(database(PROD).sql, trend({ change: "down", months: "auto" }, { yearFrom: 2024, yearTo: 2025 }), {});
    if ("error" in result) throw new Error(result.error);
    expect(result.executed).toEqual({ months: [1, 12], mode: "auto", checkpoint: "checkpoint-12" });
    expect(result.caveats.join(" ")).not.toContain("aceleași luni");
  });

  it("refuses `auto` on a current year whose complete months are not established, before any marts read", async () => {
    const db = database(LOCAL);
    expect(await runSpec(db.sql, trend({ change: "up", months: "auto" }), {})).toMatchObject({ error: autoMonthsUnresolved(2026) });
    expect(grouped(db.statements)).toEqual([]);
    // Chosen months need no "complet până la" day.
    const chosen = await runSpec(database(LOCAL).sql, trend({ months: [1, 6] }), {});
    if ("error" in chosen) throw new Error(chosen.error);
    expect(chosen.executed).toEqual({ months: [1, 6], mode: "chosen", checkpoint: "checkpoint-12" });
  });

  it("lists each group in its own order, the percent from its base, the new ones of their first year", async () => {
    const order = async (options: AskSpec["trend"]) => {
      const db = database(PROD);
      const result = await runSpec(db.sql, trend(options, { yearFrom: 2024, yearTo: 2025 }), {});
      if ("error" in result) throw new Error(result.error);
      return grouped(db.statements)[0]!;
    };
    expect((await order({ change: "new" })).text).toMatch(/having coalesce\(.*\) = 0 and coalesce\(.*\) > 0 order by coalesce/);
    const percent = await order({ change: "up", order: "percent", minBase: 100_000 });
    expect(percent.text).toMatch(/ \/ coalesce\(.*\) desc, d\.supplier_id/);
    expect(percent.values).toContain(100_000);
    const first = await order({ change: "new", firstOnly: true });
    expect(first.text).toContain("substr(ep.first_activity, 1, 4) = ?");
    expect(first.values).toContain("2025");
  });
});

describe("the trend's sources", () => {
  it("answer 409 when the answer's months are no longer the data's, before any query of the records", async () => {
    const db = database(PROD);
    const spec = trend({ change: "up", months: "auto" });
    expect(await runRows(db.sql, spec, {}, 0, { months: [1, 4] })).toEqual({ error: DATA_CHANGED, conflict: true });
    expect(db.statements.some((s) => s.text.includes("marts.da_transactions"))).toBe(false);
    // Whole years: the window of a trend without months.
    expect(await runRows(database(PROD).sql, trend(), {}, 0, { months: [1, 5] })).toEqual({ error: DATA_CHANGED, conflict: true });
    expect(await runRows(database(PROD).sql, { block: "stat", measure: "value", filters: {} }, {}, 0, { months: [1, 5] }))
      .toEqual({ error: "Lunile comparate se aplică doar schimbării între doi ani." });
  });

  it("list the executed months, or this checkpoint's when the caller sends none", async () => {
    for (const months of [[1, 5] as const, undefined]) {
      const db = database(PROD);
      const result = await runRows(db.sql, trend({ months: "auto" }), {}, 0, months ? { months } : {});
      if ("error" in result) throw new Error(result.error);
      expect(result.scopeNotes).toContain("Ambii ani se compară pe aceleași luni: ian.–mai; sursele includ numai aceste luni.");
      const totals = db.statements.find((s) => s.text.includes("group by d.state"))!;
      expect(totals.text).toContain("substr(d.finalization_date,6,2) between ? and ?");
    }
  });

  it("read a group's members over the answer's selection, then list their records", async () => {
    const db = database(PROD, { members: ["11", "12", "13"] });
    const result = await runRows(db.sql, trend({ change: "gone" }, { yearFrom: 2024, yearTo: 2025 }), {}, 0);
    if ("error" in result) throw new Error(result.error);
    const members = db.statements.find((s) => /select d\.supplier_id::text m from/.test(s.text))!;
    expect(members.text).toMatch(/group by d\.supplier_id having .* > 0 and .* = 0/);
    const totals = db.statements.find((s) => s.text.includes("group by d.state"))!;
    expect(totals.text).toContain("d.supplier_id = any(?array::bigint[])");
    expect(totals.values).toContainEqual(["11", "12", "13"]);
    expect(result.scopeNotes).toContain("Sursele grupului „Nu mai apar”: 3 firme, cu înregistrările lor din cei doi ani, nu doar cele afișate.");
  });

  it("check only a row's own ids for its records (Înregistrări →), and read no members for every change", async () => {
    const db = database(PROD, { members: ["11"] });
    await runRows(db.sql, trend({ change: "up" }, { yearFrom: 2024, yearTo: 2025 }), {}, 0, { scope: { entityIds: ["11"], role: "supplier" } });
    const members = db.statements.find((s) => /::text m from/.test(s.text))!;
    expect(members.text).toContain("d.supplier_id = any(?array::bigint[])");
    expect(members.values).toContainEqual(["11"]);
    const every = database(PROD);
    await runRows(every.sql, trend({ change: "all", months: "whole" }, { yearFrom: 2024, yearTo: 2025 }), {}, 0);
    expect(every.statements.some((s) => /::text m from/.test(s.text))).toBe(false);
  });
});
