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
/** Rows the harness answers: the partition statement, the row facts and the profiles of the shown entities (trend-partition.ts). */
interface Answers { partition?: Record<string, unknown>[]; facts?: Record<string, unknown>[]; profiles?: Record<string, unknown>[] }
function database(coverage: Coverage, opts: { rollups?: boolean; members?: string[] } & Answers = {}) {
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
      if (text.includes("marts.national_stats")) return Promise.resolve(resolve([2018, 2019, 2024, 2025, 2026].map((year) => ({ year }))));
      if (/select \S+::text m from/.test(text)) return Promise.resolve(resolve((opts.members ?? []).map((m) => ({ m }))));
      if (text.includes("with k as materialized")) return Promise.resolve(resolve(opts.partition ?? []));
      if (text.includes("with x as materialized")) return Promise.resolve(resolve(opts.facts ?? []));
      if (text.includes("from marts.entity_profile ep left join core.entities e")) return Promise.resolve(resolve(opts.profiles ?? []));
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
/** The lists of a partition with no rows, as the engine returns them. */
const NO_LISTS = { all: [], up: [], new: [], first: [], down: [], gone: [] };

beforeEach(() => forgetRollupsReady());

describe("the trend's answer with its lenses", () => {
  it("lists every change without trend options, as before, beside the partition of trend-2", async () => {
    const db = database(PROD);
    const result = await runSpec(db.sql, trend(), {});
    if ("error" in result) throw new Error(result.error);
    expect(result.data).toEqual({
      block: "trend", yearA: 2025, yearB: 2026, rowsTrend: [], list: "all", change: "all", months: { from: 1, to: 12, mode: "whole" },
      groups: NO_LISTS, composition: {}, noun: "firme", rowFacts: {},
    });
    expect(result.executed).toBeUndefined();
    // One statement: grouped once (the slim union: names come from the profiles), then every list and total.
    const [query, ...others] = grouped(db.statements);
    expect(others).toEqual([]);
    expect(query!.text).toMatch(/^ ?with k as materialized \( select d\.supplier_id id, coalesce/);
    expect(query!.text).not.toContain("supplier_name");
    expect(query!.text).not.toContain("having");
    expect(query!.text).toContain("from k order by abs(k.vb - k.va) desc, k.id limit ?");
    expect(query!.text).not.toContain("substr(d.finalization_date,6,2)");
    expect(query!.values.filter((v) => typeof v === "string" && v.startsWith("sum:"))).toEqual(["sum:all", "sum:up", "sum:new", "sum:first", "sum:down", "sum:gone", "sum:equal"]);
    expect(result.displaySql).toContain("order by abs(dupa - inainte) desc");
    // Empty options (accepted since F0a as today's answer) answer the same.
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
    expect(query!.text).toContain("from k where k.va > 0 and k.vb > k.va order by k.vb - k.va desc, k.id limit ?");
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

  it("lists each group in its own order, the growths in percent from their base, the new ones of their first year", async () => {
    const statement = async (options: AskSpec["trend"]) => {
      const db = database(PROD);
      const result = await runSpec(db.sql, trend(options, { yearFrom: 2024, yearTo: 2025 }), {});
      if ("error" in result) throw new Error(result.error);
      return grouped(db.statements)[0]!;
    };
    // Every list, whatever the chosen group: the buttons switch without a query.
    const lists = await statement({ change: "new" });
    for (const list of [
      "from k where k.va > 0 and k.vb > k.va order by k.vb - k.va desc, k.id",
      "from k where k.va = 0 and k.vb > 0 order by k.vb desc, k.id",
      "from k where k.vb > 0 and k.vb < k.va order by k.va - k.vb desc, k.id",
      "from k where k.va > 0 and k.vb = 0 order by k.va desc, k.id",
    ]) expect(lists.text).toContain(list);
    expect(lists.text).toContain("k.va = 0 and k.vb > 0 and k.id in ( select ep.entity_id from marts.entity_profile ep where ep.role = ? and substr(ep.first_activity, 1, 4) = ? )");
    expect(lists.values).toContain("2025");
    expect(lists.values).not.toContain("sum:eligible");
    // The order in percent ranks the growths from the base; the composition counts every growth, and the eligible ones apart.
    const percent = await statement({ change: "up", order: "percent", minBase: 100_000 });
    expect(percent.text).toContain("from k where k.va > 0 and k.vb > k.va and k.va >= ? order by k.vb / k.va desc, k.id");
    expect(percent.values).toContain(100_000);
    expect(percent.values).toContain("sum:eligible");
  });

  it("answers the chosen list with the entity's own name and county, every list, the composition and the facts of every shown row", async () => {
    const db = database(PROD, {
      partition: [
        { part: "all", id: "11", va: "100", vb: "400", n: null }, { part: "all", id: "12", va: "300", vb: "0", n: null },
        { part: "up", id: "11", va: "100", vb: "400", n: null }, { part: "gone", id: "12", va: "300", vb: "0", n: null },
        { part: "sum:all", id: null, va: "400", vb: "400", n: "2" }, { part: "sum:up", id: null, va: "100", vb: "400", n: "1" },
        { part: "sum:gone", id: null, va: "300", vb: "0", n: "1" }, { part: "sum:equal", id: null, va: "0", vb: "0", n: "0" },
      ],
      facts: [
        { id: "11", y: "2025", v: "400", joint: "250", largest: "300", largest_src: "contracts", partner: "7", partner_v: "360" },
        { id: "11", y: "2024", v: "100", joint: "0", largest: "100", largest_src: "da", partner: "8", partner_v: "100" },
        { id: "12", y: "2024", v: "300", joint: "0", largest: "300", largest_src: "da", partner: "7", partner_v: "300" },
      ],
      profiles: [
        { role: "supplier", id: "11", name_display: "Firma Unu", county: "Cluj", country_code: "RO", is_foreign: false, first_activity: "2019-03-01 10:00", last_activity: "2026-02-01 09:00", cui_valid: true },
        { role: "supplier", id: "12", name_display: "Firma Doi", county: "Ilfov", country_code: "FR", is_foreign: true, first_activity: "2018-05-01", last_activity: "2024-12-01", cui_valid: false },
        { role: "authority", id: "7", name_display: "Primăria X", county: "Cluj", country_code: "RO", is_foreign: false, first_activity: null, last_activity: null, cui_valid: true },
      ],
    });
    const result = await runSpec(db.sql, trend({ change: "up" }, { yearFrom: 2024, yearTo: 2025 }), {});
    if ("error" in result || result.data.block !== "trend") throw new Error("trend expected");
    const unu = { entityId: "11", name: "Firma Unu", county: "Cluj", valueA: 100, valueB: 400 };
    const doi = { entityId: "12", name: "Firma Doi", county: null, valueA: 300, valueB: 0 };
    expect(result.data).toMatchObject({
      list: "up", change: "up", rowsTrend: [unu],
      groups: { all: [unu, doi], up: [unu], new: [], first: [], down: [], gone: [doi] },
      composition: { all: { count: 2, valueA: 400, valueB: 400 }, up: { count: 1, valueA: 100, valueB: 400 }, gone: { count: 1, valueA: 300, valueB: 0 }, equal: { count: 0, valueA: 0, valueB: 0 } },
      noun: "firme",
    });
    // The year that makes each change: 2025 for the growth, 2024 for the one that is gone (a foreign firm: its country).
    expect(result.data.rowFacts).toEqual({
      "11": { year: 2025, value: 400, largest: { value: 300, src: "contracts" }, joint: 250, partner: { entityId: "7", name: "Primăria X", value: 360 },
        firstActivity: "2019-03-01", lastActivity: "2026-02-01", cuiValid: true, country: null },
      "12": { year: 2024, value: 300, largest: { value: 300, src: "da" }, joint: 0, partner: { entityId: "7", name: "Primăria X", value: 300 },
        firstActivity: "2018-05-01", lastActivity: "2024-12-01", cuiValid: false, country: "FR" },
    });
    // The facts read only the shown ids, on their index, in the answer's two years; the profiles both roles at once.
    const facts = db.statements.find((s) => s.text.includes("with x as materialized"))!;
    expect(facts.text).toContain("d.supplier_id = any(?array::bigint[]) and d.finalization_date >= ? and d.finalization_date < ?");
    expect(facts.text).toContain("filter (where d.n_winners > 1)");
    expect(facts.values).toEqual(expect.arrayContaining([["11", "12"], "2024", "2026"]));
    const profiles = db.statements.find((s) => s.text.includes("from marts.entity_profile ep left join core.entities e"))!;
    expect(profiles.values).toEqual(["supplier", ["11", "12"], "authority", ["7", "8"]]);
  });

  it("partitions counties without facts or profiles, and names a group after the selection", async () => {
    const db = database(PROD, { partition: [{ part: "all", id: "Cluj", va: "5", vb: "9", n: null }, { part: "up", id: "Cluj", va: "5", vb: "9", n: null }] });
    const counties = await runSpec(db.sql, { ...trend({ change: "up" }, { yearFrom: 2024, yearTo: 2025 }), dim: "county" }, {});
    if ("error" in counties || counties.data.block !== "trend") throw new Error("trend expected");
    expect(counties.data.rowsTrend).toEqual([{ entityId: null, name: "Cluj", county: null, valueA: 5, valueB: 9 }]);
    expect(counties.data.groups).toEqual({ all: counties.data.rowsTrend, up: counties.data.rowsTrend, new: [], down: [], gone: [] });
    expect(counties.data).toMatchObject({ noun: "județe" });
    expect(counties.data.rowFacts).toBeUndefined();
    expect(db.statements.some((s) => s.text.includes("with x as materialized") || s.text.includes("core.entities e"))).toBe(false);
    expect(db.statements.find((s) => s.text.includes("with k as materialized"))!.text).toContain("group by d.county");
  });

  it("says 2018 is incomplete on an old link that compares it", async () => {
    const all = await runSpec(database(PROD).sql, trend({}, { yearFrom: 2018, yearTo: 2019 }), {});
    if ("error" in all) throw new Error(all.error);
    expect(all.caveats).toContain("2018 e incomplet: achizițiile directe încep pe 2 aprilie, iar contractele din 2018 sunt jumătate din cele din 2019.");
    const contracts = await runSpec(database(PROD).sql, { ...trend(undefined, { yearFrom: 2018, yearTo: 2024 }), dataset: "contracts" }, {});
    if ("error" in contracts) throw new Error(contracts.error);
    expect(contracts.caveats).toContain("2018 e incomplet: contractele din 2018 sunt jumătate din cele din 2019.");
    const later = await runSpec(database(PROD).sql, trend(undefined, { yearFrom: 2019, yearTo: 2024 }), {});
    if ("error" in later) throw new Error(later.error);
    expect(later.caveats.join(" ")).not.toContain("2018 e incomplet");
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
