import { describe, expect, it } from "vitest";
import { ASK_ROLLUP_DA_CEILING } from "@seap/db";
import { DA_PLAFOND_RON } from "./compile";
import { predicateContext } from "./predicates";
import { planRollup, ROLLUP_CTX_KEYS, sameRoleExclusions, type RollupCtx } from "./rollups";
import type { DbSql } from "@seap/db";

/** The institutions of the kind "spital", as authorityKindIds reads them (D1). */
const HOSPITALS = ["7", "8"];
/** PredicateCtx of a national question over both channels and every year, without sql. */
const national: RollupCtx = {
  plafond: "da-branch", population: null, minimumRecords: null, cpvPrefixes: [], cpvExclude: [], county: null, kind: null, kindIds: null,
  authorityId: null, supplierId: null, uatSiruta: null, uatAuthorityIds: [], singleBidder: false,
  minEmployees: null, maxEmployees: null, yearFrom: null, yearTo: null, monthFrom: null, monthTo: null, trendMonths: null, seriesMonths: null,
  adminSupplierIds: null, comparison: null, purchaseKind: null, procedure: null, purchaseValueMin: null, purchaseValueMax: null,
  firmSeat: null, seatCounty: null, seatColumn: true, shared: null,
  newFirms: null, mainClient: false, dominantSupplier: false, buyerIds: [], winners: null,
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

  // F2: the trend's same months (owner-D2-rollups: the live national query is over the bar).
  it("reads a trend's same months from agg_entity_month, once it is built, for one role", () => {
    const months = (ctx: Partial<RollupCtx>, need: Parameters<typeof planRollup>[1], built = true) => {
      const plan = planRollup({ ...national, yearFrom: 2025, yearTo: 2026, trendMonths: [1, 5], ...ctx }, need, { months: built });
      return "reason" in plan ? plan.reason : { ...plan.source, months: plan.filters.months };
    };
    expect(months({}, { by: "supplier" })).toEqual({ table: "entityMonth", role: "supplier", months: [1, 5] });
    expect(months({ county: "Cluj", minEmployees: 1, maxEmployees: 9 }, { by: "supplier" })).toEqual({ table: "entityMonth", role: "supplier", months: [1, 5] });
    expect(months({ kind: "spital", kindIds: HOSPITALS }, { by: "authority" })).toEqual({ table: "entityMonth", role: "authority", months: [1, 5] });
    // Before the first build with it, and wherever the month table cannot answer: the live query.
    expect(months({}, { by: "supplier" }, false)).toBe("months: agg_entity_month is not built");
    // Counties without an entity condition: agg_county_month (the live county query was 3–6 s nationally).
    expect(months({}, { by: "county" })).toEqual({ table: "countyMonth", months: [1, 5] });
    expect(months({ county: "Cluj" }, { by: "county" })).toEqual({ table: "countyMonth", months: [1, 5] });
    for (const [ctx, need] of [
      [{ kind: "spital", kindIds: HOSPITALS }, { by: "county" }], [{ cpvPrefixes: ["45"] }, { by: "county" }],
      [{ kind: "spital", kindIds: HOSPITALS }, { by: "supplier" }], [{ cpvPrefixes: ["45"] }, { by: "supplier" }],
      [{ minimumRecords: { role: "supplier", count: 2 } }, { by: "supplier" }], [{}, { by: "total" }],
    ] as const) expect(months(ctx, need)).toBe("months: agg_entity_month holds one role and agg_county_month none, without CPV or a threshold");
    // Whole years (no window) keep the yearly rollups.
    expect(planRollup({ ...national, yearFrom: 2025, yearTo: 2026 }, { by: "supplier" }, { months: true })).toMatchObject({ source: { table: "entity", role: "supplier" }, filters: { months: null } });
  });

  it("answers F3's purchase kind as a condition on the code, and leaves the procedure and the size live", () => {
    // The kind is a CPV condition: totals, years, counties and breakdowns on agg_cpv_year, with the kind in the plan.
    expect(planRollup({ ...national, purchaseKind: "lucrari" }, { by: "total" })).toMatchObject({ source: { table: "cpv" }, filters: { purchaseKind: "lucrari" } });
    expect(source({ purchaseKind: "servicii", cpvPrefixes: ["50"] }, { by: "cpv" })).toEqual({ table: "cpv" });
    // An entity ranking or a condition on an entity has no code in its rollup.
    expect(source({ purchaseKind: "lucrari" }, { by: "supplier" })).toBe("CPV with an entity ranking: not in the rollups");
    expect(source({ purchaseKind: "lucrari", minEmployees: 1, maxEmployees: 9 }, { by: "total" })).toBe("CPV with an entity condition: not in the rollups");
    expect(planRollup({ ...national, purchaseKind: "lucrari", trendMonths: [1, 5] }, { by: "supplier" }, { months: true }))
      .toEqual({ reason: "months: agg_entity_month holds one role and agg_county_month none, without CPV or a threshold" });
    // The procedure and the whole value are columns of the contract rows the rollups do not keep.
    expect(source({ plafond: "none", procedure: "deschisa" }, { by: "total" })).toBe("procedure: not in the rollups");
    expect(source({ purchaseValueMin: 1_000_000 }, { by: "total" })).toBe("purchase value: the whole value is not in the rollups");
    expect(source({ purchaseValueMax: 10_000 }, { by: "supplier" })).toBe("purchase value: the whole value is not in the rollups");
  });

  it("fails closed on a condition it does not know (a key of a later stage)", () => {
    // Keys of the filter registry that are not in the rollups: refused while they hold a value…
    for (const [key, value] of Object.entries({ registeredFrom: 2024, firmAgeFrom: 2024, localAdminIds: ["1"] }))
      expect([key, source({ [key]: value }, { by: "supplier" })]).toEqual([key, `${key}: a condition the rollups do not know`]);
    // …and ignored when they hold none.
    for (const value of [null, undefined, false, []])
      expect(source({ registeredFrom: value }, { by: "supplier" })).toEqual({ table: "entity", role: "supplier" });
  });

  it("reads the engine's own context: predicateContext writes exactly the keys it knows", () => {
    // runSpec and runRows pass predicateContext(…) as it is: a key added there is refused
    // by planRollup (it fails closed) until it is mapped and named in ROLLUP_CTX_KEYS.
    const ctx = predicateContext({} as DbSql, { block: "stat", measure: "value", filters: {} }, {}, { dataset: "all", yearFrom: null, yearTo: null, kindIds: null, seat: true });
    expect(Object.keys(ctx).sort()).toEqual([...ROLLUP_CTX_KEYS].sort());
    expect(planRollup(ctx, { by: "total" })).toEqual({ source: { table: "cpv" }, filters: expect.objectContaining({ dataset: "all" }) });
  });

  it("knows every key of the context, and each one either reaches the plan or refuses it", () => {
    // A full context literal: TypeScript requires every RollupCtx key, the list must name them all.
    expect(Object.keys(national).sort()).toEqual(ROLLUP_CTX_KEYS.filter((key) => key !== "sql").sort());
    const active: { [K in keyof RollupCtx]: RollupCtx[K] } = {
      plafond: "strict", population: without("supplier", "9"), minimumRecords: { role: "supplier", count: 2 }, cpvPrefixes: ["33"],
      cpvExclude: ["3361"], county: "Cluj", kind: "spital", kindIds: HOSPITALS, authorityId: "1", supplierId: "2", uatSiruta: 1, uatAuthorityIds: ["3"],
      singleBidder: true, minEmployees: 1, maxEmployees: 9, yearFrom: 2024, yearTo: 2025, monthFrom: 1, monthTo: 6, trendMonths: [1, 5], seriesMonths: [1, 5],
      adminSupplierIds: ["4"], comparison: { role: "supplier", focalId: "2", compareId: "5" },
      purchaseKind: "lucrari", procedure: "deschisa", purchaseValueMin: 1_000_000, purchaseValueMax: 2_000_000,
      firmSeat: "other", seatCounty: "Cluj", seatColumn: true, shared: ["6"],
      newFirms: { scope: "archive", since: 2024 }, mainClient: true, dominantSupplier: true, buyerIds: ["7"], winners: { suppliers: ["8"], authorities: null },
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
        minEmployees: reached.employees?.min === 1, maxEmployees: reached.employees?.max === 9, yearFrom: reached.yearFrom === 2024, yearTo: reached.yearTo === 2025, purchaseKind: reached.purchaseKind === "lucrari",
        firmSeat: reached.seat?.firmSeat === "other", seatCounty: reached.seat?.county === "Cluj",
        // Which column the seat keys read is no condition: alone it plans as a national question.
        seatColumn: reached.seat === null,
        // F5: a firm's own year on the rollup's firm id; the buyer's identities alone are no condition (its relations refuse).
        newFirms: reached.newFirms?.scope === "archive" && reached.newFirms.since === 2024,
        buyerIds: reached.employees === null && reached.newFirms === null,
      };
      expect([key, mapped[key]]).toEqual([key, true]);
    }
  });
});

