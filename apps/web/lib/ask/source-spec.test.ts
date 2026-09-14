import { describe, it, expect } from "vitest";
import { entitySourceSpec, yearSourceLink } from "./source-spec";
import { decodeSpec } from "./permalink";
import type { AskSpec } from "./spec";
describe("exact chart source conditions", () => {
  const spec: AskSpec = {
    block: "timeseries",
    measure: "count",
    dataset: "da",
    filters: {
      yearFrom: 2024,
      yearTo: 2026,
      monthFrom: 5,
      monthTo: 8,
      county: "Cluj",
    },
  };
  it("keeps count-question rows instead of applying the money-query ceiling", () => {
    expect(
      entitySourceSpec(
        { ...spec, block: "table", dim: "supplier" },
        { entityId: "27", name: "Firma" },
      ),
    ).toMatchObject({
      measure: "count",
      dataset: "da",
      filters: { supplierId: 27, county: "Cluj" },
    });
  });
  it("intersects the unchanged period, including month limits, even for coverage-clamped years", () => {
    const original = { ...spec, filters: { ...spec.filters, yearFrom: 2000 } };
    for (const year of [2018, 2025, 2026]) {
      const params = new URL(
        yearSourceLink(original, year),
        "https://example.test",
      ).searchParams;
      expect(decodeSpec(params.get("spec")!)).toEqual(original);
      expect(JSON.parse(params.get("evidence")!)).toEqual({ years: [year] });
      expect(params.get("drill")).toBe("1");
    }
  });
});
