import { describe, expect, it } from "vitest";
import { BLOCKS, validateSpec } from "./spec";
import { QUESTION_GROUPS, QUESTION_TYPES, defaultQuestion, describeQuestion, periodLabel, questionErrors, questionKey, transitionQuestion, type QuestionSpec } from "./question-ui";

const authority: QuestionSpec = {
  block: "table", dim: "supplier", dataset: "contracts", measure: "value", topN: 7,
  filters: { authorityName: "Comuna Dumbrăvița", authorityId: 811, county: "Timiș", yearFrom: 2024, yearTo: 2025, monthFrom: 3, monthTo: 8, cpvTerm: "mobilier" },
};

describe("the editable question contract", () => {
  it("exposes every production query exactly once, across the four catalogue groups", () => {
    expect(QUESTION_TYPES.map((type) => type.id).sort()).toEqual([...BLOCKS].sort());
    expect(new Set(QUESTION_TYPES.map((type) => type.id)).size).toBe(13);
    expect(QUESTION_GROUPS).toHaveLength(4);
    expect(QUESTION_TYPES.every((type) => QUESTION_GROUPS.some((group) => group.id === type.group))).toBe(true);
  });

  it.each(BLOCKS)("produces an executable %s question once required identities are supplied", (block) => {
    const filters = { ...authority.filters, ...(block === "compare" ? { compareWith: "Comuna Giroc", compareWithId: 922 } : {}), ...(block === "fact_check" ? { supplierName: "Firma verificată", supplierId: 733 } : {}) };
    const { spec } = transitionQuestion({ ...authority, filters }, block);
    expect(questionErrors(spec)).toEqual([]);
    expect(validateSpec(spec)).not.toHaveProperty("error");
    expect(spec.block).toBe(block);
  });

  it("preserves exact identities and every compatible advanced condition", () => {
    const input: QuestionSpec = { ...authority, filters: { ...authority.filters, supplierId: 733, supplierName: "Firma verificată", uatSiruta: 12345, uatName: "Dumbrăvița (Timiș)", singleBidder: true, minEmployees: 0, maxEmployees: 4, adminPersonKey: "test person|1970-01-01|locality", adminName: "Persoana verificată" } };
    const { spec, changes } = transitionQuestion(input, "stat");
    expect(spec.filters).toEqual(input.filters);
    expect(spec.dataset).toBe("contracts");
    expect(spec.topN).toBe(7);
    expect(changes).toEqual([]);
    expect(input.block).toBe("table");
    expect(spec.filters).not.toBe(input.filters);
  });

  it("keeps ID-only deep links executable without replacing an exact identity", () => {
    const { spec } = transitionQuestion({ block: "network", measure: "value", filters: { authorityId: 811 } });
    expect(spec.filters.authorityId).toBe(811);
    expect(spec.filters.authorityName).toBe("Entitatea #811");
    expect(questionErrors(spec)).toEqual([]);
  });

  it("preserves the second comparison ID and clears it with an inactive comparison", () => {
    const input = { ...authority, block: "compare", filters: { ...authority.filters, compareWith: "Comuna Giroc", compareWithId: 922 } };
    expect(transitionQuestion(input).spec.filters).toMatchObject({ authorityId: 811, compareWithId: 922, compareWith: "Comuna Giroc" });
    const next = transitionQuestion(input, "stat");
    expect(next.spec.filters).not.toHaveProperty("compareWithId");
    expect(next.spec.filters).not.toHaveProperty("compareWith");
    expect(next.changes.join(" ")).toContain("a doua entitate");
  });

  it("can reopen a comparison containing only exact IDs", () => {
    const { spec } = transitionQuestion({ block: "compare", measure: "value", dataset: "da", filters: { authorityId: 811, compareWithId: 922 } });
    expect(spec.filters).toEqual({ authorityId: 811, authorityName: "Entitatea #811", compareWithId: 922, compareWith: "Entitatea #922" });
    expect(questionErrors(spec)).toEqual([]);
    expect(validateSpec(spec)).not.toHaveProperty("error");
  });

  it("discloses every ignored profile condition before it can be applied", () => {
    const input: QuestionSpec = { ...authority, filters: { ...authority.filters, compareWith: "Comuna Giroc", compareWithId: 922, uatSiruta: 12345, uatName: "Dumbrăvița", singleBidder: true, minEmployees: 0, maxEmployees: 4, adminName: "Persoana verificată", adminPersonKey: "exact-key" } };
    const { spec, changes } = transitionQuestion(input, "compare");
    expect(spec.dataset).toBe("da");
    expect(spec.filters).toEqual({ authorityName: "Comuna Dumbrăvița", authorityId: 811, compareWith: "Comuna Giroc", compareWithId: 922 });
    const explanation = changes.join(" ");
    for (const label of ["întreaga perioadă", "perioada", "lunile", "domeniul", "județul", "localitatea", "angajați", "ONRC", "ofertant"]) expect(explanation).toContain(label);
  });

  it("retains the supported authority cohort conditions", () => {
    const input = { ...authority, dim: "authority", filters: { ...authority.filters, authorityKind: "comuna", uatSiruta: 12345, uatName: "Dumbrăvița" } };
    const { spec } = transitionQuestion(input, "distribution");
    expect(spec.filters).toEqual({ authorityName: "Comuna Dumbrăvița", authorityId: 811, county: "Timiș", authorityKind: "comuna", uatSiruta: 12345, uatName: "Dumbrăvița" });
  });

  it("removes unsupported authority cohort restrictions for supplier profiles", () => {
    const input: QuestionSpec = { block: "stat", dim: "supplier", measure: "value", filters: { supplierId: 733, supplierName: "Firma verificată", county: "Timiș", authorityKind: "comuna", uatSiruta: 12345, uatName: "Dumbrăvița" } };
    const { spec, changes } = transitionQuestion(input, "distribution");
    expect(spec.filters).toEqual({ supplierId: 733, supplierName: "Firma verificată", county: "Timiș" });
    expect(changes.join(" ")).toContain("tipul instituției");
  });

  it.each(["network", "sankey"])("discloses opposite-party and UAT filters ignored by %s", (block) => {
    const input = { ...authority, filters: { ...authority.filters, supplierId: 733, supplierName: "Firma verificată", uatSiruta: 12345, uatName: "Dumbrăvița" } };
    const { spec, changes } = transitionQuestion(input, block);
    expect(spec.filters.authorityId).toBe(811);
    expect(spec.filters).not.toHaveProperty("supplierId");
    expect(spec.filters).not.toHaveProperty("uatSiruta");
    expect(spec.filters.county).toBe("Timiș");
    expect(spec.filters.monthFrom).toBe(3);
    expect(changes.join(" ")).toContain("firma selectată");
    expect(changes.join(" ")).toContain("localitatea");
  });

  it("makes the map's national county scope explicit while retaining other filters", () => {
    const { spec, changes } = transitionQuestion(authority, "map");
    expect(spec.filters).not.toHaveProperty("county");
    expect(spec.filters.authorityId).toBe(811);
    expect(spec.filters.cpvTerm).toBe("mobilier");
    expect(changes.join(" ")).toContain("județul");
  });

  it("keeps month-level evidence periods readable and distinct", () => {
    expect(periodLabel(authority)).toBe("2024-03–2025-08");
    expect(periodLabel({ ...authority, filters: { yearFrom: 2025, yearTo: 2025, monthFrom: 8, monthTo: 8 } })).toBe("2025-08");
    expect(periodLabel({ ...authority, filters: {} })).toBe("toți anii disponibili");
  });

  it("requires two distinct years and removes unsupported month bounds for changes", () => {
    const { spec, changes } = transitionQuestion({ ...authority, filters: { ...authority.filters, yearFrom: 2025, yearTo: 2025 } }, "trend");
    expect(spec.filters.yearFrom).toBe(2024);
    expect(spec.filters.yearTo).toBe(2025);
    expect(spec.filters).not.toHaveProperty("monthFrom");
    expect(changes.join(" ")).toContain("doi ani");
  });

  it("does not silently swap invalid month or employee ranges", () => {
    expect(questionErrors({ block: "stat", measure: "value", filters: { yearFrom: 2025, yearTo: 2025, monthFrom: 9, monthTo: 2 } })[0]).toContain("Luna de început");
    expect(questionErrors({ block: "stat", measure: "value", filters: { minEmployees: 50, maxEmployees: 4 } })[0]).toContain("Numărul minim");
  });

  it("retains per-capita ranking and discloses a change to a renderer without that measure", () => {
    const input: QuestionSpec = { block: "table", dim: "authority", measure: "value_per_capita", filters: { county: "Timiș", authorityKind: "comuna" } };
    expect(transitionQuestion(input).spec.measure).toBe("value_per_capita");
    const next = transitionQuestion(input, "stat");
    expect(next.spec.measure).toBe("value");
    expect(next.changes.join(" ")).toContain("pe locuitor");
  });

  it("compares question contents independently of property order", () => {
    expect(questionKey({ block: "stat", measure: "value", filters: { yearFrom: 2025, county: "Cluj" } })).toBe(questionKey({ measure: "value", block: "stat", dataset: "all", filters: { county: "Cluj", yearFrom: 2025 } }));
    expect(questionKey(authority)).not.toBe(questionKey({ ...authority, filters: { ...authority.filters, authorityId: 812 } }));
  });

  it("starts with a real national query, without mockup identities or data", () => {
    expect(defaultQuestion(2025)).toEqual({ block: "table", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: 2025, yearTo: 2025 } });
    const validated = validateSpec(defaultQuestion(2025));
    expect(validated).not.toHaveProperty("error");
    if (!("error" in validated)) expect(describeQuestion(validated)).toContain("2025");
  });

  it("restores a full paginated ranking without turning it into a dirty top-ten draft", () => {
    const complete = { ...authority };
    delete complete.topN;
    const restored = transitionQuestion(complete);
    expect(restored.spec).toEqual(complete);
    expect(questionKey(restored.spec)).toBe(questionKey(complete));
    expect(restored.changes).toEqual([]);
    const edited = transitionQuestion({ ...restored.spec, filters: { ...restored.spec.filters, cpvTerm: "medicamente" } });
    expect(edited.spec).not.toHaveProperty("topN");
    expect(validateSpec(edited.spec)).not.toHaveProperty("error");
  });

  it("still starts newly selected ranking templates with ten rows", () => {
    const newRanking = transitionQuestion({ block: "stat", measure: "value", filters: {} }, "table");
    expect(newRanking.spec.topN).toBe(10);
    expect(defaultQuestion(2025).topN).toBe(10);
  });
});
