import { describe, expect, it } from "vitest";
import { answerVersion } from "../answer-core";
import { validatePopulation, type QueryPopulation } from "../population";
import { questionKey, transitionQuestion, type QuestionSpec } from "../question-ui";
import { validateSpec, type AskSpec } from "../spec";
import { BLOCK_FILTERS } from "./blocks";
import { filterContext } from "./context";
import { describeConditions } from "./describe";
import {
  EXCLUDE_FULL, EXCLUDE_LIMIT, EXCLUDE_OR, EXCLUDE_ORIGIN, MAX_EXCLUDED, excludeEntity, excludedRole, exclusionBlocked, exclusionsAfterSubject,
  exclusionsOf, withExclusion, withoutExclusions,
} from "./exclusions";
import { legacyConditions } from "./legacy-conditions";
import { splitExcluded } from "./origin";
import { restoreLink } from "./restore";
import { chooseQuestion, chooseValue } from "./transition";
import type { FilterSpec } from "./types";

/*
 * "Scoate din calcul" (F4, plan §2.5, §3, §4.2, §4.7, §4.13; kit §5.13): the
 * shape it writes, where the answer's "⋯" offers it, why it is disabled, what
 * a new subject does with it, and that a link, a watch and the words read it
 * back as "Fără X".
 */

const q = (spec: Partial<QuestionSpec> & { block: string }): FilterSpec =>
  transitionQuestion({ measure: "value", filters: {}, ...spec } as QuestionSpec).spec as FilterSpec;
const SYSTRA = { field: "supplier" as const, value: "202", label: "SYSTRA SA" };
const PORR = { field: "supplier" as const, value: "203", label: "PORR SA" };
const firms = q({ block: "table", dim: "supplier", topN: 10 });

describe("the shape «Scoate din calcul» writes", () => {
  it("is a labelled not_in list in a group of exclusions, under AND, read back as «Fără X»", () => {
    const one = withExclusion(undefined, SYSTRA);
    expect(one).toEqual({ operator: "and", groups: [{ operator: "and", conditions: [{ field: "supplier", op: "not_in", values: ["202"], labels: ["SYSTRA SA"] }] }] });
    const two = withExclusion(one, PORR);
    // The second firm joins the same list; an institution, a condition of its own in the same group.
    expect(two.groups).toEqual([{ operator: "and", conditions: [{ field: "supplier", op: "not_in", values: ["202", "203"], labels: ["SYSTRA SA", "PORR SA"] }] }]);
    const mixed = withExclusion(two, { field: "authority", value: "7", label: "CJ Cluj" });
    expect(mixed.groups[0]!.conditions).toHaveLength(2);
    expect(splitExcluded(mixed)).toEqual({ excluded: [SYSTRA, PORR, { field: "authority", value: "7", label: "CJ Cluj" }], rest: undefined });
    for (const p of [one, two, mixed]) expect(validatePopulation(p)).toEqual(p);
    // The same entity twice changes nothing.
    expect(withExclusion(two, SYSTRA)).toEqual(two);
  });

  it("joins a precise selection under AND as a group of its own, and reads a single «SAU» group as AND", () => {
    const precise: QueryPopulation = { operator: "or", groups: [{ operator: "and", conditions: [{ field: "value", op: "gte", value: "1000" }] }] };
    const next = withExclusion(precise, SYSTRA);
    expect(next).toEqual({ operator: "and", groups: [precise.groups[0], { operator: "and", conditions: [{ field: "supplier", op: "not_in", values: ["202"], labels: ["SYSTRA SA"] }] }] });
    expect(splitExcluded(next)).toEqual({ excluded: [SYSTRA], rest: { operator: "and", groups: [precise.groups[0]] } });
    // The input is never changed.
    expect(precise.operator).toBe("or");
    // The chip's × takes it away again, and the precise selection stays as it was.
    expect(withoutExclusions(next, [SYSTRA])).toEqual({ operator: "and", groups: [precise.groups[0]] });
  });
});

describe("where the answer's «⋯» offers it (BLOCK_FILTERS.rowMenu, exclude)", () => {
  const cases: [string, FilterSpec, "authority" | "supplier" | null][] = [
    ["ranking of firms", firms, "supplier"],
    ["ranking of institutions", q({ block: "table", dim: "authority", topN: 10 }), "authority"],
    ["ranking of counties", q({ block: "table", dim: "county", topN: 10 }), null],
    ["«Cine conduce?» by value", q({ block: "entity_card", dim: "supplier", rankBy: "value" }), "supplier"],
    // F6c: nothing to leave out of the group at the top (it is the whole group), but its rows have records and a page.
    ["«Cine conduce?» on the index", q({ block: "entity_card", dim: "supplier", rankBy: "risk" }), null],
    ["trend of firms", q({ block: "trend", dim: "supplier", filters: { yearFrom: 2024, yearTo: 2025 } }), "supplier"],
    ["trend of counties", q({ block: "trend", dim: "county", filters: { yearFrom: 2024, yearTo: 2025 } }), null],
    ["total", q({ block: "stat" }), null],
    // F5: the map leaves out a county card's largest buyer (no row menu: the card's button); not beside a firm.
    ["map", q({ block: "map" }), "authority"],
    ["map of a firm", q({ block: "map", filters: { supplierName: "SYSTRA", supplierId: 7 } }), null],
    ["risk cloud", q({ block: "scatter", dim: "authority" }), null],
  ];
  it.each(cases)("%s", (_name, spec, role) => {
    const ctx = filterContext(spec);
    expect(excludedRole(spec)).toBe(role);
    const tied = spec.block === "entity_card" && ctx.form === "entity_card:risk";
    expect(BLOCK_FILTERS[ctx.block].rowMenu(spec, ctx)).toEqual(role && ctx.block !== "map" ? ["records", "exclude", "entity"] : tied ? ["records", "entity"] : []);
    // Where it is offered, the question it writes runs.
    if (role) expect(validateSpec(excludeEntity(spec, { ...SYSTRA, field: role })!)).not.toHaveProperty("error");
  });
});

