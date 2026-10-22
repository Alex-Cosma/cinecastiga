import { describe, expect, it } from "vitest";
import { resolvedSpec } from "./resolved-spec";
import { validateSpec, type AskSpec } from "./spec";

describe("saved question identity", () => {
  it("accepts exact-ID source and comparison links without requiring ambiguous names", () => {
    for (const spec of [
      { block: "network", measure: "value", filters: { supplierId: 27 } },
      {
        block: "compare",
        measure: "value",
        filters: { supplierId: 27, compareWithId: 42 },
      },
      {
        block: "fact_check",
        measure: "value",
        filters: { supplierId: 27, authorityId: 42 },
      },
    ])
      expect(validateSpec(spec)).not.toHaveProperty("error");
  });
  it("retains both exact comparison identities through validation without mutating the draft", () => {
    const draft: AskSpec = {
      block: "compare",
      measure: "value",
      filters: {
        authorityName: "Comuna Dumbrăvița",
        compareWith: "Comuna Dumbrăvița",
      },
    };
    const applied = resolvedSpec(draft, {
      authority: {
        query: "Comuna Dumbrăvița",
        entityId: "101",
        nameDisplay: "Comuna Dumbrăvița",
        county: "Brașov",
        alternatives: [],
      },
      compare: {
        query: "Comuna Dumbrăvița",
        entityId: "202",
        nameDisplay: "Comuna Dumbrăvița",
        county: "Timiș",
        alternatives: [],
      },
    });
    expect(applied.filters).toMatchObject({
      authorityId: 101,
      compareWithId: 202,
    });
    expect(validateSpec(applied)).toMatchObject({
      filters: { authorityId: 101, compareWithId: 202 },
    });
    expect(draft.filters.authorityId).toBeUndefined();
  });
  it("keeps the county with its Romanian spelling, as people read it", () => {
    const applied = resolvedSpec({ block: "breakdown", measure: "value", filters: { county: "buzau" } }, { county: { query: "buzau", canonical: "Buzau" } });
    expect(applied.filters.county).toBe("Buzău");
    expect(resolvedSpec({ block: "stat", measure: "value", filters: { county: "x" } }, { county: { query: "x", canonical: "Caras-Severin" } }).filters.county).toBe("Caraș-Severin");
  });
});
