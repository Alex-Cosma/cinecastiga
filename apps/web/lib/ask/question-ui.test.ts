import { describe, expect, it } from "vitest";
import { BLOCKS, validateSpec } from "./spec";
import { QUESTION_GROUPS, QUESTION_TYPES, defaultQuestion, describeQuestion, localityScopeError, localityScopeSupport, periodLabel, questionErrors, questionKey, reconcileQuestionDraft, transitionQuestion, type QuestionSpec } from "./question-ui";

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

  it.each(BLOCKS)("produces an executable %s question with compatible explicit conditions", (block) => {
    const historic = ["distribution", "scatter", "entity_card"].includes(block);
    const filters = historic ? (block === "distribution" ? { authorityId:811 } : {}) : { ...authority.filters, monthFrom:undefined, monthTo:undefined, ...(block === "compare" ? { compareWith:"Comuna Giroc", compareWithId:922 } : {}), ...(block === "fact_check" ? { supplierName:"Firma verificată", supplierId:733 } : {}) };
    const clean = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined));
    const { spec } = transitionQuestion({ ...authority, dataset:historic ? "da" : "contracts", filters:clean as QuestionSpec["filters"] }, block);
    expect(questionErrors(spec)).toEqual([]);
    expect(validateSpec(spec)).not.toHaveProperty("error");
    expect(spec.block).toBe(block);
  });

  it("value leaders use both streams and retain period/CPV filters, while risk stays historical", () => {
    const { spec } = transitionQuestion({ block:"stat", measure:"value", filters:{ yearFrom:2025, yearTo:2025, cpvTerm:"45" } }, "entity_card");
    expect(spec.rankBy).toBe("value");
    expect(spec.dataset ?? "all").toBe("all");
    expect(questionErrors(spec)).toEqual([]);
    expect(validateSpec(spec)).not.toHaveProperty("error");
    expect(describeQuestion(spec)).toContain("valoare a achizițiilor");
    expect(questionErrors({ ...spec, rankBy:"risk" }).join(" ")).toContain("profiluri istorice");
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

  it("preserves comparison identities when changing presentation and switching back", () => {
    const input = { ...authority, block: "compare", filters: { ...authority.filters, compareWith: "Comuna Giroc", compareWithId: 922 } };
    expect(transitionQuestion(input).spec.filters).toMatchObject({ authorityId: 811, compareWithId: 922, compareWith: "Comuna Giroc" });
    const next = transitionQuestion(input, "stat");
    expect(next.spec.filters).toMatchObject({ compareWithId:922, compareWith:"Comuna Giroc" });
    expect(transitionQuestion(next.spec, "compare").spec.filters).toEqual(input.filters);
  });

  it("can reopen a comparison containing only exact IDs", () => {
    const { spec } = transitionQuestion({ block: "compare", measure: "value", dataset: "da", filters: { authorityId: 811, compareWithId: 922 } });
    expect(spec.filters).toEqual({ authorityId: 811, authorityName: "Entitatea #811", compareWithId: 922, compareWith: "Entitatea #922" });
    expect(questionErrors(spec)).toEqual([]);
    expect(validateSpec(spec)).not.toHaveProperty("error");
  });

  it("preserves unsupported historical conditions and blocks execution rather than silently broadening", () => {
    const input:QuestionSpec = { ...authority, filters:{ ...authority.filters, compareWithId:922, compareWith:"Comuna Giroc" } };
    const { spec } = transitionQuestion({ ...input, comparisonMode:"profiles", block:"compare" });
    expect(spec.filters).toEqual(input.filters);
    expect(spec.dataset).toBe("contracts");
    expect(questionErrors(spec).join(" ")).toContain("Condițiile sunt păstrate");
  });
  it("retains the supported authority cohort conditions", () => {
    const input:QuestionSpec = { block:"distribution", dataset:"da", dim:"authority", measure:"value", filters:{ authorityId:811, authorityName:"Comuna", county:"Timiș", authorityKind:"comuna" } };
    expect(transitionQuestion(input).spec.filters).toEqual(input.filters);
    expect(questionErrors(input)).toEqual([]);
  });
  it("keeps a locality on a risk cohort visible as an error (a one-town-hall cohort would mislead)", () => {
    const input:QuestionSpec = { block:"distribution", dataset:"da", dim:"authority", measure:"value", filters:{ authorityId:811, authorityName:"Comuna", county:"Timiș", uatSiruta:12345, uatName:"Dumbrăvița" } };
    expect(transitionQuestion(input).spec.filters).toEqual(input.filters);
    expect(questionErrors(input).join(" ")).toContain("Elimină localitatea „Dumbrăvița”");
  });
  it("rejects unsupported buyer conditions on supplier profiles while retaining the draft", () => {
    const input:QuestionSpec = { block:"distribution", dim:"supplier", measure:"value", filters:{ supplierId:733, supplierName:"Firma", county:"Timiș", authorityKind:"comuna", uatSiruta:12345 } };
    expect(transitionQuestion(input).spec.filters).toEqual(input.filters);
    expect(questionErrors(input).join(" ")).toContain("Condițiile sunt păstrate");
  });
  it.each(["network", "sankey", "map"])("retains counterpart, UAT and county restrictions in %s, and flags the locality it cannot honour", block => {
    const input = { ...authority, filters:{ ...authority.filters, supplierId:733, supplierName:"Firma", uatSiruta:12345, uatName:"Dumbrăvița" } };
    const { spec } = transitionQuestion(input, block);
    expect(spec.filters).toEqual(input.filters);
    expect(questionErrors(spec)).toEqual([expect.stringContaining("Elimină localitatea „Dumbrăvița”")]);
    const withoutLocality = { ...spec, filters: { ...spec.filters } };
    delete withoutLocality.filters.uatSiruta; delete withoutLocality.filters.uatName;
    expect(questionErrors(withoutLocality)).toEqual([]);
  });
  it("keeps legacy compare links historical and explicitly chooses transactional new comparisons", () => {
    const legacy:QuestionSpec = { block:"compare", measure:"value", filters:{ authorityId:811, compareWithId:922 } };
    expect(transitionQuestion(legacy).spec.comparisonMode).toBeUndefined();
    expect(describeQuestion(legacy)).toContain("Profiluri istorice");
    expect(transitionQuestion(authority, "compare").spec.comparisonMode).toBe("transactions");
  });

  it("keeps month-level evidence periods readable and distinct", () => {
    expect(periodLabel(authority)).toBe("2024-03–2025-08");
    expect(periodLabel({ ...authority, filters: { yearFrom: 2025, yearTo: 2025, monthFrom: 8, monthTo: 8 } })).toBe("2025-08");
    expect(periodLabel({ ...authority, filters: {} })).toBe("toți anii disponibili");
  });

  it("keeps equal years and month bounds until the user explicitly changes them", () => {
    const input = { ...authority, filters:{ ...authority.filters, yearFrom:2025, yearTo:2025 } };
    const { spec } = transitionQuestion(input, "trend");
    expect(spec.filters).toEqual(input.filters);
    expect(questionErrors(spec).join(" ")).toContain("doi ani diferiți");
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

  it("restores ID-only questions without treating placeholder or grounded labels as edits", () => {
    const restored: QuestionSpec = { block:"stat", measure:"value", filters:{ authorityId:2144364 } };
    const seeded = transitionQuestion(restored).spec;
    const grounded = { ...restored, filters:{ authorityId:2144364, authorityName:"MUNICIPIUL BUZAU" } };
    expect(questionKey(seeded)).toBe(questionKey(restored));
    expect(questionKey(grounded)).toBe(questionKey(restored));
    const reconciled = reconcileQuestionDraft(seeded, restored, grounded);
    expect(reconciled.filters.authorityName).toBe("MUNICIPIUL BUZAU");
    expect(questionKey(reconciled)).toBe(questionKey(grounded));
    expect(seeded.filters.authorityName).toBe("Entitatea #2144364");
  });

  it("retains real edits made while a restored question is being grounded", () => {
    const submitted: QuestionSpec = { block:"stat", measure:"value", filters:{ authorityId:2144364 } };
    const grounded = { ...submitted, filters:{ ...submitted.filters, authorityName:"MUNICIPIUL BUZAU" } };
    for (const current of [
      { ...transitionQuestion(submitted).spec, filters:{ authorityId:2144364, yearFrom:2025 } },
      { ...submitted, filters:{ authorityId:811 } },
      { ...submitted, block:"timeseries" },
    ]) {
      expect(reconcileQuestionDraft(current, submitted, grounded)).toBe(current);
      expect(questionKey(current)).not.toBe(questionKey(grounded));
    }
  });

  it("still distinguishes free-text identities until an exact ID is selected", () => {
    const named = { block:"stat", measure:"value", filters:{ authorityName:"Buzău" } };
    expect(questionKey(named)).not.toBe(questionKey({ ...named, filters:{ authorityName:"Brașov" } }));
    expect(questionKey(named)).not.toBe(questionKey({ ...named, filters:{ authorityName:"Buzău", authorityId:2144364 } }));
  });

  it("ignores exact-identity display metadata for both entities, comparison, locality and person", () => {
    const base: QuestionSpec = { block:"stat", measure:"value", filters:{ authorityId:811, supplierId:733, compareWithId:922, uatSiruta:12345, adminPersonKey:"person|1970" } };
    expect(questionKey(base)).toBe(questionKey({ ...base, filters:{ ...base.filters, authorityName:"Instituția", supplierName:"Firma", compareWith:"Partenerul", uatName:"Localitatea", adminName:"Persoana" } }));
  });

  it("starts with a real national query, without mockup identities or data", () => {
    expect(defaultQuestion()).toEqual({ block: "table", dim: "supplier", measure: "value", topN: 10, filters: {} });
    const validated = validateSpec(defaultQuestion());
    expect(validated).not.toHaveProperty("error");
    if (!("error" in validated)) expect(describeQuestion(validated)).toBe("Cine câștigă contractele de la instituțiile din toată țara, în toți anii?");
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
    expect(defaultQuestion().topN).toBe(10);
  });
});

describe("locality scope in the place picker", () => {
  const locality = { uatSiruta: 44818, uatName: "Municipiul Buzău (Buzău)" };
  it.each(["table", "trend", "stat", "timeseries", "breakdown"])("offers a locality for %s and the engine accepts it", (block) => {
    const spec: QuestionSpec = { block, dim: "supplier", measure: "value", topN: 10, filters: { ...locality, ...(block === "trend" ? { yearFrom: 2023, yearTo: 2024 } : {}) } };
    expect(localityScopeSupport(spec)).toEqual({ ok: true });
    expect(validateSpec(spec)).not.toHaveProperty("error");
  });
  it("offers it for the value leader (a one-row transaction ranking)", () => {
    expect(localityScopeSupport({ block: "entity_card", rankBy: "value", dim: "supplier", measure: "value", filters: {} })).toEqual({ ok: true });
  });
  it.each(["map", "compare", "network", "sankey", "fact_check", "scatter", "distribution"])("does not offer it for %s, and says why", (block) => {
    const support = localityScopeSupport({ block, measure: "value", filters: {} });
    expect(support.ok).toBe(false);
    if (!support.ok) expect(support.reason).toMatch(/județul/);
  });
  it("does not offer it for county rankings or risk leaders", () => {
    expect(localityScopeSupport({ block: "table", dim: "county", measure: "value", filters: {} }).ok).toBe(false);
    expect(localityScopeSupport({ block: "entity_card", rankBy: "risk", dim: "authority", measure: "value", filters: {} }).ok).toBe(false);
  });
  it("switching to a view without locality keeps it visible as an error, never silently", () => {
    const { spec } = transitionQuestion({ block: "table", dim: "supplier", measure: "value", topN: 10, filters: { ...locality } }, "map");
    expect(spec.filters.uatSiruta).toBe(44818);
    expect(questionErrors(spec).join(" ")).toMatch(/Harta arată județele.*Elimină localitatea „Municipiul Buzău \(Buzău\)”/);
    expect(questionErrors({ ...spec, block: "stat" })).toEqual([]);
  });
  it("the API refuses what the builder flags: one shared rule (localityScopeError)", () => {
    expect(localityScopeError({ block: "map", measure: "value", filters: { ...locality } })).toMatch(/Harta arată județele/);
    expect(localityScopeError({ block: "scatter", dim: "authority", measure: "value", filters: { ...locality } })).toMatch(/Indicele de risc/);
    expect(localityScopeError({ block: "stat", measure: "value", filters: { ...locality } })).toBeNull();
    expect(localityScopeError({ block: "map", measure: "value", filters: {} })).toBeNull();
  });
});
