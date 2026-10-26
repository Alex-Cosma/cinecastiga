import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { assembleMix } from "./answer-facts";
import { OFFERS_KNOWN_MIN } from "./facet-parts";
import type { RollupCtx } from "./rollups";
import { mixWhere, monthsWhere, sizeRanges } from "./series-rollups";
import { VALUE_RANGES } from "./purchase";

// The answer's facts after the answer (F3-rows): „Din care” of a total and the rollups behind it and the bars.

/** A tagged template that keeps what it was given: enough to tell a rollup's where from its refusal. */
const fake = Object.assign((strings: unknown, ...values: unknown[]) => ({ strings, values }), { array: (v: unknown) => v }) as unknown as DbSql;
const national: RollupCtx = {
  plafond: "da-branch", population: null, minimumRecords: null, cpvPrefixes: [], cpvExclude: [], county: null, kind: null, kindIds: null,
  authorityId: null, supplierId: null, uatSiruta: null, uatAuthorityIds: [], singleBidder: false,
  minEmployees: null, maxEmployees: null, yearFrom: null, yearTo: null, monthFrom: null, monthTo: null, trendMonths: null, seriesMonths: null,
  adminSupplierIds: null, comparison: null, purchaseKind: null, procedure: null, purchaseValueMin: null, purchaseValueMax: null,
};
const ctx = (patch: Partial<RollupCtx>) => ({ ...national, ...patch });
const answers = (result: { where: unknown } | { reason: string }) => "where" in result ? "rollup" : result.reason;

describe("the rollups of F3-rows answer only what they keep (fail closed, as planRollup)", () => {
  it("agg_months: the channel, the county, the kind, the period to the month and the same months", () => {
    for (const patch of [{}, { plafond: "strict" as const }, { plafond: "none" as const }, { county: "Cluj" }, { purchaseKind: "lucrari" as const },
      { yearFrom: 2024, yearTo: 2025, monthFrom: 3, monthTo: 8 }, { seriesMonths: [1, 6] as const }])
      expect(answers(monthsWhere(fake, ctx(patch as Partial<RollupCtx>))), JSON.stringify(patch)).toBe("rollup");
    expect(answers(monthsWhere(fake, ctx({ cpvPrefixes: ["4523"] })))).toMatch(/^cpvPrefixes: not in agg_months/);
    expect(answers(monthsWhere(fake, ctx({ procedure: "deschisa" })))).toMatch(/^procedure: not in agg_months/);
    expect(answers(monthsWhere(fake, ctx({ minEmployees: 1 })))).toMatch(/^minEmployees: not in agg_months/);
    // A condition added later, unknown to the rollups, sends the question live.
    expect(answers(monthsWhere(fake, { ...ctx({}), futureKey: "x" } as RollupCtx))).toBe("futureKey: not in agg_months (a condition the rollups do not know)");
  });

  it("agg_national_mix: whole years, the procedure, the size by its ranges and the single bidder; never months or typed bounds", () => {
    for (const patch of [{}, { county: "Cluj", yearFrom: 2025, yearTo: 2025 }, { procedure: "deschisa" as const }, { singleBidder: true },
      { purchaseValueMin: 100_000, purchaseValueMax: 1_000_000 }])
      expect(answers(mixWhere(fake, ctx(patch as Partial<RollupCtx>))), JSON.stringify(patch)).toBe("rollup");
    // Whole years only: the months are not among its keys.
    expect(answers(mixWhere(fake, ctx({ yearFrom: 2025, yearTo: 2025, monthFrom: 1, monthTo: 6 })))).toMatch(/^monthFrom: not in agg_national_mix/);
    expect(answers(mixWhere(fake, ctx({ purchaseValueMin: 50_000, purchaseValueMax: 250_000 })))).toBe("size: bounds typed in, not the ranges of agg_national_mix");
    expect(answers(mixWhere(fake, ctx({ seriesMonths: [1, 6] })))).toMatch(/^seriesMonths: not in agg_national_mix/);
    expect(answers(mixWhere(fake, ctx({ authorityId: "12" })))).toMatch(/^authorityId: not in agg_national_mix/);
  });

  it("split a size into the ranges it covers, only on their own bounds", () => {
    const lows = VALUE_RANGES.map((r) => r.purchaseValueMin ?? 0);
    expect(sizeRanges(null, null)).toEqual(VALUE_RANGES.map((_, i) => i));
    expect(sizeRanges(lows[1]!, lows[2]!)).toEqual([1]);
    expect(sizeRanges(lows[1]!, null)).toEqual(VALUE_RANGES.slice(1).map((_, i) => i + 1));
    expect(sizeRanges(0, lows[2]!)).toEqual([0, 1]);
    expect(sizeRanges(50_000, 250_000)).toBeNull();
    expect(sizeRanges(lows[2]!, lows[1]!)).toBeNull();
  });
});

