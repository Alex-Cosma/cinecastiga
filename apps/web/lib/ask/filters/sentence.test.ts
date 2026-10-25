import { describe, expect, it } from "vitest";
import { countyIsFirmSeat } from "../population";
import { subjectWords, transitionQuestion, type QuestionSpec } from "../question-ui";
import { parseSpec, type Block } from "../spec";
import { FIXTURE_IDENTITIES } from "../fixtures/golden-fixture";
import { legacyCorpus } from "../fixtures/legacy-corpus";
import { describeConditions } from "./describe";
import { filterContext } from "./context";
import { SPEC_PATH_OWNERS, presentPaths } from "./registry";
import {
  KINDS_AFTER_D1, kindAfterD1, presentationTokens, saidFilters, sentenceSlots, sentenceText, sentenceTokens, type SentenceLabels, type SentenceSlot,
} from "./sentence";
import type { FilterId } from "./types";
import type { SentenceToken as KitSentenceToken } from "../../../app/intreaba/builder/kit-types";

/*
 * The sentence of the 13 questions (plan §2.2 sentence.ts, §4.1–§4.13, §5
 * F1b), with today's keys only. Each question is checked on the states of its
 * final (kit wins where they differ), every link of the legacy corpus is
 * pinned, and the words are the ones describeConditions uses for the same
 * conditions (one vocabulary, kit §4).
 */

const q = (spec: Partial<QuestionSpec> & { block: string }): QuestionSpec => ({ measure: "value", filters: {}, ...spec });
/** The sentence as the finals write it: phrases in brackets, fixed words in braces. */
const marked = (spec: QuestionSpec, labels: SentenceLabels = {}) => sentenceTokens(spec, undefined, labels)
  .map((t) => t.kind === "slot" ? `[${t.value}]` : t.kind === "fixed" ? `{${t.text}}` : t.text).join("");
const slots = (spec: QuestionSpec) => sentenceTokens(spec).filter((t): t is SentenceSlot => t.kind === "slot");
const slotOf = (spec: QuestionSpec, filter: FilterId) => slots(spec).find((t) => t.filter === filter);
const SHAPE = new Set<string>(["question", "dim", "measure", "topN", "rankBy", "comparisonMode"]);
/** The conditions a spec carries that its sentence does not say, sorted: they stay under it (P4, legacyConditions). */
const under = (spec: QuestionSpec) => {
  const said = saidFilters(sentenceTokens(spec));
  return [...new Set(presentPaths(spec).map((path) => SPEC_PATH_OWNERS[path]).filter((owner) => owner && !SHAPE.has(owner) && !said.has(owner as FilterId)))].sort();
};

const corpus = legacyCorpus(FIXTURE_IDENTITIES).flatMap((entry) => {
  const parsed = parseSpec(entry.spec);
  // As the builder restores a link (AskPanel → QuestionBuilder seed).
  return "error" in parsed ? [] : [{ id: entry.id, spec: transitionQuestion(parsed as unknown as QuestionSpec).spec }];
});

const BUZAU = { authorityName: "MUNICIPIUL BUZAU", authorityId: 11 };
const PORR = { supplierName: "PORR CONSTRUCT", supplierId: 22 };
const ADMIN = { adminPersonKey: "popescu ion|1970-01-01|buzau", adminName: "POPESCU ION (n. 1970)" };

