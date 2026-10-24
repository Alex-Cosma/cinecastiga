import { describe, expect, it } from "vitest";
import { ASK_ROLLUP_DA_CEILING } from "@seap/db";
import { DA_PLAFOND_RON, KIND_PATTERNS } from "./compile";
import { planRollup, type RollupParts } from "./rollups";

const national: RollupParts = {
  dataset: "all", yearFrom: null, yearTo: null, monthFrom: null, monthTo: null, county: null,
  cpvPrefixes: [], cpvExclude: [], kindPatterns: null, authorityId: null, supplierId: null, uatSiruta: null,
  adminSupplierIds: null, minEmployees: null, maxEmployees: null, singleBidder: false,
};
const source = (parts: Partial<RollupParts>, need: Parameters<typeof planRollup>[1]) => {
  const plan = planRollup({ ...national, ...parts }, need);
  return "reason" in plan ? plan.reason : plan.source;
};
const without = (role: "authority" | "supplier", id: string) => ({ operator: "and" as const, groups: [{ operator: "and" as const, conditions: [{ field: role, op: "not_in" as const, values: [id] }] }] });

describe("which rollup answers a selection (24 Oct 2026 slow cases)", () => {
  it("builds the rollups with the engine's DA ceiling", () => {
    expect(ASK_ROLLUP_DA_CEILING).toBe(DA_PLAFOND_RON);
  });

  it("ranks one role from agg_entity_year when every condition is on that role", () => {
    // trends (national, Cluj), the paged ranking, one firm left out, firms with 1–9 employees
    expect(source({ yearFrom: 2024, yearTo: 2025 }, { by: "supplier" })).toEqual({ table: "entity", role: "supplier" });
    expect(source({ county: "Cluj", yearFrom: 2024, yearTo: 2025 }, { by: "supplier" })).toEqual({ table: "entity", role: "supplier" });
    expect(source({ population: without("supplier", "2115381") }, { by: "supplier" })).toEqual({ table: "entity", role: "supplier" });
    expect(source({ minEmployees: 1, maxEmployees: 9 }, { by: "supplier" })).toEqual({ table: "entity", role: "supplier" });
    expect(source({ kindPatterns: KIND_PATTERNS.spital }, { by: "authority" })).toEqual({ table: "entity", role: "authority" });
    expect(source({ minimumRecords: { role: "authority", count: 5 } }, { by: "authority" })).toEqual({ table: "entity", role: "authority" });
  });

  it("uses the pair rollup when a condition or threshold is on the other role", () => {
    expect(source({ kindPatterns: KIND_PATTERNS.spital, yearFrom: 2024, yearTo: 2025 }, { by: "supplier" })).toEqual({ table: "pair" });
    expect(source({ minimumRecords: { role: "supplier", count: 5 } }, { by: "authority" })).toEqual({ table: "pair" });
    expect(source({ minEmployees: 1, maxEmployees: 9 }, { by: "authority" })).toEqual({ table: "pair" });
    expect(source({ population: without("authority", "1") }, { by: "supplier" })).toEqual({ table: "pair" });
  });

  it("reads totals without entity conditions, and every breakdown, from agg_cpv_year", () => {
    expect(source({}, { by: "cpv" })).toEqual({ table: "cpv" });
    expect(source({ county: "Cluj", yearFrom: 2023, yearTo: 2025 }, { by: "cpv" })).toEqual({ table: "cpv" });
    expect(source({ yearFrom: 2025, yearTo: 2025 }, { by: "total" })).toEqual({ table: "cpv" });
    expect(source({ cpvPrefixes: ["3366"] }, { by: "total" })).toEqual({ table: "cpv" });
    expect(source({}, { by: "county" })).toEqual({ table: "cpv" });
  });

  it("keeps unknown ids on an exclusion total, so those come from the pair rows", () => {
    expect(source({ kindPatterns: KIND_PATTERNS.spital }, { by: "total" })).toEqual({ table: "entity", role: "authority" });
    expect(source({ minEmployees: 1 }, { by: "county" })).toEqual({ table: "entity", role: "supplier" });
    expect(source({ population: without("supplier", "2115381") }, { by: "total" })).toEqual({ table: "pair" });
    expect(source({ kindPatterns: KIND_PATTERNS.spital, minEmployees: 1 }, { by: "total" })).toEqual({ table: "pair" });
  });

  it("leaves to the live query what the rollups cannot answer exactly", () => {
    expect(source({ monthFrom: 1, monthTo: 6, yearFrom: 2025, yearTo: 2025 }, { by: "total" })).toMatch(/^months/);
    expect(source({ dataset: "contracts", singleBidder: true }, { by: "supplier" })).toMatch(/^single bidder/);
    expect(source({ authorityId: "2146445" }, { by: "supplier" })).toMatch(/^named entity/);
    expect(source({ supplierId: "2115381" }, { by: "total" })).toMatch(/^named entity/);
    expect(source({ uatSiruta: 54975 }, { by: "total" })).toMatch(/^named entity/);
    expect(source({ adminSupplierIds: ["1"] }, { by: "supplier" })).toMatch(/^named entity/);
    expect(source({ cpvPrefixes: ["3366"] }, { by: "supplier" })).toMatch(/^CPV with an entity ranking/);
    expect(source({ cpvPrefixes: ["3366"], kindPatterns: KIND_PATTERNS.spital }, { by: "total" })).toMatch(/^CPV with an entity condition/);
    expect(source({ kindPatterns: KIND_PATTERNS.spital }, { by: "cpv" })).toMatch(/^CPV with an entity condition/);
    const include = { operator: "and" as const, groups: [{ operator: "and" as const, conditions: [{ field: "supplier" as const, op: "in" as const, values: ["1"] }] }] };
    expect(source({ population: include }, { by: "authority" })).toMatch(/^population/);
    const bound = { operator: "and" as const, groups: [{ operator: "and" as const, conditions: [{ field: "value" as const, op: "lte" as const, value: "1000" }] }] };
    expect(source({ population: bound }, { by: "total" })).toMatch(/^population/);
    const either = { operator: "or" as const, groups: [without("supplier", "1").groups[0]!, without("authority", "2").groups[0]!] };
    expect(source({ population: either }, { by: "supplier" })).toMatch(/^population/);
  });

  it("folds the kind patterns as the live filter does", () => {
    const plan = planRollup({ ...national, kindPatterns: KIND_PATTERNS.oras_municipiu }, { by: "authority" });
    expect("filters" in plan && plan.filters.kind).toEqual(["oras%", "ors%", "oras%", "munici%", "primaria %", "primaria %"]);
  });
});
