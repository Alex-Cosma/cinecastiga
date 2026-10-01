import { describe, expect, it } from "vitest";
import { coverageSources, publicationDay, sourceDay } from "./coverage-summary";
import type { AskSpec } from "./ask/spec";

const base: AskSpec = { block: "stat", measure: "value", dataset: "all", filters: {} };
describe("coverage matches the answer's actual source population", () => {
  it("keeps TED separate from mixed procurement answers", () => {
    expect(coverageSources()).toEqual(["da", "contracts", "ted"]);
    expect(coverageSources(base)).toEqual(["da", "contracts"]);
    expect(coverageSources({ ...base, dataset: "contracts" })).toEqual(["contracts"]);
    expect(coverageSources({ ...base, dataset: "da" })).toEqual(["da"]);
  });
  it("uses only direct acquisitions for historical risk, but both streams for value leaders", () => {
    expect(coverageSources({ ...base, block: "entity_card", rankBy: "risk" })).toEqual(["da"]);
    expect(coverageSources({ ...base, block: "entity_card", rankBy: "value" })).toEqual(["da", "contracts"]);
    expect(coverageSources({ ...base, block: "compare" })).toEqual(["da"]);
    expect(coverageSources({ ...base, block: "compare", comparisonMode: "transactions" })).toEqual(["da", "contracts"]);
  });
  it("does not manufacture narrower archive coverage from an institution or year filter", () => {
    expect(coverageSources({ ...base, filters: { authorityId: 42, yearFrom: 2025, yearTo: 2025 } })).toEqual(["da", "contracts"]);
  });
  it("distinguishes source calendar days from publication instants at the Romanian year boundary", () => {
    expect(sourceDay("2025-12-31")).toBe("31.12.2025");
    expect(publicationDay("2025-12-31T23:30:00Z")).toBe("01.01.2026");
    expect(publicationDay(null)).toBe("dată necunoscută");
    expect(sourceDay(null)).toBe("dată necunoscută");
  });
});
