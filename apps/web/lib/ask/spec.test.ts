import { describe, expect, it } from "vitest";
import { validateSpec, MAX_TOP_N } from "./spec";

describe("validateSpec", () => {
  it("accepts a minimal stat spec", () => {
    const s = validateSpec({ block: "stat", measure: "value", filters: {} });
    expect(s).toEqual({ block: "stat", measure: "value", filters: {} });
  });

  it("rejects unknown block / measure", () => {
    expect(validateSpec({ block: "pie", measure: "value", filters: {} })).toHaveProperty("error");
    expect(validateSpec({ block: "stat", measure: "avg", filters: {} })).toHaveProperty("error");
  });

  it("defaults table dim to authority and caps topN", () => {
    const s = validateSpec({ block: "table", measure: "value", topN: 999, filters: {} });
    expect(s).toMatchObject({ dim: "authority", topN: MAX_TOP_N });
  });

  it("rejects per-capita over non-authority dims", () => {
    const s = validateSpec({
      block: "table",
      dim: "supplier",
      measure: "value_per_capita",
      filters: {},
    });
    expect(s).toHaveProperty("error");
  });

  it("swaps inverted year range and drops junk filters", () => {
    const s = validateSpec({
      block: "timeseries",
      measure: "value",
      filters: { yearFrom: 2024, yearTo: 2019, cpvTerm: "", county: 42, bogus: "x" },
    });
    expect(s).toMatchObject({ filters: { yearFrom: 2019, yearTo: 2024 } });
    expect((s as { filters: object }).filters).not.toHaveProperty("cpvTerm");
    expect((s as { filters: object }).filters).not.toHaveProperty("county");
  });

  it("requires a focal entity for entity-centric blocks", () => {
    expect(validateSpec({ block: "sankey", measure: "value", filters: {} })).toHaveProperty("error");
    expect(validateSpec({ block: "network", measure: "value", filters: {} })).toHaveProperty("error");
    expect(
      validateSpec({ block: "distribution", measure: "value", filters: {} }),
    ).toHaveProperty("error");
    expect(
      validateSpec({ block: "sankey", measure: "value", filters: { authorityName: "Comuna X" } }),
    ).not.toHaveProperty("error");
  });

  it("requires both sides for compare and fact_check", () => {
    expect(
      validateSpec({ block: "compare", measure: "value", filters: { authorityName: "X" } }),
    ).toHaveProperty("error");
    expect(
      validateSpec({
        block: "compare",
        measure: "value",
        filters: { authorityName: "X", compareWith: "Y" },
      }),
    ).not.toHaveProperty("error");
    expect(
      validateSpec({ block: "fact_check", measure: "value", filters: { authorityName: "X" } }),
    ).toHaveProperty("error");
    expect(
      validateSpec({
        block: "fact_check",
        measure: "value",
        filters: { authorityName: "X", supplierName: "Y" },
      }),
    ).not.toHaveProperty("error");
  });

  it("defaults entity_card/scatter dim to authority (county not allowed)", () => {
    expect(
      validateSpec({ block: "entity_card", dim: "county", measure: "value", filters: {} }),
    ).toMatchObject({ dim: "authority" });
    expect(validateSpec({ block: "scatter", measure: "value", filters: {} })).toMatchObject({
      dim: "authority",
    });
  });

  it("accepts uatSiruta + uatName, drops uatName without siruta", () => {
    const ok = validateSpec({
      block: "stat",
      measure: "value",
      filters: { uatSiruta: 45539, uatName: "com. Brăești (Buzău)" },
    });
    expect(ok).toMatchObject({
      filters: { uatSiruta: 45539, uatName: "com. Brăești (Buzău)" },
    });
    const orphan = validateSpec({
      block: "stat",
      measure: "value",
      filters: { uatName: "com. Brăești" },
    });
    expect((orphan as { filters: object }).filters).not.toHaveProperty("uatName");
    const bad = validateSpec({
      block: "stat",
      measure: "value",
      filters: { uatSiruta: -3 },
    });
    expect((bad as { filters: object }).filters).not.toHaveProperty("uatSiruta");
  });

  it("accepts dataset and auto-switches to contracts on singleBidder", () => {
    const c = validateSpec({ block: "stat", measure: "value", dataset: "contracts", filters: {} });
    expect(c).toMatchObject({ dataset: "contracts" });
    const da = validateSpec({ block: "stat", measure: "value", filters: {} });
    expect(da).not.toHaveProperty("dataset");
    const sb = validateSpec({
      block: "table",
      measure: "value",
      filters: { singleBidder: true },
    });
    expect(sb).toMatchObject({ dataset: "contracts", filters: { singleBidder: true } });
    expect(
      validateSpec({ block: "stat", measure: "value", dataset: "ted", filters: {} }),
    ).toHaveProperty("error");
  });

  it("keeps only known authorityKind values", () => {
    const ok = validateSpec({
      block: "table",
      measure: "value",
      filters: { authorityKind: "comuna" },
    });
    expect(ok).toMatchObject({ filters: { authorityKind: "comuna" } });
    const bad = validateSpec({
      block: "table",
      measure: "value",
      filters: { authorityKind: "minister" },
    });
    expect((bad as { filters: object }).filters).not.toHaveProperty("authorityKind");
  });
});
