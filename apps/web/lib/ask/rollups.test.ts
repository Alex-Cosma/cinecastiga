import { describe, expect, it } from "vitest";
import { ASK_ROLLUP_DA_CEILING } from "@seap/db";
import { DA_PLAFOND_RON } from "./compile";
import { predicateContext } from "./predicates";
import { planRollup, ROLLUP_CTX_KEYS, type RollupCtx } from "./rollups";
import type { DbSql } from "@seap/db";

/** The institutions of the kind "spital", as authorityKindIds reads them (D1). */
const HOSPITALS = ["7", "8"];
/** PredicateCtx of a national question over both channels and every year, without sql. */
const national: RollupCtx = {
  plafond: "da-branch", population: null, minimumRecords: null, cpvPrefixes: [], cpvExclude: [], county: null, kind: null, kindIds: null,
  authorityId: null, supplierId: null, uatSiruta: null, uatAuthorityIds: [], singleBidder: false,
  minEmployees: null, maxEmployees: null, yearFrom: null, yearTo: null, monthFrom: null, monthTo: null,
  adminSupplierIds: null, comparison: null,
};
const source = (ctx: Partial<RollupCtx> & Record<string, unknown>, need: Parameters<typeof planRollup>[1]) => {
  const plan = planRollup({ ...national, ...ctx }, need);
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
    expect(source({ kind: "spital", kindIds: HOSPITALS }, { by: "authority" })).toEqual({ table: "entity", role: "authority" });
    expect(source({ minimumRecords: { role: "authority", count: 5 } }, { by: "authority" })).toEqual({ table: "entity", role: "authority" });
  });

  it("uses the pair rollup when a condition or threshold is on the other role", () => {
    expect(source({ kind: "spital", kindIds: HOSPITALS, yearFrom: 2024, yearTo: 2025 }, { by: "supplier" })).toEqual({ table: "pair" });
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
    expect(source({ kind: "spital", kindIds: HOSPITALS }, { by: "total" })).toEqual({ table: "entity", role: "authority" });
    expect(source({ minEmployees: 1 }, { by: "county" })).toEqual({ table: "entity", role: "supplier" });
    expect(source({ population: without("supplier", "2115381") }, { by: "total" })).toEqual({ table: "pair" });
    expect(source({ kind: "spital", kindIds: HOSPITALS, minEmployees: 1 }, { by: "total" })).toEqual({ table: "pair" });
  });

  it("reads the channel from the plafond, as predicateContext writes it", () => {
    const plan = (plafond: RollupCtx["plafond"]) => planRollup({ ...national, plafond }, { by: "total" });
    expect([plan("da-branch"), plan("strict"), plan("none")].map((p) => "filters" in p && p.filters.dataset)).toEqual(["all", "da", "contracts"]);
  });

  it("leaves to the live query what the rollups cannot answer exactly", () => {
    expect(source({ monthFrom: 1, monthTo: 6, yearFrom: 2025, yearTo: 2025 }, { by: "total" })).toMatch(/^months/);
    expect(source({ plafond: "none", singleBidder: true }, { by: "supplier" })).toMatch(/^single bidder/);
    expect(source({ authorityId: "2146445" }, { by: "supplier" })).toMatch(/^named entity/);
    expect(source({ supplierId: "2115381" }, { by: "total" })).toMatch(/^named entity/);
    expect(source({ uatSiruta: 54975, uatAuthorityIds: ["1"] }, { by: "total" })).toMatch(/^named entity/);
    expect(source({ adminSupplierIds: ["1"] }, { by: "supplier" })).toMatch(/^named entity/);
    expect(source({ comparison: { role: "supplier", focalId: "1", compareId: "2" } }, { by: "total" })).toMatch(/^comparison/);
    expect(source({ cpvPrefixes: ["3366"] }, { by: "supplier" })).toMatch(/^CPV with an entity ranking/);
    expect(source({ cpvPrefixes: ["3366"], kind: "spital", kindIds: HOSPITALS }, { by: "total" })).toMatch(/^CPV with an entity condition/);
    expect(source({ kind: "spital", kindIds: HOSPITALS }, { by: "cpv" })).toMatch(/^CPV with an entity condition/);
    const include = { operator: "and" as const, groups: [{ operator: "and" as const, conditions: [{ field: "supplier" as const, op: "in" as const, values: ["1"] }] }] };
    expect(source({ population: include }, { by: "authority" })).toMatch(/^population/);
    const bound = { operator: "and" as const, groups: [{ operator: "and" as const, conditions: [{ field: "value" as const, op: "lte" as const, value: "1000" }] }] };
    expect(source({ population: bound }, { by: "total" })).toMatch(/^population/);
    const either = { operator: "or" as const, groups: [without("supplier", "1").groups[0]!, without("authority", "2").groups[0]!] };
    expect(source({ population: either }, { by: "supplier" })).toMatch(/^population/);
    // A kind without its list of institutions (local_admin reaches the engine as a list of ids, F5), or one the caller did not read.
    expect(source({ kind: "local_admin" as RollupCtx["kind"] }, { by: "authority" })).toMatch(/^kind local_admin/);
    expect(source({ kind: "spital" }, { by: "authority" })).toMatch(/^kind spital: no list of institutions/);
  });

  it("fails closed on a condition it does not know (a key of a later stage)", () => {
    // Keys of the filter registry that are not in the rollups: refused while they hold a value…
    for (const [key, value] of Object.entries({ seatCounty: "Cluj", firmSeat: "other", registeredFrom: 2024, mainClient: true, procedure: ["open"], localAdminIds: ["1"] }))
      expect([key, source({ [key]: value }, { by: "supplier" })]).toEqual([key, `${key}: a condition the rollups do not know`]);
    // …and ignored when they hold none.
    for (const value of [null, undefined, false, []])
      expect(source({ seatCounty: value }, { by: "supplier" })).toEqual({ table: "entity", role: "supplier" });
  });

  it("reads the engine's own context: predicateContext writes exactly the keys it knows", () => {
    // runSpec and runRows pass predicateContext(…) as it is: a key added there is refused
    // by planRollup (it fails closed) until it is mapped and named in ROLLUP_CTX_KEYS.
    const ctx = predicateContext({} as DbSql, { block: "stat", measure: "value", filters: {} }, {}, { dataset: "all", yearFrom: null, yearTo: null, kindIds: null });
    expect(Object.keys(ctx).sort()).toEqual([...ROLLUP_CTX_KEYS].sort());
    expect(planRollup(ctx, { by: "total" })).toEqual({ source: { table: "cpv" }, filters: expect.objectContaining({ dataset: "all" }) });
  });

  it("knows every key of the context, and each one either reaches the plan or refuses it", () => {
    // A full context literal: TypeScript requires every RollupCtx key, the list must name them all.
    expect(Object.keys(national).sort()).toEqual(ROLLUP_CTX_KEYS.filter((key) => key !== "sql").sort());
    const active: { [K in keyof RollupCtx]: RollupCtx[K] } = {
      plafond: "strict", population: without("supplier", "9"), minimumRecords: { role: "supplier", count: 2 }, cpvPrefixes: ["33"],
      cpvExclude: ["3361"], county: "Cluj", kind: "spital", kindIds: HOSPITALS, authorityId: "1", supplierId: "2", uatSiruta: 1, uatAuthorityIds: ["3"],
      singleBidder: true, minEmployees: 1, maxEmployees: 9, yearFrom: 2024, yearTo: 2025, monthFrom: 1, monthTo: 6,
      adminSupplierIds: ["4"], comparison: { role: "supplier", focalId: "2", compareId: "5" },
    };
    for (const key of Object.keys(active) as (keyof RollupCtx)[]) {
      // The kind comes with its institutions; their list alone is no condition.
      const plan = planRollup({ ...national, [key]: active[key], ...(key === "kind" ? { kindIds: active.kindIds } : {}) }, { by: "authority" });
      if ("reason" in plan) continue;
      const reached = { ...plan.filters, cpvPrefixes: plan.filters.cpvPrefixes.length > 0, cpvExclude: plan.filters.cpvExclude.length > 0 };
      const mapped: Record<string, unknown> = {
        plafond: reached.dataset === "da", population: reached.excludeSuppliers.length > 0, minimumRecords: reached.minimum !== null,
        cpvPrefixes: reached.cpvPrefixes, cpvExclude: reached.cpvExclude, county: reached.county === "Cluj",
        kind: reached.kind === "spital" && reached.kindIds === HOSPITALS, kindIds: reached.kind === null && reached.kindIds === null,
        minEmployees: reached.employees?.min === 1, maxEmployees: reached.employees?.max === 9, yearFrom: reached.yearFrom === 2024, yearTo: reached.yearTo === 2025,
      };
      expect([key, mapped[key]]).toEqual([key, true]);
    }
  });
});