describe("when it is shown disabled, with its reason", () => {
  it("at five exclusions, on a link's «SAU», on another page's selection, at the precise selection's limits", () => {
    let spec = firms;
    for (let i = 0; i < MAX_EXCLUDED; i++) {
      expect(exclusionBlocked(spec)).toBeNull();
      spec = excludeEntity(spec, { field: "supplier", value: String(300 + i), label: `Firma ${i}` })!;
    }
    expect(exclusionsOf(spec)).toHaveLength(5);
    expect(exclusionBlocked(spec)).toBe(EXCLUDE_FULL);
    expect(excludeEntity(spec, SYSTRA)).toBeNull();
    // Two groups under «SAU»: one more group would select more, not less.
    const or: FilterSpec = { ...firms, population: { operator: "or", groups: [
      { operator: "and", conditions: [{ field: "value", op: "gte", value: "1000" }] },
      { operator: "and", conditions: [{ field: "cpv", op: "in", values: ["45"] }] },
    ] } };
    expect(exclusionBlocked(or)).toBe(EXCLUDE_OR);
    // A relationship's pairs (connection-evidence-shared.ts): another page's selection keeps its label.
    const relation: FilterSpec = { ...firms, population: { operator: "or", groups: [
      { operator: "and", conditions: [{ field: "authority", op: "in", values: ["1"] }, { field: "supplier", op: "in", values: ["2"] }] },
    ] } };
    expect(exclusionBlocked(relation)).toBe(EXCLUDE_ORIGIN);
    // Eight groups already (validatePopulation's limit) and none of exclusions.
    const full: FilterSpec = { ...firms, population: { operator: "and", groups: Array.from({ length: 8 }, (_, i) => ({ operator: "and" as const, conditions: [{ field: "value" as const, op: "gte" as const, value: String(i) }] })) } };
    expect(exclusionBlocked(full)).toBe(EXCLUDE_LIMIT);
  });
});

describe("a new subject, another question, a link, a watch", () => {
  const without = excludeEntity(firms, SYSTRA)!;

  it("a ranking of firms that becomes one of institutions or counties leaves its firms' exclusions, with a note", () => {
    for (const dim of ["authority", "county"] as const) {
      const to = chooseValue(without, { id: "dim", picker: "subject" }, { filter: "dim", value: { dim } });
      expect([dim, to.spec.population]).toEqual([dim, undefined]);
      expect(to.notes).toContain(`Am scos „fără SYSTRA SA”: întrebarea nu mai e despre firme.`);
      expect(to.dropped).toContain("population");
    }
    // An exclusion of the other side (a firm on a ranking of institutions, from "Selecție avansată") stays.
    const institutions = excludeEntity(q({ block: "table", dim: "authority", topN: 10 }), { field: "authority", value: "7", label: "CJ Cluj" })!;
    const both: FilterSpec = { ...institutions, population: withExclusion(institutions.population, SYSTRA) };
    const to = chooseValue(both, { id: "dim", picker: "subject" }, { filter: "dim", value: { dim: "supplier" } });
    expect(splitExcluded(to.spec.population).excluded).toEqual([SYSTRA]);
    expect(to.dropped).toContain("exclude");
  });

  it("another question keeps them wherever a precise selection applies; the index sets them aside", () => {
    expect(chooseQuestion(without, "stat").spec.population).toEqual(without.population);
    expect(chooseQuestion(without, "trend").spec.population).toEqual(without.population);
    const leader = excludeEntity(q({ block: "entity_card", dim: "supplier", rankBy: "value" }), SYSTRA)!;
    const risk = chooseValue(leader, { id: "rankBy" }, { filter: "rankBy", value: "risk" });
    expect(risk.parked?.items.map((item) => item.id)).toContain("population");
  });

  it("a link opens clean with its «Fără X» chips and runs; its words never say «Selecție precisă»", () => {
    const restored = restoreLink(without);
    // The notes of the question itself (a firm's county is its seat, F4), none of its own.
    expect(restored).toMatchObject({ kind: "draft", run: true, notes: (restoreLink(firms) as { notes: string[] }).notes });
    if (restored.kind !== "draft") throw new Error("draft expected");
    expect(questionKey(restored.spec)).toBe(questionKey(without));
    expect(legacyConditions(restored.spec)).toEqual([]);
    const words = describeConditions(without);
    expect([words.tail, words.totalWords, words.caveats]).toEqual(["fără SYSTRA SA", ["fără SYSTRA SA"], ["Scoase din calcul: firma SYSTRA SA."]]);
    expect(JSON.stringify(words.pills)).not.toContain("Selecție precisă");
  });

  it("changes no answer version: a watch on a ranking with an exclusion gets no methodology alert of its own (plan §2.8)", () => {
    // The same rows and totals as before F4 (the fast path's parity: exclusions.integration.test.ts): the question's versions only.
    const trend = q({ block: "trend", dim: "supplier", filters: { yearFrom: 2024, yearTo: 2025 } });
    for (const spec of [firms, trend, q({ block: "table", dim: "authority", topN: 10 })])
      expect(answerVersion(excludeEntity(spec, { ...SYSTRA, field: excludedRole(spec)! })! as unknown as AskSpec)).toEqual(answerVersion(spec as unknown as AskSpec));
  });
});