describe("„Din care” assembled from the grouping sets", () => {
  // One row per grouping set (g* = 1 where the column is rolled up), as mixFacts' query returns them.
  const set = (k: "kind" | "proc" | "size" | "offers", value: string | null, v: number, n: number) => ({
    gk: k === "kind" ? 0 : 1, gp: k === "proc" ? 0 : 1, gs: k === "size" ? 0 : 1, go: k === "offers" ? 0 : 1,
    kind: k === "kind" ? value : null, proc: k === "proc" ? value : null, size: k === "size" ? value : null, offers: k === "offers" ? value : null, v: String(v), n: String(n),
  });
  const rows = [
    set("kind", "lucrari", 60, 2), set("kind", "produse", 30, 20), set("kind", "servicii", 9, 5), set("kind", null, 1, 1),
    set("proc", "da", 20, 22), set("proc", "deschisa", 70, 4), set("proc", "simplificata", 10, 2),
    set("size", "0", 15, 20), set("size", "2", 25, 6), set("size", "3", 60, 2),
    set("offers", "true", 20, 2), set("offers", "false", 30, 2), set("offers", "unknown", 30, 2), set("offers", null, 20, 22),
  ];

  it("gives each tab's rows in their order, adding up to the total, each share of the total's value", () => {
    const mix = assembleMix(rows);
    expect(mix.total).toEqual({ n: 28, value_ron: 100 });
    expect(mix.kind.map((r) => [r.value, r.n, r.value_ron, r.share])).toEqual([["lucrari", 2, 60, 0.6], ["produse", 20, 30, 0.3], ["servicii", 5, 9, 0.09], ["none", 1, 1, 0.01]]);
    expect(mix.procedure.map((r) => r.value)).toEqual(["da", "deschisa", "simplificata"]);
    expect(mix.size.map((r) => [r.value, r.share])).toEqual([["0", 0.15], ["2", 0.25], ["3", 0.6]]);
    for (const tab of [mix.kind, mix.procedure, mix.size]) {
      expect(tab.reduce((t, r) => t + r.n, 0)).toBe(mix.total.n);
      expect(tab.reduce((t, r) => t + r.value_ron, 0)).toBeCloseTo(mix.total.value_ron, 6);
    }
  });

  it("gives the offers of the contracts only, as shares of their value, and the share known", () => {
    const { offers } = assembleMix(rows);
    expect(offers!.rows.map((r) => [r.value, r.share])).toEqual([["one", 0.25], ["several", 0.375], ["unknown", 0.375]]);
    expect(offers!.known).toBeCloseTo(0.625, 9);
    expect(offers!.known).toBeGreaterThanOrEqual(OFFERS_KNOWN_MIN);
    // Direct acquisitions only: no contract, no offers tab.
    expect(assembleMix([set("kind", "produse", 5, 5), set("proc", "da", 5, 5), set("offers", null, 5, 5)]).offers).toBeNull();
  });
});
