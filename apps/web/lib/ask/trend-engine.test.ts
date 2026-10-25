import { beforeEach, describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { DATA_CHANGED, runRows, runSpec, useSnapshotCoverage } from "./compile";
import { forgetRollupsReady } from "./rollups";
import { forgetTrendGroups, trendGroupStats } from "./group-ids";
import { autoMonthsUnresolved } from "./months-window";
import { buildPills } from "./pills";
import { trendProfiles } from "./trend-partition";
import { validateSpec, type AskSpec } from "./spec";

// F2 (plan §2.8, §4.7): the trend's lenses in the engine, without a database. A
// tag harness answers the coverage and checkpoint reads and records every
// statement with its parameters; the rows of the answer are not the point here.

type Coverage = { dataset: string; date_from: string; date_to: string; complete_until?: string | null }[];
/** The profiles statement of the shown entities (trendProfiles), by its join. */
const PROFILES = "left join marts.entity_profile ep on ep.role = x.role";
/** Rows the harness answers: the partition statement, the row facts and the profiles of the shown entities (trend-partition.ts). */
interface Answers { partition?: Record<string, unknown>[]; facts?: Record<string, unknown>[]; profiles?: Record<string, unknown>[] }
/**
 * `stamp`: the file nodes of the marts build (group-ids.ts), so the partition's members are kept;
 * without it nothing is kept or reused. `days`: the rollups have the first and last day.
 */
function database(coverage: Coverage, opts: { rollups?: boolean; days?: boolean; keyed?: boolean; members?: string[]; stamp?: string } & Answers = {}) {
  const statements: { text: string; values: unknown[] }[] = [];
  class Fragment {
    constructor(public text: string, public values: unknown[]) {}
    then(resolve: (value: unknown[]) => unknown) {
      const text = this.text;
      statements.push({ text, values: this.values });
      if (text.includes("pg_relation_filenode")) return Promise.resolve(resolve(opts.stamp ? [{ db: "harness", da: opts.stamp, ct: "2", ep: "3" }] : []));
      if (text.includes("a.attname = 'd0'")) return Promise.resolve(resolve([{ ok: opts.days ?? false }]));
      if (text.includes("a.attname = 'sicap_da_id'")) return Promise.resolve(resolve([{ ok: opts.keyed ?? false }]));
      if (text.includes("to_regclass('marts.agg_entity_year')")) return Promise.resolve(resolve([{ ok: opts.rollups ?? false }]));
      if (text.includes("to_regclass('marts.data_coverage')")) return Promise.resolve(resolve([{ ok: true, refreshes: true }]));
      if (text.includes("from app.monitoring_refreshes")) return Promise.resolve(resolve([{ id: "checkpoint-12" }]));
      if (text.includes("from marts.data_coverage")) return Promise.resolve(resolve(coverage));
      if (text.includes("marts.national_stats")) return Promise.resolve(resolve([2018, 2019, 2024, 2025, 2026].map((year) => ({ year }))));
      if (/select \S+::text m from/.test(text)) return Promise.resolve(resolve((opts.members ?? []).map((m) => ({ m }))));
      // The partition: `with k as materialized`, or with an attribute `with g as materialized (…), k as materialized`.
      if (text.includes("with k as materialized") || text.includes("with g as materialized")) return Promise.resolve(resolve(opts.partition ?? []));
      if (text.includes("with x as materialized")) return Promise.resolve(resolve(opts.facts ?? []));
      if (text.includes(PROFILES)) return Promise.resolve(resolve(opts.profiles ?? []));
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
    unsafe: async (text: string) => { statements.push({ text, values: [] }); return []; },
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

beforeEach(() => { forgetRollupsReady(); forgetTrendGroups(); });

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
    // Without JIT, whose compiling cost more than it saved on these groupings.
    expect(db.statements.map((s) => s.text)).toContain("set local jit = off");
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
    // The pills say the months the answer counted (/api/ask passes them), the spec keeps `auto`.
    expect(buildPills(spec, {}, { executedMonths: result.executed!.months })).toContain("aceleași luni: ian.–mai");
  });

  it("compares whole years when the later year is complete, and says nothing of months", async () => {
    const spec = trend({ change: "down", months: "auto" }, { yearFrom: 2024, yearTo: 2025 });
    const result = await runSpec(database(PROD).sql, spec, {});
    if ("error" in result) throw new Error(result.error);
    expect(result.executed).toEqual({ months: [1, 12], mode: "auto", checkpoint: "checkpoint-12" });
    expect(result.caveats.join(" ")).not.toContain("aceleași luni");
    // Nor do the pills (trend final §3.3: `auto` on whole years shows no chip); without the answer they say the rule.
    expect(buildPills(spec, {}, { executedMonths: result.executed!.months }).join(" · ")).not.toContain("luni");
    expect(buildPills(spec, {})).toContain("aceleași luni");
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
    // The facts read only the shown ids, on their index, each in its change year; the profiles both roles at once.
    const facts = db.statements.find((s) => s.text.includes("with x as materialized"))!;
    expect(facts.text).toContain("and ((d.supplier_id = any(?array::bigint[]) and d.finalization_date >= ? and d.finalization_date < ?)"
      + " or (d.supplier_id = any(?array::bigint[]) and d.finalization_date >= ? and d.finalization_date < ?))");
    expect(facts.text).toContain("filter (where d.n_winners > 1)");
    expect(facts.values.slice(-6)).toEqual([["11"], "2025", "2026", ["12"], "2024", "2025"]);
    // The profiles by id: the identity's own CUI status even where the profile is not written yet.
    const profiles = db.statements.find((s) => s.text.includes(PROFILES))!;
    expect(profiles.values).toEqual(["supplier", ["11", "12"], "authority", ["7", "8"]]);
    expect(profiles.text).toContain("left join core.entities e on e.id = x.id");
  });

  it("groups every firm and keeps the employees band as the group's attribute, counting those without a filing (trend-2)", async () => {
    const db = database(PROD, { partition: [
      { part: "sum:all", id: null, va: "400", vb: "400", n: "2" },
      { part: "selection", id: null, va: "900", vb: "800", n: "7", x: { da: { n: 9, v: "1700", first: "2024-01-02", last: "2025-12-30" }, contracts: { n: 0, v: "0", first: null, last: null } } },
      { part: "none:new", id: null, va: null, vb: null, n: "5" }, { part: "none:all", id: null, va: null, vb: null, n: "6" },
    ] });
    const result = await runSpec(db.sql, trend({ change: "new" }, { yearFrom: 2024, yearTo: 2025, minEmployees: 1, maxEmployees: 9 }), {});
    if ("error" in result || result.data.block !== "trend") throw new Error("trend expected");
    expect(result.data.withoutFiling).toEqual({ new: 5, all: 6 });
    const partition = db.statements.find((s) => s.text.includes("with g as materialized"))!.text;
    // The grouping reads every firm; the band and the filing are on the grouped firm (k.id), not on the records.
    expect(partition).toContain("k as materialized (select * from g k where k.id in ( select ep.entity_id from marts.entity_profile ep where ep.role = 'supplier' and ep.employees is not null and ep.employees between ? and ? ))");
    expect(partition.slice(0, partition.indexOf("k as materialized"))).not.toContain("ep.employees");
    expect(partition).toContain("from g k where not (k.id in (select ep.entity_id from marts.entity_profile ep where ep.role = 'supplier' and ep.employees is not null))");
    // A trend of institutions keeps the employees of their firms as a selection of the records.
    const institutions = database(PROD);
    await runSpec(institutions.sql, { ...trend({ change: "up" }, { yearFrom: 2024, yearTo: 2025, minEmployees: 1, maxEmployees: 9 }), dim: "authority" }, {});
    const grouped = institutions.statements.find((s) => s.text.includes("with k as materialized"))!.text;
    expect(grouped).not.toContain("with g as materialized");
    expect(grouped).toContain("d.supplier_id in ( select ep.entity_id from marts.entity_profile ep where ep.role = 'supplier' and ep.employees is not null");
  });

  it("shows a seat county kept as „NA” as unknown, and an identity without a profile with its own CUI status", async () => {
    const db = database(PROD, { profiles: [
      { role: "supplier", id: "11", name_display: "Firma Unu", county: "NA", country_code: "RO", is_foreign: false, first_activity: null, last_activity: null, cui_valid: true },
      { role: "supplier", id: "12", name_display: "Firma Doi", county: "Necunoscut", country_code: "RO", is_foreign: false, first_activity: null, last_activity: null, cui_valid: null },
    ] });
    const profiles = await trendProfiles(db.sql, [{ role: "supplier", ids: ["11", "12"] }]);
    expect(profiles.get("supplier:11")).toMatchObject({ county: null, cuiValid: true });
    expect(profiles.get("supplier:12")).toMatchObject({ county: null, cuiValid: null });
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
    // On „Toate” partialYears already says the direct acquisitions start on 2 April 2018: only the contracts are added.
    expect(all.caveats).toContain("Și contractele din 2018 sunt jumătate din cele din 2019.");
    expect(all.caveats.filter((c) => c.includes("02.04.2018"))).toHaveLength(1);
    expect(all.caveats.join(" ")).not.toContain("2 aprilie");
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
      // A trend's sources run without JIT, as its answer; another block's keep the server's setting.
      expect(db.statements.map((s) => s.text)).toContain("set local jit = off");
    }
    const stat = database(PROD);
    await runRows(stat.sql, { block: "stat", measure: "value", filters: { yearFrom: 2025, yearTo: 2025 } }, {}, 0);
    expect(stat.statements.map((s) => s.text)).not.toContain("set local jit = off");
  });

  /** The partition of 2024 → 2025: firms 11 and 12 are gone (records of 2024 on both channels), 14 grows. */
  const GONE = (days = true): Record<string, unknown>[] => [
    { part: "sum:all", id: null, va: "900", vb: "500", n: "3", x: { da: { n: 5, v: "1300.50", first: days ? "2024-01-05" : null, last: days ? "2025-11-30" : null },
      contracts: { n: 1, v: "99.5", first: days ? "2024-03-01" : null, last: days ? "2024-03-01" : null } } },
    { part: "sum:gone", id: null, va: "500", vb: "0", n: "2", x: { da: { n: 3, v: "400.50", first: days ? "2024-01-05" : null, last: days ? "2024-12-20" : null },
      contracts: { n: 1, v: "99.5", first: days ? "2024-03-01" : null, last: days ? "2024-03-01" : null } }, ids: "11\u001f12" },
    { part: "sum:up", id: null, va: "400", vb: "500", n: "1", x: { da: { n: 2, v: "900", first: days ? "2024-06-01" : null, last: days ? "2025-11-30" : null },
      contracts: { n: 0, v: "0", first: null, last: null } }, ids: "14" },
  ];
  const gone = trend({ change: "gone" }, { yearFrom: 2024, yearTo: 2025 });
  const records = (db: ReturnType<typeof database>) => db.statements.filter((s) => s.text.includes("from marts.da_transactions"));

  it("group a group's members over the answer's selection when none is kept, then total them from that grouping", async () => {
    const db = database(PROD, { partition: GONE() });
    const result = await runRows(db.sql, gone, {}, 0);
    if ("error" in result) throw new Error(result.error);
    // The answer's partition statement, without lists (limit 0): the members and their records per channel.
    const partition = db.statements.find((s) => s.text.includes("with k as materialized"))!;
    expect(partition.text).toContain("group by d.supplier_id");
    expect(partition.text).toContain("string_agg(k.id::text, chr(31) order by k.id) from k where k.va > 0 and k.vb = 0");
    expect(partition.values).toContain("sum:gone");
    // The totals and the period come from it: no totals query of the records.
    expect(db.statements.some((s) => s.text.includes("group by d.state"))).toBe(false);
    expect(result).toMatchObject({ sourceTotal: 4, sourceValue: "500.00", total: 4, value: "500.00", dateFrom: "2024-01-05", dateTo: "2024-12-20",
      accepted: { count: 3, value: "400.50" }, group: { part: "gone", members: 2, selection: { count: 6, value: "1400.00" } } });
    expect(result.statuses).toEqual([{ state: "Oferta acceptata", count: 3, value: "400.50" }, { state: null, count: 1, value: "99.5" }]);
    // The page: each channel's members on their id index and the two years, never a scan of the mart or a walk
    // back along the primary key (a small group: no sequential scan, the reference order behind `+ 0`).
    const page = db.statements.find((s) => s.text.includes("limit ? offset ?"))!;
    expect(page.text).toContain("d.supplier_id = any(?array::bigint[]) and d.finalization_date >= ? and d.finalization_date < ?");
    expect(page.values).toEqual(expect.arrayContaining([["11", "12"], "2024", "2026"]));
    expect(page.text).toContain("order by (d.ref_id + 0) desc, d.supplier_id nulls first limit ?");
    const settings = db.statements.map((s) => s.text).filter((t) => t.includes("enable_"));
    expect(settings).toEqual(["set local enable_seqscan = off", "set local enable_seqscan to default"]);
    expect(db.statements.findIndex((s) => s.text === "set local enable_seqscan = off")).toBeLessThan(db.statements.indexOf(page));
    expect(result.scopeNotes).toContain("Sursele grupului „Nu mai apar în 2025”: 2 firme, cu înregistrările lor din cei doi ani, nu doar cele afișate.");
    // The drawer's channel and state are channels of these totals; a search counts the records.
    const da = await runRows(database(PROD, { partition: GONE() }).sql, gone, {}, 0, { stream: "da" });
    if ("error" in da) throw new Error(da.error);
    expect([da.sourceTotal, da.total, da.value]).toEqual([4, 3, "400.50"]);
    const search = database(PROD, { partition: GONE() });
    await runRows(search.sql, gone, {}, 0, { search: "spital" });
    expect(search.statements.find((s) => s.text.includes("group by d.state"))!.text).toContain("d.supplier_id = any(?array::bigint[])");
  });

  it("keep the answer's members: its drawers group nothing again, until the marts are rebuilt", async () => {
    const answer = database(PROD, { stamp: "41", partition: GONE() });
    const result = await runSpec(answer.sql, gone, {});
    if ("error" in result) throw new Error(result.error);
    expect(trendGroupStats()).toMatchObject({ kept: 1, entries: 1, held: 3 });
    // The drawer of another group of the same selection (the growths) and of the chosen one: no grouping, no totals query.
    for (const spec of [gone, trend({ change: "up" }, { yearFrom: 2024, yearTo: 2025 })]) {
      const drawer = database(PROD, { stamp: "41" });
      const rows = await runRows(drawer.sql, spec, {}, 0);
      if ("error" in rows) throw new Error(rows.error);
      expect(drawer.statements.some((s) => s.text.includes("with k as materialized") || s.text.includes("group by d.state"))).toBe(false);
      expect(records(drawer).length).toBe(1);
    }
    // A row of the group: its membership in memory, its own records then (a firm outside the group has none to list).
    const row = database(PROD, { stamp: "41" });
    const own = await runRows(row.sql, gone, {}, 0, { scope: { entityIds: ["12", "14"], role: "supplier" } });
    if ("error" in own) throw new Error(own.error);
    expect(row.statements.some((s) => /::text m from/.test(s.text) || s.text.includes("with k as materialized"))).toBe(false);
    expect(row.statements.find((s) => s.text.includes("group by d.state"))!.values).toContainEqual(["12"]);
    expect(own.group).toBeUndefined();
    // Another build (other file nodes): grouped again.
    const rebuilt = database(PROD, { stamp: "42", partition: GONE() });
    await runRows(rebuilt.sql, gone, {}, 0);
    expect(rebuilt.statements.some((s) => s.text.includes("with k as materialized"))).toBe(true);
    // The growths in percent from another base than the answer's: grouped again with that base.
    const percent = (minBase: number) => trend({ change: "up", order: "percent", minBase }, { yearFrom: 2024, yearTo: 2025 });
    await runSpec(database(PROD, { stamp: "43", partition: [...GONE(), { part: "sum:eligible", id: null, va: "400", vb: "500", n: "1", x: { da: { n: 2, v: "900", first: "2024-06-01", last: "2025-11-30" }, contracts: { n: 0, v: "0", first: null, last: null } }, ids: "14" }] }).sql, percent(10_000), {});
    const same = database(PROD, { stamp: "43" }), other = database(PROD, { stamp: "43", partition: GONE() });
    await runRows(same.sql, percent(10_000), {}, 0);
    await runRows(other.sql, percent(20_000), {}, 0);
    expect([same, other].map((db) => db.statements.some((s) => s.text.includes("with k as materialized")))).toEqual([false, true]);
  });

  it("count a group's records when its grouping has no days (a rollup built before them), and keep the planner's plans for a large group", async () => {
    const undated = database(PROD, { partition: GONE(false) });
    const result = await runRows(undated.sql, gone, {}, 0);
    if ("error" in result) throw new Error(result.error);
    const totals = undated.statements.find((s) => s.text.includes("group by d.state"))!;
    expect(totals.text).toContain("d.supplier_id = any(?array::bigint[]) and d.finalization_date >= ?");
    const large = GONE().map((r) => r.part === "sum:gone" ? { ...r, x: { da: { n: 300_000, v: "1", first: "2024-01-01", last: "2024-12-31" }, contracts: { n: 0, v: "0", first: null, last: null } } } : r);
    const big = database(PROD, { partition: large });
    const many = await runRows(big.sql, gone, {}, 0);
    if ("error" in many) throw new Error(many.error);
    expect(many.statuses).toEqual([{ state: "Oferta acceptata", count: 300_000, value: "1" }]);
    expect(big.statements.some((s) => s.text.includes("enable_"))).toBe(false);
    expect(big.statements.find((s) => s.text.includes("limit ? offset ?"))!.text).toContain("order by d.ref_id desc, d.supplier_id nulls first limit ?");
    // Another order, or an older pair, would walk the key through millions of other records: the members' index.
    for (const [spec, opts] of [[gone, { sort: "source", dir: "asc" }], [gone, { sort: "value" }],
      [trend({ change: "gone" }, { yearFrom: 2021, yearTo: 2022 }), {}]] as const) {
      const other = database(PROD, { partition: large });
      await runRows(other.sql, spec, {}, 0, opts);
      expect(other.statements.some((s) => s.text === "set local enable_seqscan = off"), JSON.stringify(opts)).toBe(true);
    }
  });

  it("take a group's first keys from the covering index once it carries sicap_da_id, for any group size and order", async () => {
    const large = GONE().map((r) => r.part === "sum:gone" ? { ...r, x: { da: { n: 2_000_000, v: "1", first: "2024-01-01", last: "2024-12-31" }, contracts: { n: 0, v: "0", first: null, last: null } } } : r);
    for (const sort of ["source", "value"] as const) {
      const db = database(PROD, { partition: large, keyed: true });
      const result = await runRows(db.sql, gone, {}, 0, { sort });
      if ("error" in result) throw new Error(result.error);
      expect(db.statements.some((s) => s.text === "set local enable_seqscan = off")).toBe(true);
      const page = db.statements.find((s) => s.text.includes("limit ? offset ?"))!.text;
      // The direct acquisitions: keys first, then only those rows; the contracts as before.
      expect(page).toContain("where d.ref_id in ( select d.ref_id from");
      expect(page.match(/where d\.ref_id in \(/g)).toHaveLength(1);
    }
    // Before the build that adds the column: no keys from the index.
    forgetRollupsReady();
    const plain = database(PROD, { partition: large });
    await runRows(plain.sql, gone, {}, 0);
    expect(plain.statements.find((s) => s.text.includes("limit ? offset ?"))!.text).not.toContain("where d.ref_id in (");
  });

  it("check only a row's own ids for its records (Înregistrări →), on their index of the two years, and read no members for every change", async () => {
    const db = database(PROD, { members: ["11"] });
    await runRows(db.sql, trend({ change: "up" }, { yearFrom: 2024, yearTo: 2025 }), {}, 0, { scope: { entityIds: ["11"], role: "supplier" } });
    const members = db.statements.find((s) => /::text m from/.test(s.text))!;
    expect(members.text).toContain("d.supplier_id = any(?array::bigint[]) and d.finalization_date >= ? and d.finalization_date < ?");
    expect(members.values).toEqual(expect.arrayContaining([["11"], "2024", "2026"]));
    expect(db.statements.some((s) => s.text.includes("with k as materialized"))).toBe(false);
    const every = database(PROD);
    await runRows(every.sql, trend({ change: "all", months: "whole" }, { yearFrom: 2024, yearTo: 2025 }), {}, 0);
    expect(every.statements.some((s) => /::text m from/.test(s.text) || s.text.includes("with k as materialized"))).toBe(false);
  });

  it("list a county group by its names, and several counties as one selection", async () => {
    const counties = { ...trend({ change: "up" }, { yearFrom: 2024, yearTo: 2025 }), dim: "county" as const };
    const db = database(PROD, { partition: [{ part: "sum:up", id: null, va: "1", vb: "2", n: "2", x: { da: { n: 2, v: "3", first: "2024-02-02", last: "2025-02-02" }, contracts: { n: 0, v: "0", first: null, last: null } }, ids: "Cluj\u001fIasi" }] });
    const result = await runRows(db.sql, counties, {}, 0);
    if ("error" in result) throw new Error(result.error);
    expect(db.statements.find((s) => s.text.includes("with k as materialized"))!.text).toContain("group by d.county");
    expect(db.statements.find((s) => s.text.includes("limit ? offset ?"))!.values).toContainEqual(["Cluj", "Iasi"]);
    expect(result.scopeNotes).toContain("Sursele grupului „Creșteri”: 2 județe, cu înregistrările lor din cei doi ani, nu doar cele afișate.");
    const scoped = database(PROD);
    await runRows(scoped.sql, { ...trend(undefined, { yearFrom: 2024, yearTo: 2025 }), dim: "county" }, {}, 0, { scope: { counties: ["Cluj", "Bistrița-Năsăud"] } });
    const totals = scoped.statements.find((s) => s.text.includes("group by d.state"))!;
    expect(totals.text).toContain("lower(unaccent(d.county)) = any(?array::text[])");
    expect(totals.values).toContainEqual(["cluj", "bistrita-nasaud"]);
  });

  it("list a county row's own records (Înregistrări →), without the group's header or note, kept or not", async () => {
    const down = { ...trend({ change: "down" }, { yearFrom: 2024, yearTo: 2025 }), dim: "county" as const };
    // Nothing kept: only that county is checked against the group, never the whole grouping.
    const db = database(PROD, { members: ["Cluj"] });
    const result = await runRows(db.sql, down, {}, 0, { scope: { county: "cluj" } });
    if ("error" in result) throw new Error(result.error);
    expect(result.group).toBeUndefined();
    expect(result.scopeNotes.some((note) => note.startsWith("Sursele grupului"))).toBe(false);
    const members = db.statements.find((s) => /::text m from/.test(s.text))!;
    expect(members.text).toContain("lower(unaccent(d.county)) = any(?array::text[])");
    expect(members.values).toContainEqual(["cluj"]);
    expect(db.statements.some((s) => s.text.includes("with k as materialized"))).toBe(false);
    expect(db.statements.find((s) => s.text.includes("group by d.state"))!.values).toContainEqual(["Cluj"]);
    // Kept by the answer: the row's county among the group's names.
    const partition = [{ part: "sum:down", id: null, va: "9", vb: "5", n: "2", x: { da: { n: 2, v: "3", first: "2024-02-02", last: "2025-02-02" }, contracts: { n: 0, v: "0", first: null, last: null } }, ids: "Cluj\u001fIasi" }];
    await runSpec(database(PROD, { stamp: "51", partition }).sql, down, {});
    const row = database(PROD, { stamp: "51" });
    const kept = await runRows(row.sql, down, {}, 0, { scope: { county: "Iasi" } });
    if ("error" in kept) throw new Error(kept.error);
    expect(kept.group).toBeUndefined();
    expect(row.statements.some((s) => /::text m from/.test(s.text) || s.text.includes("with k as materialized"))).toBe(false);
    expect(row.statements.find((s) => s.text.includes("group by d.state"))!.values).toContainEqual(["Iasi"]);
  });
});
