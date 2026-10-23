import { describe, expect, it } from "vitest";
import { describeQuestion, type QuestionSpec } from "./question-ui";

/** The answer title states exactly what was asked, with every active condition (UX round 3). */
describe("answer titles", () => {
  it("names the institution and the channel of an authority-filtered ranking, never 'din România'", () => {
    const spec: QuestionSpec = { block: "table", dim: "supplier", dataset: "da", measure: "value", topN: 10, filters: { authorityName: "SPITALUL JUDETEAN SATU MARE", authorityId: 2146486 } };
    const title = describeQuestion(spec);
    expect(title).toBe("Cine câștigă achizițiile directe de la „SPITALUL JUDETEAN SATU MARE”, în toți anii?");
    expect(title).not.toMatch(/România|toată țara/);
  });

  it("keeps the channel for contracts and counts", () => {
    const base: QuestionSpec = { block: "table", dim: "supplier", dataset: "contracts", measure: "count", topN: 10, filters: { authorityName: "SPITALUL JUDETEAN SATU MARE" } };
    expect(describeQuestion(base)).toBe("Cine câștigă cele mai multe contracte de la „SPITALUL JUDETEAN SATU MARE”, în toți anii, doar contracte din proceduri?");
    expect(describeQuestion({ ...base, dataset: "da" })).toBe("Cine câștigă cele mai multe achiziții directe de la „SPITALUL JUDETEAN SATU MARE”, în toți anii?");
  });

  it("calls a locality's own administration the town hall, not 'instituțiile publice'", () => {
    const spec: QuestionSpec = { block: "breakdown", measure: "value", filters: { uatSiruta: 161945, uatName: "Municipiul Vaslui (Vaslui)", yearFrom: 2025, yearTo: 2025, cpvTerm: "asfaltare" } };
    const title = describeQuestion(spec);
    expect(title).toBe("Ce cumpără primăria Municipiului Vaslui în domeniul „asfaltare”, în 2025?");
    expect(title).not.toContain("instituțiile publice");
    const ranking: QuestionSpec = { block: "table", dim: "supplier", measure: "value", topN: 10, filters: { uatSiruta: 26564, uatName: "Municipiul Oradea (Bihor)" } };
    expect(describeQuestion(ranking)).toBe("Cine câștigă contractele de la primăria Municipiului Oradea (Bihor), în toți anii?");
  });

  it("keeps the supplier in a ranking of institutions", () => {
    const spec: QuestionSpec = { block: "table", dim: "authority", measure: "value", topN: 10, filters: { supplierName: "CONEXTRUST", supplierId: 2122943 } };
    const title = describeQuestion(spec);
    expect(title).toBe("Ce instituții cumpără cel mai mult de la „CONEXTRUST”, în toți anii?");
    expect(title).not.toMatch(/compară|România/);
  });

  it("states subject, place, period and kind for totals and trends", () => {
    expect(describeQuestion({ block: "stat", measure: "value", filters: { cpvTerm: "medicamente", county: "Cluj", authorityKind: "spital", yearFrom: 2021, yearTo: 2023 } }))
      .toBe("Cât valorează achizițiile pentru „medicamente” făcute de spitalele din județul Cluj, între 2021 și 2023?");
    expect(describeQuestion({ block: "timeseries", measure: "value", filters: { supplierId: 733 } }))
      .toBe("Cum au evoluat de la an la an achizițiile făcute de instituțiile de la „Entitatea #733”, în toți anii?");
    expect(describeQuestion({ block: "breakdown", measure: "value", filters: { authorityName: "Comuna Dumbrăvița", cpvTerm: "4523" } }))
      .toBe("Ce cumpără „Comuna Dumbrăvița” în domeniul CPV 4523, în toți anii?");
  });

  it("keeps month bounds and supplier-size conditions readable", () => {
    expect(describeQuestion({ block: "stat", measure: "count", filters: { county: "Timiș", yearFrom: 2024, yearTo: 2025, monthFrom: 3, monthTo: 8, maxEmployees: 49 } }))
      .toBe("Câte achiziții au fost făcute de instituțiile din județul Timiș, în perioada 2024-03–2025-08, firme cu cel mult 49 de angajați?");
  });
});
