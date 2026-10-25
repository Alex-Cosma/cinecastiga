import { describe, expect, it } from "vitest";
import type { AskSpec } from "./spec";
import { foreignCountry, specTrendList, specTrendPart, trendListSpec, trendPartLabel, trendRowLabels, type TrendRowFacts } from "./trend-shared";
import * as partition from "./trend-partition";
import * as shared from "./trend-shared";

/*
 * TB-screen: the spec of each list of a trend's answer, without SQL (the group
 * buttons switch on the lists the answer holds, owner-R-facts-all-lists).
 */

const years = { yearFrom: 2024, yearTo: 2025 };
const answered = (trend?: AskSpec["trend"]): AskSpec => ({ block: "trend", dim: "supplier", measure: "value", topN: 10, filters: years, ...(trend ? { trend } : {}) });

describe("the list of a spec", () => {
  it("is its change, „first” for the first-year new ones, „all” without the key (an old link)", () => {
    expect(specTrendList(answered())).toBe("all");
    expect(specTrendList(answered({ change: "up", months: "auto" }))).toBe("up");
    expect(specTrendList(answered({ change: "new", firstOnly: true }))).toBe("first");
    expect(specTrendList(answered({ change: "gone" }))).toBe("gone");
  });
});

describe("the spec of another list of the same answer", () => {
  it("gives back the answered spec itself for its own list (an old link stays without the key)", () => {
    const old = answered();
    expect(trendListSpec(old, "all")).toBe(old);
    const percent = answered({ change: "up", months: "auto", order: "percent", minBase: 1_000_000 });
    expect(trendListSpec(percent, "up")).toBe(percent);
  });

  it("changes only `trend`, keeps the months as asked and writes the first year as new + firstOnly", () => {
    const up = answered({ change: "up", months: "auto" });
    expect(trendListSpec(up, "new")).toEqual({ ...up, trend: { change: "new", months: "auto" } });
    expect(trendListSpec(up, "first")).toEqual({ ...up, trend: { change: "new", months: "auto", firstOnly: true } });
    expect(trendListSpec(answered({ change: "new", firstOnly: true, months: [1, 5] }), "new").trend).toEqual({ change: "new", months: [1, 5] });
    expect(trendListSpec(answered(), "gone").trend).toEqual({ change: "gone" });
    expect(up.trend).toEqual({ change: "up", months: "auto" });
  });

  it("drops the order and its base on another group, and finds them again on the growths of the answer", () => {
    const percent = answered({ change: "up", months: "auto", order: "percent", minBase: 10_000_000 });
    const gone = trendListSpec(percent, "gone");
    expect(gone.trend).toEqual({ change: "gone", months: "auto" });
    // Back from „Nu mai apar” to „Creșteri”: the growths of this answer are those in percent from the base.
    expect(trendListSpec(percent, "up")).toBe(percent);
    // An answer in lei: its growths stay in lei.
    expect(trendListSpec(answered({ change: "new" }), "up").trend).toEqual({ change: "up" });
  });

  it("names its part with its years, the growths in percent with their base", () => {
    expect(specTrendPart(answered({ change: "up", order: "percent" }))).toBe("eligible");
    expect(specTrendPart(answered({ change: "up" }))).toBe("up");
    expect(trendPartLabel("eligible", answered({ change: "up", order: "percent", minBase: 100_000 }))).toBe("Creșteri de la cel puțin 100.000 lei în 2024");
    expect(trendPartLabel("first", answered())).toBe("Noi față de 2024 · prima dată în 2025");
    expect(trendPartLabel("gone", answered())).toBe("Nu mai apar în 2025");
    expect(trendPartLabel("all", answered())).toBe("Toate");
  });

  it("is what the engine re-exports (one definition of the lists, the facts and their labels)", () => {
    expect(partition.TREND_LISTS).toBe(shared.TREND_LISTS);
    expect(partition.trendRowLabels).toBe(shared.trendRowLabels);
    expect(partition.trendGroupOfRow).toBe(shared.trendGroupOfRow);
    expect(partition.changeYear).toBe(shared.changeYear);
  });
});

describe("a foreign identity's country", () => {
  const facts = (o: Partial<TrendRowFacts>): TrendRowFacts =>
    ({ year: 2025, value: 10, largest: null, joint: 0, partner: null, firstActivity: "2019-01-01", lastActivity: "2025-01-01", cuiValid: false, country: null, ...o });
  it("is shown for a foreign country, never for RO: a domestic entry without a valid CUI says so (FCC CONSTRUCCION S.A.)", () => {
    expect(foreignCountry({ country: "DE" })).toBe("DE");
    expect([foreignCountry({ country: "RO" }), foreignCountry({ country: "ro" }), foreignCountry({ country: null })]).toEqual([null, null, null]);
    const row = { valueA: 0, valueB: 10 };
    expect(trendRowLabels(row, facts({ country: "RO" }), { yearA: 2024, yearB: 2025 })[0]).toEqual({ kind: "noValidCui" });
    expect(trendRowLabels(row, facts({ country: "FR" }), { yearA: 2024, yearB: 2025 }).map((l) => l.kind)).not.toContain("noValidCui");
  });
});