describe("the sentence of each question (plan §4)", () => {
  it("stat: the noun of the stream, who bought and from whom (§4.1)", () => {
    expect(marked(q({ block: "stat" }))).toBe("Cât valorează [achizițiile] făcute de [instituțiile publice] din [toată țara], în [toți anii]?");
    expect(marked(q({ block: "stat", filters: { ...BUZAU, yearFrom: 2025, yearTo: 2025 } }))).toBe("Cât valorează [achizițiile] făcute de [MUNICIPIUL BUZAU], în [2025]?");
    // A named firm is the scope: the default buyer is hidden, and comes back as an invitation.
    expect(marked(q({ block: "stat", filters: { ...PORR, yearFrom: 2025, yearTo: 2025 } }))).toBe("Cât valorează [achizițiile] de la [PORR CONSTRUCT], în [2025]?");
    expect(marked(q({ block: "stat", dataset: "contracts", filters: { cpvTerm: "iluminat", authorityKind: "oras_municipiu", county: "Cluj", minEmployees: 1, maxEmployees: 9, yearFrom: 2024, yearTo: 2025 } })))
      .toBe("Cât valorează [contractele din proceduri] pentru [„iluminat”] încheiate de [primăriile de oraș și municipiu] din [județul Cluj] câștigate de [firme cu 1–9 angajați], în [2024–2025]?");
    // "primăria [Buzău]", never "primăria [Municipiului Buzău]" (kit §6 stat 7).
    expect(marked(q({ block: "stat", filters: { uatSiruta: 1, uatName: "Municipiul Buzău (Buzău)" } }))).toBe("Cât valorează [achizițiile] făcute de primăria [Buzău], în [toți anii]?");
    expect(marked(q({ block: "stat", measure: "count", dataset: "da" }))).toBe("Câte [achiziții directe] au fost făcute de [instituțiile publice] din [toată țara], în [toți anii]?");
    expect(marked(q({ block: "stat", filters: ADMIN }))).toBe("Cât valorează [achizițiile] de la [firmele conduse azi de POPESCU ION (n. 1970)], în [toți anii]?");
    expect(marked(q({ block: "stat", filters: { ...PORR, county: "Cluj", authorityKind: "spital" } }))).toBe("Cât valorează [achizițiile] făcute de [spitalele] din [județul Cluj] de la [PORR CONSTRUCT], în [toți anii]?");
    // The tabs of "De la cine?" are exclusive: a firm, else a person, else a size; the rest of an old link stays under the sentence.
    const all = q({ block: "stat", filters: { ...PORR, ...ADMIN, maxEmployees: 9 } });
    expect(marked(all)).toBe("Cât valorează [achizițiile] de la [PORR CONSTRUCT], în [toți anii]?");
    expect(under(all)).toEqual(["admin", "employees"]);
    expect(slotOf(all, "supplier")).toMatchObject({ window: "De la cine?", writes: ["admin", "employees"] });
  });

  it("table: the subject first, the ranked firms' own phrases, one named side (§4.2)", () => {
    const firms = q({ block: "table", dim: "supplier", topN: 10 });
    expect(marked(firms)).toBe("Ce [firme] câștigă [achizițiile] făcute de [instituțiile publice] din [toată țara], în [toți anii]?");
    expect(marked(q({ block: "table", dim: "supplier", dataset: "contracts", filters: { uatSiruta: 54975, uatName: "Municipiul Cluj-Napoca (Cluj)", yearFrom: 2024, yearTo: 2025 } })))
      .toBe("Ce [firme] câștigă [contractele din proceduri] încheiate de primăria [Cluj-Napoca], în [2024–2025]?");
    expect(marked(q({ block: "table", dim: "supplier", filters: { authorityName: "Spitalul Clinic Județean de Urgență Cluj", yearFrom: 2025, yearTo: 2025 } })))
      .toBe("Ce [firme] câștigă [achizițiile] făcute de [Spitalul Clinic Județean de Urgență Cluj], în [2025]?");
    // Employees and the administrator are selection phrases glued to the subject (plan §9 F1), not a group row.
    expect(marked(q({ block: "table", dim: "supplier", filters: { minEmployees: 1, maxEmployees: 9, ...ADMIN } })))
      .toBe("Ce [firme] [cu 1–9 angajați] conduse azi de [POPESCU ION (n. 1970)] câștigă [achizițiile] făcute de [instituțiile publice] din [toată țara], în [toți anii]?");
    expect(marked(q({ block: "table", dim: "authority", filters: { authorityKind: "spital", county: "Cluj", maxEmployees: 0, yearFrom: 2025, yearTo: 2025 } })))
      .toBe("Ce [spitale] din [județul Cluj] cumpără cel mai mult de la [firme fără angajați], prin [toate achizițiile], în [2025]?");
    expect(marked(q({ block: "table", dim: "county", dataset: "da", filters: { authorityKind: "comuna", ...PORR, yearFrom: 2025, yearTo: 2025 } })))
      .toBe("În ce [județe] cumpără cel mai mult [primăriile de comună] de la [PORR CONSTRUCT], prin [achiziții directe], în [2025]?");
    expect(marked(q({ block: "table", dim: "authority", filters: { cpvTerm: "45", uatSiruta: 54975, uatName: "Municipiul Cluj-Napoca (Cluj)" } }), { cpvName: "Lucrări de construcții" }))
      .toBe("Ce [instituții publice] ale primăriei [Cluj-Napoca] cumpără cel mai mult pentru [lucrări de construcții], prin [toate achizițiile], în [toți anii]?");
    // A ranking of firms names its buyer, a ranking of institutions its firm: the other stays under the sentence.
    expect(under(q({ block: "table", dim: "supplier", filters: { ...BUZAU, ...PORR } }))).toEqual(["supplier"]);
    expect(under(q({ block: "table", dim: "authority", filters: { ...BUZAU, ...PORR } }))).toEqual(["authority"]);
    expect(under(q({ block: "table", dim: "county", filters: { county: "Cluj" } }))).toEqual(["county"]);
    expect(slotOf(firms, "dim")).toMatchObject({ id: "dim", value: "firme", window: "Ce clasăm?", writes: ["authorityKind"] });
  });

  it("table and trend: the presentation line (P5)", () => {
    const line = (spec: QuestionSpec) => presentationTokens(spec).map((t) => t.kind === "slot" ? `[${t.value}]` : t.kind === "text" ? t.text : "").join("");
    expect(line(q({ block: "table", dim: "supplier", topN: 10 }))).toBe("Arată [primele 10], după [valoarea înregistrată].");
    expect(line(q({ block: "table", dim: "supplier", measure: "count" }))).toBe("Arată [tot clasamentul], după [numărul de înregistrări].");
    expect(line(q({ block: "table", dim: "authority", topN: 1, measure: "value_per_capita" }))).toBe("Arată [primul], după [valoarea pe locuitor].");
    expect(line(q({ block: "trend", dim: "supplier" }))).toBe("Arată [primele 10], după diferența în lei.");
    for (const block of ["stat", "timeseries", "map", "breakdown", "compare", "network", "sankey", "fact_check", "distribution", "scatter", "entity_card"])
      expect(presentationTokens(q({ block })), block).toEqual([]);
  });

  it("timeseries: the measure leads, the noun names its state, the period carries its preposition (§4.3)", () => {
    expect(marked(q({ block: "timeseries" }))).toBe("Cum evoluează [valoarea] [tuturor achizițiilor] făcute de [instituțiile publice] din [toată țara], [an de an]?");
    expect(marked(q({ block: "timeseries", dataset: "contracts", filters: { authorityKind: "comuna", county: "Cluj", yearFrom: 2021, yearTo: 2026 } })))
      .toBe("Cum evoluează [valoarea] [contractelor din proceduri] încheiate de [primăriile de comună] din [județul Cluj], [an de an, 2021–2026]?");
    expect(marked(q({ block: "timeseries", filters: PORR }))).toBe("Cum evoluează [valoarea] [tuturor achizițiilor] de la [PORR CONSTRUCT], [an de an]?");
    expect(marked(q({ block: "timeseries", filters: { ...PORR, county: "Cluj" } })))
      .toBe("Cum evoluează [valoarea] [tuturor achizițiilor] făcute de [instituțiile publice] din [județul Cluj] de la [PORR CONSTRUCT], [an de an]?");
    expect(marked(q({ block: "timeseries", measure: "count", filters: { uatSiruta: 54975, uatName: "Municipiul Cluj-Napoca (Cluj)" } })))
      .toBe("Cum evoluează [numărul de înregistrări] din [toate achizițiile] făcute de primăria [Cluj-Napoca], [an de an]?");
    expect(slotOf(q({ block: "timeseries" }), "period")?.window).toBe("Când?");
    // An old link's employees are a "Din link" chip there (plan §4.3).
    expect(under(q({ block: "timeseries", filters: { minEmployees: 1, maxEmployees: 9 } }))).toEqual(["employees"]);
  });

  it("map: the counties are the answer, so no place, no single institution, no town hall (§4.4)", () => {
    expect(marked(q({ block: "map" }))).toBe("Cum se împart [achizițiile] făcute de [instituțiile publice] pe județe, în [toți anii]?");
    expect(marked(q({ block: "map", filters: { authorityKind: "consiliu_judetean", yearFrom: 2025, yearTo: 2025 } }))).toBe("Cum se împart [achizițiile] făcute de [consiliile județene] pe județe, în [2025]?");
    expect(marked(q({ block: "map", dataset: "contracts", filters: { cpvTerm: "medicamente", yearFrom: 2025, yearTo: 2025 } })))
      .toBe("Cum se împart [contractele din proceduri] pentru [„medicamente”] încheiate de [instituțiile publice] pe județe, în [2025]?");
    expect(marked(q({ block: "map", filters: { ...PORR, yearFrom: 2024, yearTo: 2025 } }))).toBe("Cum se împart [achizițiile] de la [PORR CONSTRUCT] pe județe, în [2024–2025]?");
    expect(marked(q({ block: "map", filters: ADMIN }))).toBe("Cum se împart [achizițiile] de la [firmele conduse azi de POPESCU ION (n. 1970)] pe județe, în [toți anii]?");
    expect(under(q({ block: "map", filters: { ...BUZAU, county: "Cluj", uatSiruta: 1, uatName: "Comuna X (Cluj)", minEmployees: 1 } }))).toEqual(["authority", "county", "employees", "locality"]);
  });

  it("breakdown: the buyer is the subject, also beside a firm (§4.5, kit §5.21)", () => {
    const hall = { uatSiruta: 54975, uatName: "Municipiul Cluj-Napoca (Cluj)", yearFrom: 2025, yearTo: 2025 };
    expect(marked(q({ block: "breakdown", filters: { authorityName: "Spitalul Clinic Județean de Urgență Cluj-Napoca", yearFrom: 2025, yearTo: 2025 } })))
      .toBe("Ce cumpără [Spitalul Clinic Județean de Urgență Cluj-Napoca], în [2025]?");
    expect(marked(q({ block: "breakdown", filters: hall }))).toBe("Ce cumpără primăria [Cluj-Napoca], în [2025]?");
    expect(marked(q({ block: "breakdown", filters: { authorityKind: "spital", county: "Cluj", yearFrom: 2025, yearTo: 2025 } }))).toBe("Ce cumpără [spitalele] din [județul Cluj], în [2025]?");
    expect(marked(q({ block: "breakdown", dataset: "da", filters: hall }))).toBe("Ce cumpără primăria [Cluj-Napoca] prin [achiziții directe], în [2025]?");
    expect(marked(q({ block: "breakdown", filters: { ...hall, cpvTerm: "50" } }), { cpvName: "Servicii de reparare și întreținere" }))
      .toBe("Ce cumpără primăria [Cluj-Napoca] în domeniul [servicii de reparare și întreținere], în [2025]?");
    expect(marked(q({ block: "breakdown", filters: { ...hall, supplierName: "CONSTRUCTII ERBASU S.A." } }))).toBe("Ce cumpără primăria [Cluj-Napoca] de la [CONSTRUCTII ERBASU S.A.], în [2025]?");
    expect(marked(q({ block: "breakdown", filters: { supplierName: "CONSTRUCTII ERBASU S.A.", yearFrom: 2025, yearTo: 2025 } }))).toBe("Ce cumpără [instituțiile publice] de la [CONSTRUCTII ERBASU S.A.], în [2025]?");
    expect(marked(q({ block: "breakdown", filters: { supplierName: "VODAFONE ROMANIA S.A.", authorityKind: "spital", county: "Cluj", yearFrom: 2025, yearTo: 2025 } })))
      .toBe("Ce cumpără [spitalele] din [județul Cluj] de la [VODAFONE ROMANIA S.A.], în [2025]?");
    // A kind beside a named institution, the employees and the administrator are "Din link" there (plan §4.5).
    expect(under(q({ block: "breakdown", filters: { ...BUZAU, authorityKind: "spital", minEmployees: 1, ...ADMIN } }))).toEqual(["admin", "authorityKind", "employees"]);
  });

  it("compare: the stream after «la», who bought only between firms (§4.6)", () => {
    const cities = { authorityName: "Municipiul Cluj-Napoca", authorityId: 1, compareWith: "Municipiul Timișoara", compareWithId: 2 };
    const firms = { supplierName: "PORR CONSTRUCT", supplierId: 3, compareWith: "CONSTRUCȚII ERBAȘU", compareWithId: 4 };
    expect(marked(q({ block: "compare", dim: "authority", filters: cities }))).toBe("Compară [Municipiul Cluj-Napoca] cu [Municipiul Timișoara] la [toate achizițiile], în [toți anii].");
    expect(marked(q({ block: "compare", dim: "supplier", dataset: "contracts", filters: { ...firms, yearFrom: 2023, yearTo: 2025 } })))
      .toBe("Compară [PORR CONSTRUCT] cu [CONSTRUCȚII ERBAȘU] la [contractele din proceduri], în [2023–2025].");
    expect(marked(q({ block: "compare", dim: "authority", dataset: "da", filters: { ...cities, cpvTerm: "spații verzi" } })))
      .toBe("Compară [Municipiul Cluj-Napoca] cu [Municipiul Timișoara] la [achizițiile directe] pentru [„spații verzi”], în [toți anii].");
    expect(marked(q({ block: "compare", dim: "supplier", filters: { ...firms, authorityKind: "spital", county: "București" } })))
      .toBe("Compară [PORR CONSTRUCT] cu [CONSTRUCȚII ERBAȘU] la [toate achizițiile] făcute de [spitalele] din [București], în [toți anii].");
    expect(marked(q({ block: "compare", dim: "supplier", filters: { ...firms, county: "Cluj" } })))
      .toBe("Compară [PORR CONSTRUCT] cu [CONSTRUCȚII ERBAȘU] la [toate achizițiile] făcute de [instituțiile publice] din [județul Cluj], în [toți anii].");
    // Between institutions the clients' conditions are an old link's (plan §4.6).
    expect(under(q({ block: "compare", dim: "authority", filters: { ...cities, county: "Cluj", authorityKind: "comuna", ...PORR } }))).toEqual(["authorityKind", "county", "supplier"]);
    expect(slotOf(q({ block: "compare", dim: "authority", filters: cities }), "authority")).toMatchObject({ picker: "focal", writes: ["supplier"] });
  });

  it("trend: the subject first, the change between two years, fragments only when set (§4.7)", () => {
    const years = { yearFrom: 2024, yearTo: 2025 };
    expect(marked(q({ block: "trend", dim: "supplier", topN: 10, filters: years }))).toBe("Ce [firme] au cea mai mare schimbare între [2024] și [2025]?");
    expect(marked(q({ block: "trend", dim: "supplier", filters: { ...years, authorityName: "Municipiul Cluj-Napoca" } })))
      .toBe("Ce [firme] au cea mai mare schimbare a achizițiilor făcute de [Municipiul Cluj-Napoca] între [2024] și [2025]?");
    expect(marked(q({ block: "trend", dim: "supplier", dataset: "da", filters: { ...years, cpvTerm: "asfaltare", county: "Cluj" } })))
      .toBe("Ce [firme] au cea mai mare schimbare a achizițiilor pentru [„asfaltare”] făcute de [instituțiile publice] din [județul Cluj] prin [achiziții directe] între [2024] și [2025]?");
    // On institutions the kind is the subject (plan §4.7).
    expect(marked(q({ block: "trend", dim: "authority", filters: { ...years, authorityKind: "spital", supplierName: "DR.MAX" } })))
      .toBe("Ce [spitale] au cea mai mare schimbare a achizițiilor de la [DR.MAX] între [2024] și [2025]?");
    expect(marked(q({ block: "trend", dim: "authority", filters: { ...years, county: "Cluj" } }))).toBe("Ce [instituții publice] din [județul Cluj] au cea mai mare schimbare între [2024] și [2025]?");
    expect(marked(q({ block: "trend", dim: "county", filters: { ...years, authorityKind: "comuna" } })))
      .toBe("Ce [județe] au cea mai mare schimbare a achizițiilor făcute de [primăriile de comună] între [2024] și [2025]?");
    // Without years the engine compares the archive's first and last years.
    expect(marked(q({ block: "trend", dim: "supplier" }))).toBe("Ce [firme] au cea mai mare schimbare între [primul an] și [ultimul an]?");
    expect(marked(q({ block: "trend", dim: "supplier", filters: { yearFrom: 2020 } }))).toBe("Ce [firme] au cea mai mare schimbare între [2020] și [ultimul an]?");
    expect(slots(q({ block: "trend", dim: "supplier", filters: years })).map((t) => t.id)).toEqual(["dim", "period", "period.2"]);
    // An old link's employees, administrator, and a firm on a ranking of firms stay under the sentence (plan §4.7).
    expect(under(q({ block: "trend", dim: "supplier", filters: { ...years, minEmployees: 1, ...ADMIN, ...PORR } }))).toEqual(["admin", "employees", "supplier"]);
  });

  it("network: the partners' conditions are a row, not the sentence (§4.8)", () => {
    expect(marked(q({ block: "network", dim: "authority", filters: BUZAU }))).toBe("Cu cine lucrează [MUNICIPIUL BUZAU], în [toți anii]?");
    expect(marked(q({ block: "network", dim: "authority", dataset: "da", filters: { ...BUZAU, cpvTerm: "asfaltare", yearFrom: 2025, yearTo: 2025 } })))
      .toBe("Cu cine lucrează [MUNICIPIUL BUZAU] pentru [„asfaltare”] prin [achiziții directe], în [2025]?");
    expect(slotOf(q({ block: "network", dim: "supplier", filters: PORR }), "supplier")).toMatchObject({ picker: "focal", window: "Despre cine vrei să afli?", writes: ["authority"] });
    expect(under(q({ block: "network", dim: "authority", filters: { ...BUZAU, minEmployees: 1, ...ADMIN } }))).toEqual(["admin", "employees"]);
    expect(under(q({ block: "network", dim: "supplier", filters: { ...PORR, county: "Cluj", authorityKind: "spital" } }))).toEqual(["authorityKind", "county"]);
  });

  it("sankey: the institution buys, never «vinde» (§4.9)", () => {
    expect(marked(q({ block: "sankey", dim: "authority", filters: { authorityName: "Municipiul Buzău" } }))).toBe("Ce cumpără [Municipiul Buzău] și de la cine, în [toți anii]?");
    expect(marked(q({ block: "sankey", dim: "supplier", filters: { ...PORR, yearFrom: 2024, yearTo: 2025 } }))).toBe("Cine cumpără ce de la [PORR CONSTRUCT], în [2024–2025]?");
    expect(marked(q({ block: "sankey", dim: "authority", dataset: "da", filters: { authorityName: "Municipiul Buzău", cpvTerm: "45" } }), { cpvName: "Lucrări de construcții" }))
      .toBe("Ce cumpără [Municipiul Buzău] în domeniul [lucrări de construcții] prin [achiziții directe] și de la cine, în [toți anii]?");
    expect(marked(q({ block: "sankey", dim: "supplier", dataset: "contracts", filters: { ...PORR, cpvTerm: "drumuri" } })))
      .toBe("Cine cumpără ce în domeniul [„drumuri”] de la [PORR CONSTRUCT] prin [contracte din proceduri], în [toți anii]?");
  });

  it("fact_check: the period says «până acum» and carries its preposition (§4.10)", () => {
    const pair = { ...BUZAU, supplierName: "URBAN SCOPE", supplierId: 5 };
    expect(marked(q({ block: "fact_check", filters: pair }))).toBe("A cumpărat [MUNICIPIUL BUZAU] de la [URBAN SCOPE] [până acum]?");
    expect(marked(q({ block: "fact_check", filters: { ...pair, yearFrom: 2024, yearTo: 2024 } }))).toBe("A cumpărat [MUNICIPIUL BUZAU] de la [URBAN SCOPE] [în 2024]?");
    expect(marked(q({ block: "fact_check", filters: { ...pair, yearFrom: 2023 } }))).toBe("A cumpărat [MUNICIPIUL BUZAU] de la [URBAN SCOPE] [din 2023 încoace]?");
    expect(marked(q({ block: "fact_check", filters: { ...pair, yearTo: 2021 } }))).toBe("A cumpărat [MUNICIPIUL BUZAU] de la [URBAN SCOPE] [până în 2021]?");
    expect(marked(q({ block: "fact_check", filters: { ...pair, yearFrom: 2024, yearTo: 2024, monthFrom: 3, monthTo: 6 } }))).toBe("A cumpărat [MUNICIPIUL BUZAU] de la [URBAN SCOPE] [în mar.–iun. 2024]?");
    expect(marked(q({ block: "fact_check", dataset: "da", filters: { ...pair, cpvTerm: "45233250", yearFrom: 2024, yearTo: 2024 } }), { cpvName: "Lucrări de pavare" }))
      .toBe("A cumpărat [MUNICIPIUL BUZAU] [lucrări de pavare] de la [URBAN SCOPE] prin [achiziții directe] [în 2024]?");
    expect(marked(q({ block: "fact_check" }))).toBe("A cumpărat [alege o instituție] de la [alege o firmă] [până acum]?");
    expect(slotOf(q({ block: "fact_check", filters: pair }), "period")?.window).toBe("Când?");
    expect(under(q({ block: "fact_check", filters: { ...pair, county: "Buzău", authorityKind: "comuna", minEmployees: 1, ...ADMIN } }))).toEqual(["admin", "authorityKind", "county", "employees"]);
  });

  it("distribution: the group the entity is placed in (§4.11)", () => {
    expect(marked(q({ block: "distribution", dim: "authority", filters: BUZAU }))).toBe("Unde se situează [MUNICIPIUL BUZAU] după indicele de risc, față de [toate instituțiile publice]?");
    expect(marked(q({ block: "distribution", dim: "authority", filters: { ...BUZAU, county: "Buzău" } }))).toBe("Unde se situează [MUNICIPIUL BUZAU] după indicele de risc, față de [instituțiile publice din județul Buzău]?");
    expect(marked(q({ block: "distribution", dim: "authority", filters: { authorityName: "Spitalul Județean Cluj", authorityKind: "spital", county: "Cluj" } })))
      .toBe("Unde se situează [Spitalul Județean Cluj] după indicele de risc, față de [spitalele din județul Cluj]?");
    expect(marked(q({ block: "distribution", dim: "supplier", filters: { supplierName: "DEDEMAN" } }))).toBe("Unde se situează [DEDEMAN] după indicele de risc, față de [toate firmele]?");
    // On firm profiles the county is the seat (R9).
    expect(marked(q({ block: "distribution", dim: "supplier", filters: { supplierName: "DEDEMAN", county: "Bacău" } }))).toBe("Unde se situează [DEDEMAN] după indicele de risc, față de [firmele cu sediul în județul Bacău]?");
    expect(slotOf(q({ block: "distribution", dim: "authority", filters: { ...BUZAU, authorityKind: "comuna", county: "Buzău" } }), "county"))
      .toMatchObject({ says: ["county", "authorityKind"], window: "Față de cine?" });
    // Transaction keys and a kind on firms are refused on a profile: under the sentence, with their reason.
    expect(under(q({ block: "distribution", dim: "supplier", filters: { supplierName: "DEDEMAN", authorityKind: "spital", cpvTerm: "x", yearFrom: 2025 } }))).toEqual(["authorityKind", "cpvTerm", "period"]);
  });

  it("scatter: «Cine» and «Unde», the fixed place of county councils (§4.12)", () => {
    const tail = " ies din tipar după risc și valoarea achizițiilor directe?";
    expect(marked(q({ block: "scatter", dim: "authority" }))).toBe(`Ce [instituții publice] din [toată țara]${tail}`);
    expect(marked(q({ block: "scatter", dim: "authority", filters: { authorityKind: "comuna", county: "Buzău" } }))).toBe(`Ce [primării de comună] din [județul Buzău]${tail}`);
    expect(marked(q({ block: "scatter", dim: "supplier" }))).toBe(`Ce [firme] din [toată țara]${tail}`);
    expect(marked(q({ block: "scatter", dim: "supplier", filters: { county: "Buzău" } }))).toBe(`Ce [firme] cu sediul [în județul Buzău]${tail}`);
    expect(slotOf(q({ block: "scatter", dim: "supplier", filters: { county: "Buzău" } }), "county")?.window).toBe("Unde au sediul firmele?");
    // Component 1b: one council per county, so the place is text with its (?).
    const councils = sentenceTokens(q({ block: "scatter", dim: "authority", filters: { authorityKind: "consiliu_judetean" } }));
    expect(marked(q({ block: "scatter", dim: "authority", filters: { authorityKind: "consiliu_judetean" } }))).toBe(`Ce [consilii județene] {din toată țara}${tail}`);
    expect(councils.find((t) => t.kind === "fixed")).toEqual({ kind: "fixed", text: "din toată țara", says: [], tip: "Un consiliu pe județ." });
    // An old link with a county keeps it said, as the engine applies it.
    expect(marked(q({ block: "scatter", dim: "authority", filters: { authorityKind: "consiliu_judetean", county: "Cluj" } }))).toBe(`Ce [consilii județene] din [județul Cluj]${tail}`);
    expect(slotOf(q({ block: "scatter", dim: "authority" }), "dim")).toMatchObject({ window: "Cine?", writes: ["authorityKind"] });
  });

  it("entity_card: the subject first, the axis is the verb (§4.13)", () => {
    expect(marked(q({ block: "entity_card", dim: "supplier", rankBy: "value" })))
      .toBe("Care [firmă] [câștigă cel mai mult] din [achizițiile] făcute de [instituțiile publice] din [toată țara], în [toți anii]?");
    expect(marked(q({ block: "entity_card", dim: "supplier", rankBy: "value", filters: { minEmployees: 1, maxEmployees: 9, ...ADMIN, cpvTerm: "medicamente", yearFrom: 2025, yearTo: 2025 } })))
      .toBe("Care [firmă] [cu 1–9 angajați] condusă azi de [POPESCU ION (n. 1970)] [câștigă cel mai mult] din [achizițiile] pentru [„medicamente”] făcute de [instituțiile publice] din [toată țara], în [2025]?");
    expect(marked(q({ block: "entity_card", dim: "authority", rankBy: "value", filters: { authorityKind: "comuna", county: "Cluj", supplierName: "ALLIANCE HEALTHCARE ROMANIA" } })))
      .toBe("Care [primărie de comună] din [județul Cluj] [cumpără cel mai mult] de la [ALLIANCE HEALTHCARE ROMANIA], prin [toate achizițiile], în [toți anii]?");
    expect(marked(q({ block: "entity_card", dim: "supplier", rankBy: "risk", filters: { county: "Cluj" } }))).toBe("Care [firmă] cu sediul [în județul Cluj] [are cel mai ridicat indice de risc]?");
    expect(marked(q({ block: "entity_card", dim: "authority", rankBy: "risk", filters: { county: "Cluj", authorityKind: "consiliu_judetean" } })))
      .toBe("Care [consiliu județean] din [județul Cluj] [are cel mai ridicat indice de risc]?");
    // Without rankBy the question runs as the index (leaderAxis): it reads as one.
    expect(marked(q({ block: "entity_card", dim: "authority" }))).toBe("Care [instituție] din [toată țara] [are cel mai ridicat indice de risc]?");
    const axis = slotOf(q({ block: "entity_card", dim: "supplier", rankBy: "value" }), "rankBy");
    expect(axis).toMatchObject({ window: "Ce cauți?", says: ["rankBy"] });
    expect(slotOf(q({ block: "entity_card", dim: "supplier", rankBy: "value" }), "dim")?.window).toBe("Cine concurează?");
    // Tautologies of an old link (a firm on the firms, an institution on the institutions) stay under the sentence (plan §4.13).
    expect(under(q({ block: "entity_card", dim: "supplier", rankBy: "value", filters: PORR }))).toEqual(["supplier"]);
    expect(under(q({ block: "entity_card", dim: "authority", rankBy: "value", filters: BUZAU }))).toEqual(["authority"]);
    expect(under(q({ block: "entity_card", dim: "supplier", rankBy: "risk", filters: { minEmployees: 1, ...ADMIN, cpvTerm: "x" } }))).toEqual(["admin", "cpvTerm", "employees"]);
  });

  it("waits for D1 before saying the kinds the names misclassify (plan §9 F1)", () => {
    expect(KINDS_AFTER_D1).toEqual({ scatter: ["oras_municipiu"], entity_card: ["oras_municipiu", "spital"] });
    const towns = q({ block: "scatter", dim: "authority", filters: { authorityKind: "oras_municipiu" } });
    expect(marked(towns)).toBe("Ce [instituții publice] din [toată țara] ies din tipar după risc și valoarea achizițiilor directe?");
    expect(under(towns)).toEqual(["authorityKind"]);
    const hospitals = q({ block: "entity_card", dim: "authority", rankBy: "value", filters: { authorityKind: "spital", county: "Cluj" } });
    expect(marked(hospitals)).toBe("Care [instituție] din [județul Cluj] [cumpără cel mai mult], prin [toate achizițiile], în [toți anii]?");
    expect(under(hospitals)).toEqual(["authorityKind"]);
    // Only the subject waits: the buyers of a ranking of firms keep every kind, as on "Cine câștigă?" (review S2-F1b).
    const toHospitals = q({ block: "entity_card", dim: "supplier", rankBy: "value", filters: { authorityKind: "spital", yearFrom: 2025, yearTo: 2025 } });
    expect(marked(toHospitals)).toBe("Care [firmă] [câștigă cel mai mult] din [achizițiile] făcute de [spitalele] din [toată țara], în [2025]?");
    expect(under(toHospitals)).toEqual([]);
    expect(kindAfterD1(toHospitals, "spital")).toBe(false);
    expect(kindAfterD1(hospitals, "spital")).toBe(true);
    // Elsewhere the kinds are said as today.
    expect(marked(q({ block: "table", dim: "authority", filters: { authorityKind: "oras_municipiu" } }))).toMatch(/^Ce \[primării de oraș și municipiu\] din/);
    expect(marked(q({ block: "entity_card", dim: "authority", rankBy: "risk", filters: { authorityKind: "scoala" } }))).toBe("Care [școală] din [toată țara] [are cel mai ridicat indice de risc]?");
  });
});

