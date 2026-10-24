import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { CSV_MAX_ROWS, runRows, runSpec } from "./compile";
import { ground } from "./ground";
import { validateSpec, type AskSpec } from "./spec";
import type { EvidenceScope } from "./evidence";
import { captureTransaction } from "../evidence-captures";
import { FORCE_CUSTOM_PLANS } from "../plan-cache";

// Regression (S1 speed baseline, 24 Oct 2026): from the sixth run of the same
// prepared statement on one pooled connection PostgreSQL switched the national
// sources list to a generic plan, 2 s → 14–20 s. Every engine transaction now
// opens with plan_cache_mode = force_custom_plan.

/** SQL tag harness: records every statement in order, with transaction boundaries. */
function database() {
  const log: string[] = [];
  class Fragment {
    constructor(public text: string, public values: unknown[]) {}
    then(resolve: (value: unknown[]) => unknown) {
      log.push(this.text);
      if (this.text.includes("marts.national_stats")) return Promise.resolve(resolve([{ year: 2025 }, { year: 2026 }]));
      // A trend's partition (trend-partition.ts) reads entity_profile inside its statement: no rows.
      if (this.text.includes("with k as materialized")) return Promise.resolve(resolve([]));
      if (this.text.includes("from marts.entity_profile")) {
        const id = this.values.find((v) => typeof v === "number");
        return Promise.resolve(resolve([{ entity_id: String(id ?? 1), name_display: `Entitatea ${id ?? 1}`, county: "Cluj", total_ron_full: "1" }]));
      }
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
    return new Fragment(text, values);
  }) as unknown as DbSql;
  Object.assign(tag, {
    array: (items: unknown[]) => new Fragment("?array", [items]),
    begin: async (options: string | ((tx: DbSql) => Promise<unknown>), fn?: (tx: DbSql) => Promise<unknown>) => {
      log.push(`begin ${typeof options === "string" ? options : ""}`.trim());
      try { return await (typeof options === "function" ? options : fn!)(tag); } finally { log.push("commit"); }
    },
    unsafe: async (text: string) => { log.push(text); return []; },
  });
  return { sql: tag, log };
}

/** The statement right after each BEGIN. */
const firstStatements = (log: string[]) => log.flatMap((line, i) => line.startsWith("begin") ? [log[i + 1]] : []);
/** Marts reads, in order: the queries a generic plan could slow down. */
const martsReads = (log: string[]) => log.flatMap((line, i) => /\bmarts\.(?!national_stats|entity_profile|data_coverage)/.test(line) ? [i] : []);

const selgros = { supplierName: "SELGROS CASH&CARRY SRL", supplierId: 2115381 };
const dedeman = { compareWith: "DEDEMAN S.R.L.", compareWithId: 2124387 };
const clujNapoca = { authorityName: "Municipiul Cluj-Napoca", authorityId: 2146445 };
const base = { measure: "value", dim: "supplier", topN: 10 };
/** The catalogue defaults of the speed baseline (scripts/ask-perf-cases.ts), one per block. */
const ANSWERS: Record<string, Record<string, unknown>> = {
  table: { ...base, block: "table", filters: {} },
  stat: { ...base, block: "stat", filters: {} },
  "stat (filtrată)": { ...base, block: "stat", filters: { ...clujNapoca, yearFrom: 2025, yearTo: 2025 } },
  timeseries: { ...base, block: "timeseries", filters: {} },
  map: { ...base, block: "map", filters: {} },
  breakdown: { ...base, block: "breakdown", filters: {} },
  compare: { ...base, block: "compare", comparisonMode: "transactions", filters: { ...selgros, ...dedeman } },
  trend: { ...base, block: "trend", filters: { yearFrom: 2025, yearTo: 2026 } },
  network: { ...base, block: "network", filters: selgros },
  sankey: { ...base, block: "sankey", filters: selgros },
  fact_check: { ...base, block: "fact_check", filters: { ...clujNapoca, ...selgros } },
  distribution: { ...base, block: "distribution", dim: "authority", filters: clujNapoca },
  scatter: { ...base, block: "scatter", filters: {} },
  entity_card: { ...base, block: "entity_card", rankBy: "value", filters: {} },
};
const SOURCES: [string, Record<string, unknown>, EvidenceScope | undefined][] = [
  ["table", ANSWERS.table!, undefined],
  ["table, un rând", ANSWERS.table!, { entityIds: ["2115381"], role: "supplier" }],
  ["trend", ANSWERS.trend!, undefined],
  ["network", ANSWERS.network!, undefined],
  ["distribution, un rând", ANSWERS.distribution!, { entityIds: ["2146445"], role: "authority" }],
];
const spec = (raw: Record<string, unknown>) => {
  const v = validateSpec(raw);
  if ("error" in v) throw new Error(v.error);
  return v as AskSpec;
};

describe("custom plans in every engine transaction", () => {
  it.each(Object.entries(ANSWERS))("runSpec %s sets plan_cache_mode before any other statement of its transaction", async (_name, raw) => {
    const db = database(), s = spec(raw);
    // With no rows, network, sankey, distribution and entity_card answer "no records"
    // from inside their transaction; what matters is that the transaction ran.
    await runSpec(db.sql, s, await ground(db.sql, s.filters));
    const first = firstStatements(db.log);
    expect(first.length).toBeGreaterThan(0);
    expect(new Set(first)).toEqual(new Set([FORCE_CUSTOM_PLANS]));
  });

  it.each(SOURCES)("runRows %s (list and CSV) sets plan_cache_mode before any other statement of its transaction", async (_name, raw, scope) => {
    for (const limit of [undefined, CSV_MAX_ROWS]) {
      const db = database(), s = spec(raw);
      const result = await runRows(db.sql, s, await ground(db.sql, s.filters), 0, { ...(scope ? { scope } : {}), ...(limit ? { limit } : {}) });
      expect(result).not.toHaveProperty("error");
      const first = firstStatements(db.log);
      expect(first.length).toBeGreaterThan(0);
      expect(new Set(first)).toEqual(new Set([FORCE_CUSTOM_PLANS]));
    }
  });

  // Captures, monitoring and the relation/comparison source lists run the engine
  // inside their own snapshot transaction (no nested BEGIN). withMonitoringSnapshot
  // sets it after its BEGIN (packages/db monitoring.test.ts); the engine's own
  // setting still precedes every marts read, whoever opened the transaction.
  it.each([["runSpec", ANSWERS.trend!], ["runRows", ANSWERS.table!]] as const)("%s inside a capture transaction sets it before its first marts read", async (entry, raw) => {
    const db = database(), s = spec(raw), q = captureTransaction(db.sql);
    const grounding = await ground(q, s.filters);
    const result = entry === "runSpec" ? await runSpec(q, s, grounding) : await runRows(q, s, grounding, 0);
    expect(result).not.toHaveProperty("error");
    expect(db.log.some((line) => line.startsWith("begin"))).toBe(false);
    const setting = db.log.indexOf(FORCE_CUSTOM_PLANS), reads = martsReads(db.log);
    expect(setting).toBeGreaterThanOrEqual(0);
    expect(reads.length).toBeGreaterThan(0);
    expect(Math.min(...reads)).toBeGreaterThan(setting);
  });
});