describe("«Scoate din calcul» on the national ranking (sameRoleExclusions, F4)", () => {
  const out = (field: "authority" | "supplier", values: string[], op: "not_in" | "in" = "not_in") => ({ field, op, values });
  it("reads the ids a population leaves out when it only leaves out entities of the ranked role", () => {
    expect(sameRoleExclusions({ operator: "and", groups: [{ operator: "and", conditions: [out("supplier", ["1", "2"])] }, { operator: "and", conditions: [out("supplier", ["2", "3"])] }] }, "supplier"))
      .toEqual(["1", "2", "3"]);
    // A single group reads the same under either operator.
    expect(sameRoleExclusions({ operator: "or", groups: [{ operator: "and", conditions: [out("authority", ["7"])] }] }, "authority")).toEqual(["7"]);
  });
  it("is null for anything else: the other role, an included list, «SAU» between groups or conditions, no population", () => {
    expect(sameRoleExclusions(null, "supplier")).toBeNull();
    expect(sameRoleExclusions({ operator: "and", groups: [{ operator: "and", conditions: [out("supplier", ["1"]), out("authority", ["7"])] }] }, "supplier")).toBeNull();
    expect(sameRoleExclusions({ operator: "and", groups: [{ operator: "and", conditions: [out("authority", ["7"])] }] }, "supplier")).toBeNull();
    expect(sameRoleExclusions({ operator: "and", groups: [{ operator: "and", conditions: [out("supplier", ["1"], "in")] }] }, "supplier")).toBeNull();
    expect(sameRoleExclusions({ operator: "or", groups: [{ operator: "and", conditions: [out("supplier", ["1"])] }, { operator: "and", conditions: [out("supplier", ["2"])] }] }, "supplier")).toBeNull();
    expect(sameRoleExclusions({ operator: "and", groups: [{ operator: "or", conditions: [out("supplier", ["1"]), out("supplier", ["2"])] }] }, "supplier")).toBeNull();
    expect(sameRoleExclusions({ operator: "and", groups: [{ operator: "and", conditions: [out("supplier", ["1"]), { field: "value", op: "gte", value: "10" }] }] }, "supplier")).toBeNull();
  });
});