describe("the sentences of the legacy corpus (plan §2.6, §6.2)", () => {
  it("pins what each old link and each page of the site opens as", () => {
    const shown = Object.fromEntries(corpus.filter((entry) => /^(legacy|site):/.test(entry.id)).map((entry) => {
      const rest = under(entry.spec);
      return [entry.id, `${sentenceText(sentenceTokens(entry.spec))}${rest.length ? ` · sub propoziție: ${rest.join(", ")}` : ""}`];
    }));
    expect(shown).toEqual({
      "site:home-roads": "Ce firme câștigă achizițiile pentru „drumuri” făcute de instituțiile publice din toată țara, în toți anii?",
      "site:home-hospitals": "Ce cumpără spitalele din toată țara, în toți anii?",
      "site:home-contract-winners": "Ce firme câștigă contractele din proceduri încheiate de instituțiile publice din toată țara, în toți anii?",
      "site:home-da-count": "Câte achiziții directe au fost făcute de instituțiile publice din toată țara, în toți anii? · sub propoziție: population",
      "site:home-contract-count": "Câte contracte din proceduri au fost încheiate de instituțiile publice din toată țara, în toți anii?",
      "site:home-value": "Cât valorează achizițiile făcute de instituțiile publice din toată țara, în toți anii?",
      "site:home-map": "Cum se împart achizițiile făcute de instituțiile publice pe județe, în toți anii?",
      "site:county-breakdown": "Ce cumpără instituțiile publice din județul Buzău, în toți anii?",
      "site:entity-channel-authority-da": "Cât valorează achizițiile directe făcute de Municipiul Fixture Nord, în toți anii?",
      "site:entity-channel-authority-contracts": "Cât valorează contractele din proceduri încheiate de Municipiul Fixture Nord, în toți anii?",
      "site:entity-channel-authority-all": "Cât valorează achizițiile făcute de Municipiul Fixture Nord, în toți anii?",
      "site:entity-channel-supplier-da": "Cât valorează achizițiile directe de la Fixture Construct SRL, în toți anii?",
      "site:person-firms": "Ce firme conduse azi de POPESCU FIXTURE ION câștigă achizițiile făcute de instituțiile publice din toată țara, în toți anii?",
      "site:entity-month-authority": "Cât valorează achizițiile directe făcute de Municipiul Fixture Nord, în mar. 2025?",
      "site:entity-month-supplier": "Cât valorează achizițiile directe de la Fixture Construct SRL, în iul. 2025?",
      "site:pair": "Cât valorează achizițiile făcute de Comuna Fixture Vest de la Fixture Construct SRL, în toți anii?",
      "site:domain-ranking": "Ce firme câștigă achizițiile pentru CPV 45 făcute de instituțiile publice din toată țara, în 2025?",
      "site:domain-evolution": "Cum evoluează valoarea tuturor achizițiilor pentru CPV 45 făcute de instituțiile publice din toată țara, an de an, 2025?",
      "site:domain-sources-all": "Ce cumpără instituțiile publice din toată țara, în 2025?",
      "site:domain-sources-division": "Ce cumpără instituțiile publice din toată țara în domeniul CPV 45, în 2025?",
      "site:domain-sources-other": "Ce cumpără instituțiile publice din toată țara, în 2025?",
      "site:person-clip": "Ce firme conduse azi de persoana aleasă câștigă achizițiile făcute de instituțiile publice din toată țara, în toți anii?",
      "site:pair-contracts": "A cumpărat Entitatea #9100000001 de la Entitatea #9100000101 prin contracte din proceduri până acum?",
      "site:capture-person": "Cât valorează achizițiile de la firmele conduse azi de persoana aleasă, în toți anii?",
      "site:capture-entity": "Cât valorează achizițiile făcute de instituțiile publice din toată țara, în toți anii? · sub propoziție: population",
      "site:connection-pair": "Cât valorează achizițiile făcute de Comuna Fixture Vest de la Fixture Construct SRL, în 2024–2025?",
      "site:connection-evidence": "Cât valorează achizițiile de la Entitatea #9100000101, în 2024–2026? · sub propoziție: population",
      "site:peer-source": "Cât valorează achizițiile făcute de Municipiul Fixture Nord, în 2025? · sub propoziție: population",
      "site:peer-evidence": "Cât valorează achizițiile făcute de instituțiile publice din toată țara, în 2025? · sub propoziție: population",
      "site:topic-total": "Cât valorează achizițiile pentru „drumuri” făcute de instituțiile publice din județul Cluj, în 2025?",
      "site:topic-top": "Ce firme câștigă achizițiile pentru „drumuri” făcute de instituțiile publice din județul Cluj, în 2025?",
      "site:topic-domains": "Ce cumpără Municipiul Fixture Nord, în toți anii?",
      "site:source-entity-row": "Ce firme câștigă achizițiile făcute de instituțiile publice din toată țara, în 2025?",
      "site:source-entity-spec": "Cât valorează achizițiile de la Fixture Construct SRL, în 2025?",
      "site:source-year": "Cum evoluează valoarea tuturor achizițiilor făcute de instituțiile publice din toată țara, an de an?",
      "site:slice-deeper": "Ce cumpără instituțiile publice din toată țara în domeniul CPV 4523, în toți anii?",
      "site:slice-records": "Ce cumpără instituțiile publice din toată țara în domeniul CPV 45, în toți anii?",
      "site:node-records": "Cu cine lucrează Municipiul Fixture Nord, în toți anii?",
      "site:ribbon-records": "Ce cumpără Municipiul Fixture Nord și de la cine, în toți anii?",
      "site:map-county-records": "Cum se împart achizițiile făcute de instituțiile publice pe județe, în toți anii?",
      "site:leader-alone-peers": "Unde se situează Consiliul Judetean Alba după indicele de risc, față de consiliile județene?",
      "site:leader-alone-total": "Cât valorează achizițiile făcute de Consiliul Judetean Alba, în 2025?",
      "legacy:minimum-table-supplier-role": "Ce instituții publice din toată țara cumpără cel mai mult, prin toate achizițiile, în 2025? · sub propoziție: minimumRecords",
      "legacy:minimum-table-authority-role": "Ce instituții publice din toată țara cumpără cel mai mult, prin toate achizițiile, în 2025? · sub propoziție: minimumRecords",
      "legacy:minimum-stat": "Cât valorează achizițiile făcute de instituțiile publice din toată țara, în toți anii? · sub propoziție: minimumRecords",
      "legacy:minimum-map": "Cum se împart achizițiile făcute de instituțiile publice pe județe, în toți anii? · sub propoziție: minimumRecords",
      "legacy:minimum-leader-value": "Care firmă câștigă cel mai mult din achizițiile făcute de instituțiile publice din toată țara, în toți anii? · sub propoziție: minimumRecords",
      "legacy:minimum-trend-refused": "Ce firme au cea mai mare schimbare între 2024 și 2025? · sub propoziție: minimumRecords",
      "legacy:minimum-profile-refused": "Unde se situează Entitatea #9100000004 după indicele de risc, față de toate instituțiile publice? · sub propoziție: minimumRecords",
      "legacy:single-bidder-stat": "Cât valorează contractele din proceduri încheiate de instituțiile publice din toată țara, în toți anii? · sub propoziție: singleBidder",
      "legacy:single-bidder-table": "Ce firme câștigă contractele din proceduri încheiate de instituțiile publice din toată țara, în toți anii? · sub propoziție: singleBidder",
      "legacy:comparison-mode-transactions": "Compară Fixture Construct SRL cu Fixture Partener SRL la toate achizițiile, în 2025.",
      // Off the kit's bands (0 · 1–9 · …): the old range is the link's chip, not a phrase whose window could not show it (kit §5.5).
      "legacy:employees-under-5": "Ce firme câștigă achizițiile făcute de instituțiile publice din toată țara, în toți anii? · sub propoziție: employees",
      "legacy:employees-250-plus": "Cât valorează achizițiile făcute de instituțiile publice din toată țara de la firme cu cel puțin 250 de angajați, în toți anii?",
      "legacy:employees-on-authorities": "Ce instituții publice din toată țara cumpără cel mai mult de la firme cu 1–49 de angajați, prin toate achizițiile, în toți anii?",
      "legacy:contracts-distribution-refused": "Unde se situează Entitatea #9100000004 după indicele de risc, față de toate instituțiile publice? · sub propoziție: dataset",
      "legacy:contracts-scatter-refused": "Ce instituții publice din toată țara ies din tipar după risc și valoarea achizițiilor directe? · sub propoziție: dataset",
      "legacy:da-scatter": "Ce instituții publice din toată țara ies din tipar după risc și valoarea achizițiilor directe? · sub propoziție: dataset",
      "legacy:county-scatter-firms": "Ce firme cu sediul în județul Cluj ies din tipar după risc și valoarea achizițiilor directe?",
      "legacy:leader-without-rankBy": "Care instituție din toată țara are cel mai ridicat indice de risc?",
      "legacy:trend-without-years": "Ce firme au cea mai mare schimbare între primul an și ultimul an?",
      "legacy:trend-without-topN": "Ce firme au cea mai mare schimbare între 2024 și 2025?",
      "legacy:count-on-breakdown": "Ce cumpără instituțiile publice din județul Cluj, în toți anii?",
      "legacy:count-on-trend": "Ce instituții publice au cea mai mare schimbare între 2025 și 2026?",
      "legacy:per-capita-firms-refused": "Ce firme câștigă achizițiile făcute de instituțiile publice din toată țara, în toți anii?",
      "legacy:per-capita-stat": "Cât valorează achizițiile făcute de instituțiile publice din județul Cluj, în toți anii?",
      "legacy:population-exclude-cpv": "Cât valorează achizițiile făcute de instituțiile publice din toată țara, în 2025? · sub propoziție: population",
      "legacy:population-exclude-firm": "Ce firme câștigă achizițiile făcute de instituțiile publice din toată țara, în toți anii? · sub propoziție: population",
      "legacy:population-include-buyers": "Ce firme câștigă achizițiile făcute de instituțiile publice din toată țara, în toți anii? · sub propoziție: population",
      "legacy:population-counties": "Cum se împart achizițiile făcute de instituțiile publice pe județe, în toți anii? · sub propoziție: population",
      "legacy:population-date-value": "Cât valorează achizițiile făcute de instituțiile publice din toată țara, în toți anii? · sub propoziție: population",
      "legacy:population-or-groups": "Cum evoluează valoarea tuturor achizițiilor făcute de instituțiile publice din toată țara, an de an? · sub propoziție: population",
      "legacy:population-on-trend": "Ce firme au cea mai mare schimbare între 2024 și 2025? · sub propoziție: population",
      "legacy:admin-trend": "Ce instituții publice au cea mai mare schimbare între 2024 și 2025? · sub propoziție: admin",
      "legacy:admin-leader-value": "Care firmă condusă azi de persoana aleasă câștigă cel mai mult din achizițiile făcute de instituțiile publice din toată țara, în toți anii?",
      "legacy:admin-unidentified": "Cât valorează achizițiile de la firmele conduse azi de persoana aleasă, în toți anii?",
      "legacy:supplier-on-authority-leader": "Care instituție din toată țara cumpără cel mai mult de la Fixture Construct SRL, prin toate achizițiile, în toți anii?",
      "legacy:authority-on-supplier-leader": "Care firmă câștigă cel mai mult din achizițiile făcute de Municipiul Fixture Nord, în toți anii?",
      "legacy:scatter-rankBy-value": "Ce instituții publice din toată țara ies din tipar după risc și valoarea achizițiilor directe?",
      "legacy:months-stat": "Cât valorează achizițiile făcute de instituțiile publice din toată țara, în feb.–iun. 2025?",
      "legacy:months-trend-refused": "Ce firme au cea mai mare schimbare între 2024 și 2025?",
      "legacy:years-clamped": "Cum evoluează valoarea tuturor achizițiilor făcute de instituțiile publice din toată țara, an de an, 2021–2030?",
      "legacy:years-outside": "Cât valorează achizițiile făcute de instituțiile publice din toată țara, în 2014–2016?",
      "legacy:locality-map-refused": "Cum se împart achizițiile făcute de instituțiile publice pe județe, în toți anii? · sub propoziție: locality",
      "legacy:locality-stat": "Cât valorează achizițiile făcute de primăria Aiud (Alba), în toți anii?",
      "legacy:locality-ranking": "Ce firme câștigă achizițiile făcute de primăria Aiud (Alba), în toți anii?",
      "legacy:newer-key-refused": "Ce firme au cea mai mare schimbare între 2024 și 2025? · sub propoziție: trendChange",
      "legacy:other-block-options": "Ce firme câștigă achizițiile făcute de instituțiile publice din toată țara, în toți anii?",
      "legacy:cpv-retired": "Cât valorează achizițiile pentru „lucrări” făcute de instituțiile publice din toată țara, în toți anii?",
      "legacy:cpv-unknown": "Cât valorează achizițiile pentru „zzzz necunoscut” făcute de instituțiile publice din toată țara, în toți anii?",
      "legacy:cpv-fuzzy": "Cât valorează achizițiile pentru „combustibil” făcute de instituțiile publice din toată țara, în toți anii?",
      "legacy:cpv-union": "Ce cumpără instituțiile publice din toată țara în domeniul „drumuri” și „medicamente”, în toți anii?",
      "legacy:cpv-code": "Ce instituții publice din toată țara cumpără cel mai mult pentru CPV 45233140, prin toate achizițiile, în toți anii?",
      "legacy:county-unknown": "Cât valorează achizițiile făcute de instituțiile publice din județul Atlantida, în toți anii?",
      "legacy:authority-unknown": "Cât valorează achizițiile făcute de Instituția Inexistentă Zzz, în toți anii?",
      "legacy:fact-check-no": "A cumpărat Scoala Gimnaziala Fixture de la Fixture Servicii SA până acum?",
      "legacy:distribution-no-profile": "Unde se situează Agentia Fixture Nationala după indicele de risc, față de toate instituțiile publice?",
      "legacy:network-empty": "Cu cine lucrează Scoala Gimnaziala Fixture pentru „parcuri”, în toți anii?",
      "legacy:sankey-empty": "Ce cumpără Scoala Gimnaziala Fixture în domeniul „parcuri” și de la cine, în toți anii?",
      "legacy:leader-none": "Care firmă cu sediul în județul Alba are cel mai ridicat indice de risc?",
      "legacy:trend-same-year": "Ce firme au cea mai mare schimbare între 2025 și 2025?",
      "legacy:profile-years-refused": "Ce instituții publice din toată țara ies din tipar după risc și valoarea achizițiilor directe? · sub propoziție: period",
      "legacy:profile-firm-kind-refused": "Care firmă are cel mai ridicat indice de risc? · sub propoziție: authorityKind",
    });
  });

  it("are well formed on every spec of the corpus", () => {
    expect(corpus.length).toBeGreaterThan(200);
    for (const { id, spec } of corpus) {
      const tokens = sentenceTokens(spec), text = sentenceText(tokens);
      expect(tokens.length, id).toBeGreaterThan(1);
      expect(text, id).toMatch(spec.block === "compare" ? /^\S.*\S\.$/ : /^\S.*\S\?$/);
      expect(text, id).not.toMatch(/\s{2}|\s[,.?]|undefined|null|NaN|\[object/);
      const ids = tokens.filter((t): t is SentenceSlot => t.kind === "slot").map((t) => t.id);
      expect(new Set(ids).size, id).toBe(ids.length);
      for (const token of tokens) if (token.kind === "slot") {
        expect(token.value.trim(), `${id} ${token.id}`).toBe(token.value);
        expect(token.value, `${id} ${token.id}`).not.toBe("");
        expect(token.window, `${id} ${token.id}`).toMatch(/\?$/);
        expect(token.writes ?? [], `${id} ${token.id}`).not.toContain(token.filter);
      }
    }
  });

  it("put the subject first where the question ranks (table, trend, scatter, entity_card), with the axis at entity_card", () => {
    for (const { id, spec } of corpus) {
      const list = slots(spec);
      if (["table", "trend", "scatter", "entity_card"].includes(spec.block)) expect(list[0]?.filter, id).toBe("dim");
      else expect(list.some((t) => t.filter === "dim"), id).toBe(false);
      if (spec.block === "entity_card") expect(list.filter((t) => t.filter === "rankBy"), id).toHaveLength(1);
    }
  });

  it("say what their phrases claim: each said condition's value is in the text", () => {
    for (const { id, spec } of corpus) {
      const tokens = sentenceTokens(spec), text = sentenceText(tokens), said = saidFilters(tokens), f = spec.filters;
      const named: [FilterId, unknown][] = [["authority", f.authorityName], ["supplier", f.supplierName], ["compareWith", f.compareWith], ["county", f.county], ["period", f.yearFrom], ["period", f.yearTo]];
      for (const [filter, value] of named) if (said.has(filter) && value !== undefined) expect(text, `${id} ${filter}`).toContain(String(value));
      if (said.has("cpvTerm")) expect(text, id).toContain(subjectWords(spec)!);
      // Every key a spec carries is said by the sentence or listed under it: none is dropped.
      const present = new Set(presentPaths(spec).map((path) => SPEC_PATH_OWNERS[path]));
      for (const filter of said) if (!["dataset", "rankBy", "dim"].includes(filter)) expect(present.has(filter), `${id} ${filter}`).toBe(true);
    }
  });
});

describe("one vocabulary (kit §4, plan G3, G10)", () => {
  // A run of the kit's bands with numbers past 20 (G10); an old link's range off the bands stays under the sentence (kit §5.5).
  const specs = [...corpus.map((c) => c.spec), ...corpus.map((c) => ({ ...c.spec, filters: { ...c.spec.filters, minEmployees: 50, maxEmployees: 249 } }))];

  it("uses the words describeConditions gives the same conditions", () => {
    let checked = 0;
    for (const spec of specs) {
      const tokens = sentenceTokens(spec), text = sentenceText(tokens), words = describeConditions(spec).byId;
      for (const token of tokens) {
        if (token.kind !== "slot") continue;
        const filter = token.filter;
        if (!["employees", "admin", "locality", "cpvTerm", "county", "period"].includes(filter) || !token.says.includes(filter)) continue;
        // The period of a timeseries ("an de an, 2021–2026") and of a trend (two years) have their own form.
        if (filter === "period" && ["timeseries", "trend"].includes(spec.block)) continue;
        const said = words[filter]?.words;
        expect(said, `${spec.block} ${filter}`).toBeDefined();
        expect(text.includes(said!) || said!.endsWith(token.value), `${JSON.stringify(spec)}: «${said}» in «${text}»`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("keeps the kit's words and never the ones it retires", () => {
    const texts = specs.map((spec) => sentenceText(sentenceTokens(spec)));
    const all = texts.join("\n");
    for (const retired of ["toată România", "toți anii disponibili", "Toată perioada", "Municipiului", "Orașului", "Comunei", "un singur ofertant", "Ce vinde", "Din proceduri", "toate sursele"])
      expect(all, retired).not.toContain(retired);
    expect(all).not.toMatch(/(?<!azi )(?:conduse|condusă) de/);
    expect(all).not.toMatch(/instituțiile(?! publice)/);
    expect(all).not.toMatch(/[şţŞŢ]/);
  });

  it("routes every count with its noun through countWords (G10)", () => {
    const nouns = "înregistrări|firme|instituții|angajați|achiziții|contracte";
    const missingDe = new RegExp(`(?<![\\d.,–])(\\d{1,3}(?:\\.\\d{3})*|\\d+) (?:${nouns})\\b`, "g");
    const offending = specs.flatMap((spec) => [...sentenceText(sentenceTokens(spec)).matchAll(missingDe)].filter((m) => {
      const n = Number(m[1]!.replace(/\./g, "")), lastTwo = n % 100;
      return n !== 0 && (lastTwo === 0 || lastTwo >= 20);
    }).map((m) => m[0]));
    expect(offending).toEqual([]);
    expect(sentenceText(sentenceTokens(q({ block: "stat", filters: { minEmployees: 50, maxEmployees: 249 } })))).toContain("de la firme cu 50–249 de angajați");
    expect(sentenceText(sentenceTokens(q({ block: "stat", filters: { minEmployees: 20, maxEmployees: 120 } })))).not.toContain("angajați");
  });

  it("says the firm's seat «cu sediul în …», never «din …» (R9)", () => {
    for (const { id, spec } of corpus) {
      if (!spec.filters.county || !countyIsFirmSeat(spec, filterContext(spec).role) || spec.block === "distribution") continue;
      const tokens = sentenceTokens(spec);
      const at = tokens.findIndex((t) => t.kind === "slot" && t.filter === "county");
      const before = tokens[at - 1];
      expect(before?.kind === "text" && before.text.endsWith(" cu sediul "), id).toBe(true);
    }
  });
});

describe("the sentence as BLOCK_FILTERS places it", () => {
  it("lists each phrase's filter and what its window writes", () => {
    expect(sentenceSlots(sentenceTokens(q({ block: "table", dim: "supplier", topN: 10 })))).toEqual([
      { id: "dim", picker: "subject", writes: ["authorityKind"] },
      { id: "dataset" },
      { id: "authorityKind", picker: "buyer", writes: ["authority", "locality"] },
      { id: "county", writes: ["locality"] },
      { id: "period" },
    ]);
    expect(sentenceSlots(sentenceTokens(q({ block: "network", dim: "supplier", filters: PORR })))).toEqual([
      { id: "supplier", picker: "focal", writes: ["authority"] }, { id: "period" },
    ]);
  });

  it("hands the kit's Sentence its tokens as they are (builder/Sentence.tsx)", () => {
    const tokens: readonly KitSentenceToken[] = sentenceTokens(q({ block: "scatter", dim: "authority", filters: { authorityKind: "consiliu_judetean" } }));
    expect(tokens.map((t) => t.kind)).toEqual(["text", "slot", "text", "fixed", "text"]);
  });

  it("has a sentence for each of the 13 questions and none for an unknown one", () => {
    const blocks: Block[] = ["stat", "table", "timeseries", "map", "breakdown", "compare", "trend", "network", "sankey", "fact_check", "distribution", "scatter", "entity_card"];
    for (const block of blocks) expect(sentenceTokens(q({ block })).length, block).toBeGreaterThan(1);
    expect(sentenceTokens(q({ block: "pie" }))).toEqual([]);
  });
});
