import { describe, expect, it } from "vitest";
import { trendGroupOf } from "./predicates";
import { changeYear, factsOfRow, trendGroupOfRow, trendListOf, trendNoun, trendRowLabels, type TrendRowFacts } from "./trend-partition";

// The pure parts of the trend's partition (plan §4.7; trend final §1, §3.4): the list
// a spec shows, the group noun, the year that makes a change and the row labels.

const years = { yearA: 2024, yearB: 2025 };
const facts = (over: Partial<TrendRowFacts> = {}): TrendRowFacts => ({
  year: 2025, value: 1000, largest: null, joint: 0, partner: null, firstActivity: "2019-02-01", lastActivity: "2025-11-30", cuiValid: true, country: null, ...over,
});

describe("the list and the noun of a trend", () => {
  it("shows the chosen change, the first-year new ones with firstOnly, every change without options", () => {
    expect(trendListOf(trendGroupOf({}))).toBe("all");
    expect(trendListOf(trendGroupOf({ trend: { change: "up", order: "percent" } }))).toBe("up");
    expect(trendListOf(trendGroupOf({ trend: { change: "new" } }))).toBe("new");
    expect(trendListOf(trendGroupOf({ trend: { change: "new", firstOnly: true } }))).toBe("first");
    expect(trendListOf(trendGroupOf({ trend: { change: "gone" } }))).toBe("gone");
  });

  it("names the groups after the selection: suppliers of a chosen buyer, clients of a chosen firm", () => {
    expect(trendNoun({ dim: "supplier", filters: {} })).toBe("firme");
    expect(trendNoun({ dim: "supplier", filters: { authorityId: 7 } })).toBe("furnizori");
    expect(trendNoun({ dim: "supplier", filters: { uatSiruta: 1213 } })).toBe("furnizori");
    expect(trendNoun({ dim: "supplier", filters: { county: "Cluj" } })).toBe("firme");
    expect(trendNoun({ dim: "authority", filters: { authorityKind: "spital" } })).toBe("instituții");
    expect(trendNoun({ filters: { supplierName: "DR.MAX" } })).toBe("clienți");
    expect(trendNoun({ dim: "county", filters: { supplierId: 5 } })).toBe("județe");
  });
});

describe("the group of a row", () => {
  it("partitions the values of two years: growths, new, decreases, gone and equal", () => {
    expect([[1, 2], [0, 2], [3, 2], [3, 0], [3, 3]].map(([valueA, valueB]) => trendGroupOfRow({ valueA: valueA!, valueB: valueB! })))
      .toEqual(["up", "new", "down", "gone", "equal"]);
  });
});

describe("the facts of a shown row", () => {
  it("are of the year that makes the change: B for a growth or a new one, A for a decrease or a gone one", () => {
    expect(changeYear({ valueA: 1, valueB: 2 }, 2024, 2025)).toBe(2025);
    expect(changeYear({ valueA: 0, valueB: 2 }, 2024, 2025)).toBe(2025);
    expect(changeYear({ valueA: 3, valueB: 2 }, 2024, 2025)).toBe(2024);
    expect(changeYear({ valueA: 3, valueB: 0 }, 2024, 2025)).toBe(2024);
    expect(changeYear({ valueA: 3, valueB: 3 }, 2024, 2025)).toBe(2025);
  });

  it("are empty, not invented, when the records of that year or the profile are missing", () => {
    const row = { entityId: "9", valueA: 10, valueB: 0 };
    expect(factsOfRow(row, years, [], new Map(), { own: "supplier", partner: "authority" })).toEqual({
      year: 2024, value: 10, largest: null, joint: 0, partner: null, firstActivity: null, lastActivity: null, cuiValid: null, country: null,
    });
  });
});

describe("the labels of a row (at most three, in order)", () => {
  it("says the record that makes most of a change, capped at 100%, with its channel", () => {
    // A growth of 1000 → 1,500: the largest 2025 record (400) is 80% of it; 300 of 500 would be 60%.
    expect(trendRowLabels({ valueA: 1000, valueB: 1500 }, facts({ value: 1500, largest: { value: 400, src: "contracts" } }), years))
      .toEqual([{ kind: "oneRecord", share: 0.8, src: "contracts" }]);
    // A record bigger than the change itself: 100%.
    expect(trendRowLabels({ valueA: 1000, valueB: 1200 }, facts({ value: 1200, largest: { value: 900, src: "da" } }), years))
      .toEqual([{ kind: "oneRecord", share: 1, src: "da" }]);
    // Under half of the change: nothing.
    expect(trendRowLabels({ valueA: 1000, valueB: 3000 }, facts({ value: 3000, largest: { value: 999, src: "da" } }), years)).toEqual([]);
    // Equal values have no change to explain.
    expect(trendRowLabels({ valueA: 5, valueB: 5 }, facts({ value: 5, largest: { value: 5, src: "da" } }), years)).toEqual([]);
  });

  it("says the first year of a new one or since when it is active, and the later activity of a gone one", () => {
    expect(trendRowLabels({ valueA: 0, valueB: 900 }, facts({ value: 900, firstActivity: "2025-03-01" }), years)).toEqual([{ kind: "firstYear", year: 2025 }]);
    expect(trendRowLabels({ valueA: 0, valueB: 900 }, facts({ value: 900, firstActivity: "2019-03-01" }), years)).toEqual([{ kind: "activeSince", year: 2019 }]);
    expect(trendRowLabels({ valueA: 900, valueB: 0 }, facts({ year: 2024, value: 900, lastActivity: "2026-04-01" }), years)).toEqual([{ kind: "activeIn", year: 2026 }]);
    expect(trendRowLabels({ valueA: 900, valueB: 0 }, facts({ year: 2024, value: 900, lastActivity: "2024-12-01" }), years)).toEqual([]);
  });

  it("says a domestic identity without a valid CUI and a value mostly in consortia, never more than three labels", () => {
    const all = facts({ value: 1000, cuiValid: false, firstActivity: "2025-01-10", largest: { value: 800, src: "contracts" }, joint: 600 });
    expect(trendRowLabels({ valueA: 0, valueB: 1000 }, all, years)).toEqual([
      { kind: "noValidCui" }, { kind: "firstYear", year: 2025 }, { kind: "oneRecord", share: 0.8, src: "contracts" },
    ]);
    // A foreign firm shows its country, not "fără CUI valid"; a joint share of half is "în asociere".
    expect(trendRowLabels({ valueA: 100, valueB: 1100 }, facts({ value: 1100, cuiValid: null, country: "FR", joint: 550 }), years))
      .toEqual([{ kind: "joint", share: 0.5 }]);
    // Unknown identity (no profile): no valid CUI is known.
    expect(trendRowLabels({ valueA: 100, valueB: 1100 }, facts({ value: 1100, cuiValid: null }), years)).toEqual([{ kind: "noValidCui" }]);
  });
});
