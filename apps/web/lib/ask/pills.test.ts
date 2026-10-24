import { describe, expect, it } from "vitest";
import { buildPills, PROFILE_SOURCE_PILL } from "./pills";
import type { AskSpec } from "./spec";

const none = {};
const pills = (spec: AskSpec) => buildPills(spec, none);

// R0: the pills restate what was run, in the words the site binds itself to.
describe("answer pills", () => {
  it("never calls recorded values money spent, nor the risk cloud an anglicism", () => {
    const all = (["table", "stat", "timeseries", "map", "breakdown", "sankey", "network", "trend"] as const)
      .flatMap((block) => pills({ block, measure: "value", dim: "supplier", filters: { authorityId: 1, yearFrom: 2024, yearTo: 2025 } }));
    const profiles = (["distribution", "scatter", "entity_card"] as const).flatMap((block) => pills({ block, measure: "value", dim: "authority", filters: { authorityId: 1 } }));
    expect(pills({ block: "breakdown", measure: "value", filters: {} })[0]).toBe("pe domenii");
    expect(pills({ block: "scatter", measure: "value", dim: "authority", filters: {} })[0]).toBe("risc și valoare");
    for (const text of [...all, ...profiles]) expect(text).not.toMatch(/s-au dus banii|outlier|\bvs\b/);
  });

  it.each([
    ["distribution", { authorityId: 1 }, undefined],
    ["scatter", {}, undefined],
    ["entity_card", {}, undefined],
    ["entity_card", {}, "risk"],
  ] as const)("says a %s profile is the archive of accepted direct acquisitions, whatever the link's stream", (block, filters, rankBy) => {
    for (const dataset of [undefined, "all", "da"] as const) {
      const shown = pills({ block, measure: "value", dim: "authority", filters, ...(dataset ? { dataset } : {}), ...(rankBy ? { rankBy } : {}) });
      expect(shown).toContain(PROFILE_SOURCE_PILL);
      expect(shown.join(" · ")).not.toMatch(/toate sursele|contracte|toți anii/);
    }
  });

  it("keeps the stream pill on a value leader, which runs the transaction ranking", () => {
    expect(pills({ block: "entity_card", rankBy: "value", measure: "value", dim: "supplier", filters: {} })).toContain("toate sursele: achiziții directe + contracte prin proceduri");
  });

  it("names the measure the answer shows: lei where the engine ignores a count or per-inhabitant link", () => {
    expect(pills({ block: "breakdown", measure: "count", filters: {} })).toContain("Total (lei)");
    expect(pills({ block: "network", measure: "count", filters: { authorityId: 1 } })).toContain("Total (lei)");
    expect(pills({ block: "stat", measure: "value_per_capita", filters: {} })).toContain("Total (lei)");
    expect(pills({ block: "stat", measure: "count", filters: {} })).toContain("numărul de înregistrări");
    expect(pills({ block: "table", dim: "authority", measure: "value_per_capita", filters: {} })).toContain("lei / cap de locuitor");
  });

  it("names a ranking without topN the complete one, in pages; top N only where the answer stops at N", () => {
    expect(pills({ block: "table", dim: "supplier", measure: "value", filters: {} }).slice(0, 2)).toEqual(["clasament", "toți furnizorii"]);
    expect(pills({ block: "table", dim: "authority", measure: "value_per_capita", filters: {} })[1]).toBe("toate autoritățile");
    expect(pills({ block: "table", dim: "county", measure: "value", filters: {} })[1]).toBe("toate județele");
    expect(pills({ block: "table", dim: "supplier", measure: "value", topN: 25, filters: {} })[1]).toBe("top 25 de furnizori");
    expect(pills({ block: "trend", dim: "supplier", measure: "value", filters: { yearFrom: 2024, yearTo: 2025 } })[1]).toBe("top 10 furnizori");
  });
});
