import { describe, expect, it } from "vitest";
import type { QueryPopulation } from "../population";
import type { QuestionSpec } from "../question-ui";
import { BLOCK_FILTERS, populationFits } from "./blocks";
import { filterContext } from "./context";
import { advancedConditions, legacyConditions } from "./legacy-conditions";
import { choicesOf } from "./pickers";
import { visibleFilters } from "./registry";
import type { FilterSpec } from "./types";

/*
 * "⋯ › Selecție avansată" (plan §1.1 variant A, kit P9): the precise
 * selection's fields that say more than the sentence, on the questions that
 * apply them. A precise selection the question's window cannot show is an
 * old link's chip instead.
 */

const q = (spec: Partial<QuestionSpec> & { block: string }): FilterSpec => ({ measure: "value", filters: {}, ...spec } as FilterSpec);
const fields = (spec: FilterSpec) => BLOCK_FILTERS[spec.block as keyof typeof BLOCK_FILTERS].advancedFields(spec, filterContext(spec))
  .map((f) => `${f.field}:${f.ops.join("/")}`);
const one = (condition: QueryPopulation["groups"][number]["conditions"][number]): QueryPopulation => ({ operator: "and", groups: [{ operator: "and", conditions: [condition] }] });
const BUYER = { authorityId: 1, authorityName: "Comuna X" }, FIRM = { supplierId: 2, supplierName: "PORR" };

describe("the fields of «Selecție avansată»", () => {
  it("are what the sentence cannot say: lists, several counties, exact days, a winner's share, codes left out", () => {
    expect(fields(q({ block: "table", dim: "supplier" }))).toEqual(["date:gte/lte", "value:gte/lte", "authority:in/not_in", "supplier:in/not_in", "cpv:not_in", "county:in/not_in"]);
    expect(fields(q({ block: "trend", dim: "supplier", filters: { yearFrom: 2024, yearTo: 2025 } }))).toHaveLength(6);
  });

  it("leave out the entity a relation or a verification is about (all or nothing)", () => {
    expect(fields(q({ block: "network", dim: "authority", filters: BUYER }))).toEqual(["date:gte/lte", "value:gte/lte", "supplier:in/not_in", "cpv:not_in"]);
    expect(fields(q({ block: "sankey", dim: "supplier", filters: FIRM }))).toEqual(["date:gte/lte", "value:gte/lte", "authority:in/not_in", "cpv:not_in", "county:in/not_in"]);
    expect(fields(q({ block: "fact_check", filters: { ...BUYER, ...FIRM } }))).toEqual(["date:gte/lte", "value:gte/lte", "cpv:not_in"]);
  });

  it("are none where P9 is not offered: a comparison and the profiles", () => {
    for (const spec of [q({ block: "compare", filters: { ...BUYER, compareWith: "B", compareWithId: 3 } }), q({ block: "scatter", dim: "authority" }),
      q({ block: "distribution", dim: "authority", filters: BUYER }), q({ block: "entity_card", dim: "supplier", rankBy: "risk" })]) expect(fields(spec), spec.block).toEqual([]);
  });

  it("decide whether a precise selection is the window's or a link's chip", () => {
    const buyers = one({ field: "authority", op: "in", values: ["1", "3"] });
    const network = q({ block: "network", dim: "authority", filters: BUYER, population: buyers });
    expect(populationFits(buyers, BLOCK_FILTERS.network.advancedFields(network, filterContext(network)))).toBe(false);
    expect(visibleFilters(network).has("population")).toBe(false);
    expect(advancedConditions(network)).toEqual([]);
    expect(legacyConditions(network).map((c) => c.label)).toEqual(["Din link: doar 2 instituții"]);
    // The same selection on a ranking is "Selecție avansată"'s own.
    const table = q({ block: "table", dim: "supplier", population: buyers });
    expect(advancedConditions(table).map((c) => c.label)).toEqual(["Selecție avansată: doar 2 instituții"]);
    // Labelled exclusions are "Fără X" chips anywhere: they never make a selection a link's.
    expect(populationFits(one({ field: "authority", op: "not_in", values: ["1"], labels: ["Comuna X"] }), [])).toBe(true);
    expect(populationFits(one({ field: "cpv", op: "in", values: ["45"] }), BLOCK_FILTERS.table.advancedFields(table, filterContext(table)))).toBe(false);
  });

  it("offer only the selections the window can show (the contract walk's probes)", () => {
    const network = q({ block: "network", dim: "authority", filters: BUYER });
    const slot = BLOCK_FILTERS.network.advanced(network, filterContext(network))[0]!;
    const offered = choicesOf(slot, network).map((c) => c.value as QueryPopulation | undefined).filter(Boolean);
    expect(offered.length).toBeGreaterThan(0);
    for (const population of offered) expect(populationFits(population, BLOCK_FILTERS.network.advancedFields(network, filterContext(network)))).toBe(true);
  });
});
