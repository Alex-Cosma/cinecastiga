import { describe, expect, it } from "vitest";
import { answerLabels, questionTitle } from "./filters/title";
import type { QuestionSpec } from "./question-ui";

/**
 * The answer title states exactly what was asked, with every active condition
 * (UX round 3). Since F1b it is the builder's sentence and the conditions
 * under it (G7, R11: lib/ask/filters/title.ts).
 */
describe("answer titles", () => {
  it("names the institution and the channel of an authority-filtered ranking, never 'din România'", () => {
    const spec: QuestionSpec = { block: "table", dim: "supplier", dataset: "da", measure: "value", topN: 10, filters: { authorityName: "SPITALUL JUDETEAN SATU MARE", authorityId: 2146486 } };
    const title = questionTitle(spec);
    expect(title).toBe("Ce firme câștigă achizițiile directe făcute de SPITALUL JUDETEAN SATU MARE, în toți anii?");
    expect(title).not.toMatch(/România|toată țara/);
  });

  it("keeps the channel for contracts and says the count after the period", () => {
    const base: QuestionSpec = { block: "table", dim: "supplier", dataset: "contracts", measure: "count", topN: 10, filters: { authorityName: "SPITALUL JUDETEAN SATU MARE" } };
    expect(questionTitle(base)).toBe("Ce firme câștigă contractele din proceduri încheiate de SPITALUL JUDETEAN SATU MARE, în toți anii, după numărul de înregistrări?");
    expect(questionTitle({ ...base, dataset: "da" })).toBe("Ce firme câștigă achizițiile directe făcute de SPITALUL JUDETEAN SATU MARE, în toți anii, după numărul de înregistrări?");
  });

  it("calls a locality's own administration the town hall, not 'instituțiile publice'", () => {
    const spec: QuestionSpec = { block: "breakdown", measure: "value", filters: { uatSiruta: 161945, uatName: "Municipiul Vaslui (Vaslui)", yearFrom: 2025, yearTo: 2025, cpvTerm: "asfaltare" } };
    const title = questionTitle(spec);
    expect(title).toBe("Ce cumpără primăria Vaslui în domeniul „asfaltare”, în 2025?");
    expect(title).not.toContain("instituțiile publice");
    const ranking: QuestionSpec = { block: "table", dim: "supplier", measure: "value", topN: 10, filters: { uatSiruta: 26564, uatName: "Municipiul Oradea (Bihor)" } };
    expect(questionTitle(ranking)).toBe("Ce firme câștigă achizițiile făcute de primăria Oradea (Bihor), în toți anii?");
  });

  it("keeps the supplier in a ranking of institutions", () => {
    const spec: QuestionSpec = { block: "table", dim: "authority", measure: "value", topN: 10, filters: { supplierName: "CONEXTRUST", supplierId: 2122943 } };
    const title = questionTitle(spec);
    expect(title).toBe("Ce instituții publice din toată țara cumpără cel mai mult de la CONEXTRUST, prin toate achizițiile, în toți anii?");
    expect(title).not.toMatch(/compară|România/);
  });

  it("states subject, place, period and kind for totals and evolutions", () => {
    expect(questionTitle({ block: "stat", measure: "value", filters: { cpvTerm: "medicamente", county: "Cluj", authorityKind: "spital", yearFrom: 2021, yearTo: 2023 } }))
      .toBe("Cât valorează achizițiile pentru „medicamente” făcute de spitalele din județul Cluj, în 2021–2023?");
    expect(questionTitle({ block: "timeseries", measure: "value", filters: { supplierId: 733 } }))
      .toBe("Cum evoluează valoarea tuturor achizițiilor de la Entitatea #733, an de an?");
    expect(questionTitle({ block: "breakdown", measure: "value", filters: { authorityName: "Comuna Dumbrăvița", cpvTerm: "4523" } }))
      .toBe("Ce cumpără Comuna Dumbrăvița în domeniul CPV 4523, în toți anii?");
    // A CPV code by its name, when the caller knows it.
    expect(questionTitle({ block: "breakdown", measure: "value", filters: { authorityName: "Comuna Dumbrăvița", cpvTerm: "45" } }, { cpvName: "Lucrări de construcții" }))
      .toBe("Ce cumpără Comuna Dumbrăvița în domeniul lucrări de construcții, în toți anii?");
  });

  it("names every subject of a union", () => {
    expect(questionTitle({ block: "table", dim: "supplier", measure: "value", topN: 10, filters: { uatSiruta: 155243, uatName: "Municipiul Timișoara (Timiș)", cpvTerm: "parcuri + spatii verzi" } }))
      .toBe("Ce firme câștigă achizițiile pentru „parcuri” și „spatii verzi” făcute de primăria Timișoara, în toți anii?");
  });

  it("keeps the county and kind in leader and risk-profile titles; the kind is the subject after D1", () => {
    expect(questionTitle({ block: "entity_card", dim: "authority", rankBy: "risk", measure: "value", filters: { county: "Bihor" } }))
      .toBe("Care instituție din județul Bihor are cel mai ridicat indice de risc?");
    expect(questionTitle({ block: "entity_card", dim: "authority", rankBy: "value", measure: "value", filters: { authorityKind: "spital", county: "Cluj", yearFrom: 2025, yearTo: 2025 } }))
      .toBe("Care spital din județul Cluj cumpără cel mai mult, prin toate achizițiile, în 2025?");
    expect(questionTitle({ block: "scatter", dim: "authority", measure: "value", filters: { county: "București" } }))
      .toBe("Ce instituții publice din București ies din tipar după risc și valoarea achizițiilor directe?");
  });

  it("keeps month bounds and supplier-size conditions readable", () => {
    expect(questionTitle({ block: "stat", measure: "count", filters: { county: "Timiș", yearFrom: 2024, yearTo: 2025, monthFrom: 3, monthTo: 8, maxEmployees: 49 } }))
      .toBe("Câte achiziții au fost făcute de instituțiile publice din județul Timiș de la firme cu cel mult 49 de angajați, în mar. 2024 – aug. 2025?");
  });

  it("ends with the conditions under the sentence (G7): exclusions, then what the sentence does not say", () => {
    const population = { operator: "and" as const, groups: [
      { operator: "and" as const, conditions: [{ field: "supplier" as const, op: "not_in" as const, values: ["202"], labels: ["SYSTRA SA"] }] },
      { operator: "and" as const, conditions: [{ field: "value" as const, op: "gte" as const, value: "1000" }] },
    ] };
    expect(questionTitle({ block: "table", measure: "value", dim: "supplier", filters: {}, population }))
      .toBe("Ce firme câștigă achizițiile făcute de instituțiile publice din toată țara, în toți anii, fără SYSTRA SA, valoarea pe câștigător ≥ 1.000 lei?");
    expect(questionTitle({ block: "trend", dim: "supplier", measure: "value", topN: 10, dataset: "contracts", filters: { yearFrom: 2024, yearTo: 2025, singleBidder: true } }))
      .toBe("Ce firme au cea mai mare schimbare prin contracte din proceduri între 2024 și 2025, doar contractele cu o singură ofertă?");
    // A comparison's sentence ends with a full stop; the tail goes before it.
    expect(questionTitle({ block: "compare", measure: "value", dim: "authority", filters: { authorityName: "A", compareWith: "B", minEmployees: 0, maxEmployees: 4 } }))
      .toBe("Compară A cu B la toate achizițiile, în toți anii, firme cu 0–4 angajați.");
  });

  // F2 (trend final §1, §3.3, §3.8, §3.9; DECISIONS F1b-r-trend-years flip, par-trend R2-title-left).
  it("says a trend's kind of change, «prima dată», the months it counted and its order in percent", () => {
    const base = { block: "trend", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: 2024, yearTo: 2025 } } as const;
    const trend = (options: Record<string, unknown>, extra: Partial<QuestionSpec> = {}) => ({ ...base, trend: options, ...extra }) as QuestionSpec;
    expect(questionTitle(trend({ change: "up", months: "auto" }))).toBe("Ce firme au cea mai mare creștere între 2024 și 2025?");
    expect(questionTitle(trend({ change: "down", months: "auto" }))).toBe("Ce firme au cea mai mare scădere între 2024 și 2025?");
    expect(questionTitle(trend({ change: "new", months: "auto" }))).toBe("Ce firme noi apar în 2025, față de 2024?");
    expect(questionTitle(trend({ change: "gone", months: "auto" }))).toBe("Ce firme din 2024 nu mai apar în 2025?");
    expect(questionTitle(trend({ change: "all", months: "auto" }))).toBe("Ce firme au cea mai mare schimbare între 2024 și 2025?");
    expect(questionTitle(trend({ change: "new", firstOnly: true }))).toBe("Ce firme noi apar prima dată în 2025, față de 2024?");
    // A buyer makes the firms its suppliers; institutions of a firm are its clients (trend final §1).
    expect(questionTitle(trend({ change: "new" }, { filters: { ...base.filters, authorityName: "Municipiul Cluj-Napoca" } })))
      .toBe("Ce firme noi apar în achizițiile făcute de Municipiul Cluj-Napoca în 2025, față de 2024?");
    expect(questionTitle(trend({ change: "gone" }, { dim: "authority", filters: { ...base.filters, supplierName: "DR.MAX" } })))
      .toBe("Ce instituții publice din 2024 nu mai cumpără de la DR.MAX în 2025?");
    expect(questionTitle(trend({ change: "up" }, { dim: "county", dataset: "da" }))).toBe("Ce județe au cea mai mare creștere prin achiziții directe între 2024 și 2025?");
    // The months only where a year is counted in part and they are known: chosen, or as the answer counted them.
    const open = trend({ change: "up", months: "auto" }, { filters: { yearFrom: 2025, yearTo: 2026 } });
    expect(questionTitle(open)).toBe("Ce firme au cea mai mare creștere între 2025 și 2026?");
    expect(questionTitle(open, { executedMonths: [1, 5] })).toBe("Ce firme au cea mai mare creștere între 2025 și 2026, pe aceleași luni: ian.–mai?");
    expect(questionTitle(open, { executedMonths: [1, 12] })).toBe("Ce firme au cea mai mare creștere între 2025 și 2026?");
    expect(questionTitle(open, { sameMonthsRule: true })).toBe("Ce firme au cea mai mare creștere între 2025 și 2026, pe aceleași luni?");
    expect(questionTitle(trend({ change: "gone", months: [1, 5] }))).toBe("Ce firme din 2024 nu mai apar în 2025, pe aceleași luni: ian.–mai?");
    expect(questionTitle(trend({ change: "up", months: "whole" }))).toBe("Ce firme au cea mai mare creștere între 2024 și 2025?");
    // The growths in percent, with their base (P5's words, after the period, as a ranking's order).
    expect(questionTitle(trend({ change: "up", order: "percent", minBase: 10_000_000 })))
      .toBe("Ce firme au cea mai mare creștere între 2024 și 2025, după creșterea în procente, dintre firmele cu cel puțin 10 mil. lei în 2024?");
    expect(questionTitle(trend({ change: "up", order: "lei" }))).toBe("Ce firme au cea mai mare creștere între 2024 și 2025?");
    // An old link without `trend` keeps its title; without years it says the years its answer compared.
    expect(questionTitle(base)).toBe("Ce firme au cea mai mare schimbare între 2024 și 2025?");
    const legacy = { ...base, filters: {} } as QuestionSpec;
    expect(questionTitle(legacy)).toBe("Ce firme au cea mai mare schimbare între primul an și ultimul an?");
    const answer = { data: { block: "trend", rowsTrend: [], yearA: 2018, yearB: 2026 }, executed: { months: [1, 5], mode: "auto", checkpoint: null } } as const;
    expect(answerLabels(answer as unknown as Parameters<typeof answerLabels>[0])).toEqual({ executedMonths: [1, 5], trendYears: { yearA: 2018, yearB: 2026 } });
    expect(questionTitle(legacy, answerLabels({ data: answer.data } as unknown as Parameters<typeof answerLabels>[0]))).toBe("Ce firme au cea mai mare schimbare între 2018 și 2026?");
    expect(answerLabels(null)).toEqual({});
  });

  it("says a ranking's order when it is not the value: watches, saved questions and file names read only the title", () => {
    const ranking = { block: "table" as const, dim: "authority" as const, filters: { yearFrom: 2025, yearTo: 2025 } };
    expect(questionTitle({ ...ranking, measure: "value" })).toBe("Ce instituții publice din toată țara cumpără cel mai mult, prin toate achizițiile, în 2025?");
    expect(questionTitle({ ...ranking, measure: "value_per_capita" })).toBe("Ce instituții publice din toată țara cumpără cel mai mult, prin toate achizițiile, în 2025, după valoarea pe locuitor?");
    expect(questionTitle({ ...ranking, measure: "count", dim: "supplier", filters: { ...ranking.filters, supplierName: "X" } }))
      .toBe("Ce firme câștigă achizițiile făcute de instituțiile publice din toată țara, în 2025, după numărul de înregistrări, firma „X”?");
    // A count elsewhere is the sentence's own ("Câte…", "Cum evoluează [numărul de înregistrări]").
    expect(questionTitle({ block: "stat", measure: "count", filters: {} })).toBe("Câte achiziții au fost făcute de instituțiile publice din toată țara, în toți anii?");
  });
});
