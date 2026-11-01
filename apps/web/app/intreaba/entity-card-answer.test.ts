import { describe, expect, it } from "vitest";
import { riskPlaces, type LegacyTiePlace, type LegacyTies, type PodiumFact, type PodiumPlace, type RiskPlace, type RiskRanking } from "../../lib/ask/entity-card-shared";
import { unsupportedPopulationView } from "../../lib/ask/population";
import type { QuestionSpec } from "../../lib/ask/question-ui";
import { validateSpec } from "../../lib/ask/spec";
import {
  categoryLead, leadWords, legacyTieFacts, legacyTiesHeadline, legacyTiesRest, noneSources, patternWord, placeFacts, placeWords, profilePlace, rankingHeadline,
  rankingRest, restWords, riskCloudLink, riskFacts, scorePill, shareWords, showAllWords, shownRows, shownTied, subjectNouns, totalLead,
} from "./entity-card-answer";

/*
 * „Cine conduce?” (entity_card-3; entity_card-2: final entity_card §3.9–§3.10, frames C, E, F) as the answer draws
 * it: the place words, the tags (P8, at most three), the headline of the ranking by the risk score and the lines
 * under it, and those of an answer stored as entity_card-2 (the group at the top of the old index). Pure.
 */

const firm = { dim: "supplier", filters: {} } as const;
const hospitals = { dim: "authority", filters: { authorityKind: "spital" } } as const;
const alliance: PodiumPlace = { entityId: "1", name: "ALLIANCE", county: "Bucuresti", value: 5_577_504_292, count: 13_669 };
const fact = (extra: Partial<PodiumFact> = {}): PodiumFact => ({ entityId: "1", joint: 0, largest: null, employees: null, employeesYear: null, firstActivity: null, ...extra });

describe("a place beside its name", () => {
  it("says a firm's seat and an institution's county, with the list's spelling and a foreign firm apart", () => {
    expect(placeWords(alliance, firm)).toBe("Firmă · sediul în București");
    expect(placeWords({ county: "Cluj" }, firm)).toBe("Firmă · sediul în județul Cluj");
    expect(placeWords({ county: "Străinătate" }, firm)).toBe("Firmă · din străinătate");
    expect(placeWords({ county: null }, firm)).toBe("Firmă");
    expect(placeWords({ county: "Cluj" }, hospitals, 12_345)).toBe("Instituție · județul Cluj · 12.345 de locuitori");
    expect(placeWords({ county: "Bucuresti" }, hospitals)).toBe("Instituție · București");
  });

  it("names the ranked role and the kind of institution the question asks for", () => {
    expect(subjectNouns(firm)).toEqual({ one: "firmă", many: "firme" });
    expect(subjectNouns(hospitals)).toEqual({ one: "spital", many: "spitale" });
    expect(subjectNouns({ dim: "authority", filters: {} })).toEqual({ one: "instituție", many: "instituții" });
    expect(subjectNouns({ dim: "authority", filters: { authorityKind: "oras_municipiu" } }).many).toBe("primării de oraș și municipiu");
  });
});

describe("the tags of a place (P8)", () => {
  it("say the part in joint contracts from a quarter, and a single record from half (amber)", () => {
    const tags = placeFacts(alliance, fact({ joint: 0.47 * alliance.value, largest: { value: 452_900_000, src: "contracts" } }), firm, 2025);
    expect(tags.map((t) => t.text)).toEqual(["47% în asociere"]);
    expect(tags[0]!.tip).toEqual({ id: "in-asociere" });
    const one = placeFacts({ ...alliance, value: 91_300_000, count: 3 }, fact({ joint: 91_300_000, largest: { value: 91_300_000, src: "contracts" } }), firm, 2025);
    expect(one.map((t) => [t.text, t.tone ?? "neutral"])).toEqual([["100% în asociere", "neutral"], ["1 contract: 100%", "caveat"]]);
    // A direct acquisition says so.
    expect(placeFacts({ ...alliance, value: 1000, count: 2 }, fact({ largest: { value: 600, src: "da" } }), firm, 2025).map((t) => t.text)).toEqual(["1 achiziție directă: 60%"]);
    // A place of a single record carries it too (final §3.9: ENERGOMONTAJ, one joint contract, all three tags).
    expect(placeFacts({ ...alliance, value: 1000, count: 1 }, fact({ largest: { value: 1000, src: "da" } }), firm, 2025).map((t) => [t.text, t.tone])).toEqual([["1 achiziție directă: 100%", "caveat"]]);
    const energomontaj = placeFacts({ ...alliance, value: 91_300_000, count: 1 },
      fact({ joint: 91_300_000, largest: { value: 91_300_000, src: "contracts" }, employees: 0, employeesYear: 2024 }), { dim: "supplier", filters: { maxEmployees: 0 } }, 2025);
    expect(energomontaj.map((t) => t.text)).toEqual(["100% în asociere", "1 contract: 100%", "0 angajați · bilanț 2024"]);
  });

  it("put the sense of „Firme noi” first, as the rows of „Cine câștigă?” (S5R-entity-card-new-firms-merge)", () => {
    const registry = { dim: "supplier", filters: { newSince: 2024, newScope: "registry" } } as const;
    const facts = fact({ joint: 0.47 * alliance.value, firstActivity: "2024-05-02", registeredYear: 2024, firstHere: "2024-10-02" });
    expect(placeFacts(alliance, facts, registry, 2025).map((t) => t.text)).toEqual(["înmatriculată în 2024", "47% în asociere"]);
    expect(placeFacts(alliance, facts, { dim: "supplier", filters: { newSince: 2024, newScope: "archive" } }, 2025)[0]?.text).toBe("prima dată în 2024");
    expect(placeFacts(alliance, facts, { dim: "supplier", filters: { newSince: 2024, newScope: "buyer", authorityId: 7 } }, 2025)[0]?.text).toBe("prima dată aici: 02.10.2024");
    // Without the chip, or before the facts are read, no tag of its own.
    expect(placeFacts(alliance, facts, firm, 2025).map((t) => t.text)).toEqual(["47% în asociere"]);
    expect(placeFacts(alliance, fact({ registeredYear: null }), registry, 2025)).toEqual([]);
  });

  it("say „în asociere” of a firm only: an institution has no share in a contract of several winners", () => {
    const oncology = { ...alliance, name: "Institutul Oncologic Cluj", county: "Cluj" };
    expect(placeFacts(oncology, fact({ joint: 0.47 * oncology.value }), hospitals, 2025)).toEqual([]);
    expect(placeFacts(oncology, fact({ joint: 0.47 * oncology.value, largest: { value: 0.6 * oncology.value, src: "contracts" } }), hospitals, 2025)
      .map((t) => t.text)).toEqual(["1 contract: 60%"]);
  });

  it("carry the band the question set, with the balance sheet's year, amber when it is over two years old", () => {
    const band = { dim: "supplier", filters: { maxEmployees: 0 } } as const;
    expect(placeFacts(alliance, fact({ employees: 0, employeesYear: 2024 }), band, 2025).map((t) => [t.text, t.tone ?? "neutral"])).toEqual([["0 angajați · bilanț 2024", "neutral"]]);
    expect(placeFacts(alliance, fact({ employees: 0, employeesYear: 2021 }), band, 2025).map((t) => [t.text, t.tone])).toEqual([["0 angajați · bilanț 2021", "caveat"]]);
    // Old against the data's latest filing year, not the clock: without it the year shows and nothing is amber.
    expect(placeFacts(alliance, fact({ employees: 0, employeesYear: 2021 }), band, null).map((t) => [t.text, t.tone ?? "neutral"])).toEqual([["0 angajați · bilanț 2021", "neutral"]]);
    expect(placeFacts(alliance, fact({ employees: 0, employeesYear: 2023 }), band, 2026).map((t) => t.tone)).toEqual(["caveat"]);
    // Without a band, or a filing, no tag; without the facts yet, none.
    expect(placeFacts(alliance, fact({ employees: 3, employeesYear: 2024 }), firm, 2025)).toEqual([]);
    expect(placeFacts(alliance, undefined, band, 2025)).toEqual([]);
  });

  it("say the share, the lead and the rest in words", () => {
    expect(shareWords(alliance, { total: { value: 26_459_251_841, count: 1, entities: 1_467 } })).toBe("21,1%");
    expect(shareWords(alliance, { total: null })).toBeNull();
    expect(leadWords(1_210_000_000)).toBe("1,2 mld. lei");
    expect(restWords({ entities: 1_464, share: 0.492 }, firm)).toBe("celelalte 1.464 de firme · 49,2%");
    expect(restWords({ entities: 1, share: 0.1 }, firm)).toBe("cealaltă 1 firmă · 10,0%");
  });

  it("lead the total line with the total's value and its entities, institutions without a verb of spending", () => {
    const podium = { total: { value: 26_459_251_841, count: 236_891, entities: 1_467 } };
    expect(totalLead(podium, firm)).toEqual({ value: "26,5 mld. lei", link: ", câștigați de ", who: "1.467 de firme" });
    expect(totalLead({ total: { value: 2_296_574_007, count: 1, entities: 17 } }, hospitals)).toEqual({ value: "2,3 mld. lei", link: ", la ", who: "17 spitale" });
    expect(totalLead({ total: null }, firm)).toBeNull();
  });

  it("name the category under CÂȘTIGĂTORII as „Cine câștigă?” names its list, „Firme noi” included (S6)", () => {
    const podium = { total: { value: 1_226_153_468, count: 24_928, entities: 3_658 } };
    expect(categoryLead(podium, { dim: "supplier", filters: { newSince: 2024, newScope: "registry" } })).toBe("3.658 de firme înmatriculate din 2024");
    expect(categoryLead(podium, { dim: "supplier", filters: { newSince: 2024, newScope: "registry", minEmployees: 1, maxEmployees: 9 } })).toBe("3.658 de firme înmatriculate din 2024, cu 1–9 angajați");
    // The band alone keeps its words of F6c; never an empty lead before the colon.
    expect(categoryLead(podium, { dim: "supplier", filters: { maxEmployees: 0 } })).toBe("3.658 de firme fără angajați");
    expect(categoryLead({ total: null }, firm)).toBeNull();
  });
});

const ranked = (n: number, score: number, extra: Partial<RiskPlace> = {}): RiskPlace => ({
  entityId: String(n), name: `Spital ${n}`, county: "Cluj", count: 100 * n, value: 1000 - n, score, nFlags: 1, flags: ["da_split"], ...extra,
});
const ranking = (scores: number[], extra: Partial<RiskRanking> = {}): RiskRanking => {
  const top = Math.max(0, ...scores);
  return {
    version: 3, pool: scores.length + 5, scored: scores.filter((s) => s > 0).length, top, topCount: scores.filter((s) => s === top).length,
    rows: scores.map((score, i) => ranked(i + 1, score)), ...extra,
  };
};

describe("the ranking by the risk score (entity_card-3)", () => {
  it("names the first profile with its score and band, or the profiles tied on the best score", () => {
    expect(rankingHeadline(ranking([71, 60, 60, 58]), hospitals)).toEqual({ kind: "first", lead: "Primul: Spital 1", score: "71%", band: "puternic" });
    expect(rankingHeadline(ranking([71, 60], { rows: [ranked(1, 71, { name: "RO123456 SPITALUL ORASENESC AGNITA" })] }), hospitals).lead).toBe("Primul: SPITALUL ORASENESC AGNITA");
    expect(rankingHeadline(ranking([60, 60, 60, 58]), hospitals)).toEqual({ kind: "tied", lead: "3 la egalitate pe primul loc", score: "60%", band: "moderat" });
    // The tie counts the whole group, beyond the listed rows.
    expect(rankingHeadline(ranking([60, 60], { topCount: 312 }), firm).lead).toBe("312 la egalitate pe primul loc");
    expect(rankingHeadline(ranking([25]), firm)).toMatchObject({ kind: "first", score: "25%", band: "slab" });
  });

  it("says when nobody in the group has a score, and what the sources hold then", () => {
    const none = ranking([0, 0, 0], { pool: 17, scored: 0 });
    expect(rankingHeadline(none, hospitals)).toEqual({ kind: "none", kicker: "Nu are semnale în profil", lead: "Niciuna din 17 spitale nu are semnale în profil" });
    expect(noneSources(none.rows)).toBe("Sursele: primele 3 profiluri după valoare, fără semnale.");
    expect(noneSources([ranked(1, 0)])).toBe("Sursele: singurul profil, fără semnale.");
    expect(rankingRest(none, 0)).toBeNull();
  });

  it("numbers the places: the same place for the same displayed score", () => {
    expect(riskPlaces([{ score: 71 }, { score: 60 }, { score: 60 }, { score: 60 }, { score: 58 }, { score: 58 }])).toEqual([1, 2, 2, 2, 5, 5]);
    expect(riskPlaces([{ score: 60 }, { score: 60 }, { score: 60 }])).toEqual([1, 1, 1]);
    expect(riskPlaces([])).toEqual([]);
  });

  it("gives each row its pill: the score, the band's word and its colour", () => {
    expect(scorePill(71)).toEqual({ text: "71%", band: "puternic", className: "risk-high" });
    expect(scorePill(60)).toEqual({ text: "60%", band: "moderat", className: "risk-mid" });
    expect(scorePill(20)).toEqual({ text: "20%", band: "slab", className: "risk-slab" });
    expect(scorePill(0)).toEqual({ text: "0%", band: "niciun tipar găsit", className: "risk-none" });
  });

  it("says „În ordinea valorii” only when every shown row has the same score", () => {
    expect(shownTied([ranked(1, 60), ranked(2, 60), ranked(3, 60)])).toBe(true);
    expect(shownTied([ranked(1, 71), ranked(2, 60)])).toBe(false);
    expect(shownTied([ranked(1, 60)])).toBe(false);
  });

  it("shows five rows, all of them on request, and names the button by what the list holds", () => {
    const group = ranking([71, 60, 60, 58, 58, 40, 30, 20, 20, 20, 20, 20, 20, 20]);
    expect(shownRows(group.rows, false)).toMatchObject({ hidden: 9 });
    expect(shownRows(group.rows, false).rows).toHaveLength(5);
    expect(shownRows(group.rows, true)).toMatchObject({ hidden: 0 });
    expect(showAllWords(group)).toBe("Arată toate cele 14");
    // More profiles with a score than the 50 listed.
    expect(showAllWords({ ...group, scored: 120 })).toBe("Arată primele 14");
    // Once the whole list is shown, the profiles without a score are said; never while rows wait.
    expect(rankingRest(group, 0)).toBe("+ 5 fără semnale");
    expect(rankingRest(group, 9)).toBeNull();
    expect(rankingRest({ ...group, scored: 120 }, 0)).toBeNull();
    expect(rankingRest({ ...group, pool: group.scored }, 0)).toBeNull();
  });

  it("tags a profile's patterns in the site's words, two and „+N”, and a buyer that looks like a company or an association", () => {
    const flags = ["da_split", "da_year_end", "da_round", "da_above_ceiling"];
    const tags = riskFacts(ranked(1, 88, { flags, nFlags: 4 }), hospitals);
    expect(tags.map((t) => [t.text, t.tone ?? "neutral"])).toEqual([["achiziții repetate, peste plafon cumulat", "signal"], ["vârf în decembrie", "signal"], ["+2", "neutral"]]);
    expect(tags[2]!.tip).toEqual({ title: "Alte tipare", text: "chiar sub plafon, peste plafon. Piste de verificat, nu dovezi." });
    expect(patternWord("da_concentration")).toBe("concentrare pe un furnizor");
    // A code the site no longer names (da_rapid, retired) stays the code.
    expect(patternWord("da_rapid")).toBe("da_rapid");
    expect(riskFacts(ranked(2, 40, { name: "Eco Rural Consulting SRL-D", flags: ["da_split"] }), { dim: "authority", filters: {} }).map((t) => t.text))
      .toEqual(["achiziții repetate, peste plafon cumulat", "societate"]);
    expect(riskFacts(ranked(3, 40, { name: "Eco Rural Consulting SRL", flags: [] }), firm)).toEqual([]);
    expect(profilePlace(ranked(1, 40, { county: "Bucuresti", count: 1 }))).toBe("București · 1 achiziție directă");
  });
});

const tie = (n: number, extra: Partial<LegacyTiePlace> = {}): LegacyTiePlace => ({ entityId: String(n), name: `Spital ${n}`, county: "Cluj", count: 100 * n, value: 1000 - n, nFlags: 1, flags: ["da_split"], ...extra });
const ties = (count: number, pool: number, extra: Partial<LegacyTies> = {}): LegacyTies => ({
  version: 2, level: 0.2, maxFlags: 1, criteria: 5, count, pool, nextLevel: 0, nextCount: 5,
  rows: Array.from({ length: Math.min(count, 50) }, (_, i) => tie(i + 1)), ...extra,
});

describe("an answer stored as entity_card-2: the group at the top of the old index, as it was", () => {
  it("says „Indicele nu le deosebește” when over half of the pool, or a single signal, is at the top", () => {
    const head = legacyTiesHeadline(ties(14, 19), hospitals);
    expect(head).toMatchObject({ kicker: "Indicele nu le deosebește", lead: "14 din 19 spitale au același indice", level: "0,20", signals: "1 semnal din 5", none: false, notDistinct: true });
    expect(legacyTiesHeadline(ties(6, 53_556, { level: 1, maxFlags: 4, criteria: 4, nextLevel: 0.75, nextCount: 219 }), firm))
      .toMatchObject({ kicker: null, lead: "6 firme au indicele maxim", level: "1,00", signals: "4 semnale din 4", notDistinct: false });
  });

  it("names a single leader, with the next level; and says when nobody has a signal", () => {
    const head = legacyTiesHeadline(ties(1, 2_483, { level: 1, maxFlags: 4, criteria: 4, nextLevel: 0.75, nextCount: 14 }), firm);
    expect(head).toMatchObject({ kicker: "Singur pe primul loc", lead: "", level: "1,00", next: "Următorul nivel, 0,75: 14 din 2.483 de firme." });
    const none = legacyTiesHeadline(ties(17, 17, { level: 0, maxFlags: 0, nextLevel: null, nextCount: 0 }), hospitals);
    expect(none).toMatchObject({ kicker: "Nu are semnale în profil", none: true });
    expect(none.lead).toBe("Niciuna din 17 spitale nu are semnale în profil");
    expect(noneSources(ties(17, 17, { maxFlags: 0 }).rows)).toBe("Sursele: primele 17 profiluri după valoare, fără semnale.");
  });

  it("shows five rows, all of them on request, and says what waits and what is not listed", () => {
    const group = ties(14, 19);
    expect(shownRows(group.rows, false)).toMatchObject({ hidden: 9 });
    expect(legacyTiesRest(group, 9)).toBe("+ încă 9 cu același indice · 5 fără semnale");
    expect(legacyTiesRest(group, 0)).toBeNull();
    // 80 at the top: only the first 50 were listed, and the answer said so.
    const many = ties(80, 120);
    expect(many.rows).toHaveLength(50);
    expect(legacyTiesRest(many, 45)).toBe("+ încă 45 cu același indice · 30 nu încap în listă · 5 fără semnale");
  });

  it("tags a profile's signals, two and „+N” with that answer's words; a retired code (da_rapid) shows as stored", () => {
    const tags = legacyTieFacts(tie(1, { flags: ["da_split", "da_year_end", "da_rapid", "da_round"], nFlags: 4 }), hospitals);
    expect(tags.map((t) => [t.text, t.tone ?? "neutral"])).toEqual([["achiziții repetate, peste plafon cumulat", "signal"], ["vârf în decembrie", "signal"], ["+2", "neutral"]]);
    expect(tags[2]!.tip).toEqual({ title: "Alte semnale", text: "da_rapid, chiar sub plafon. Semnale statistice, nu dovezi." });
    expect(legacyTieFacts(tie(2, { name: "Eco Rural Consulting SRL-D", flags: ["da_split"] }), { dim: "authority", filters: {} }).map((t) => t.text))
      .toEqual(["achiziții repetate, peste plafon cumulat", "societate"]);
  });
});


describe("„Pe harta riscului ›” of the index (S6 review)", () => {
  const index = (filters: Record<string, unknown>) => ({ block: "entity_card", dim: "supplier", measure: "value", rankBy: "risk", filters } as unknown as QuestionSpec);

  it("opens the cloud of the same firms, leaving a band of employees out with its tip, never a refusal", () => {
    const banded = index({ minEmployees: 1, maxEmployees: 9, seatCounty: "Cluj" });
    // The index takes the band; the cloud refuses it.
    expect(unsupportedPopulationView(banded as never)).toBeNull();
    const link = riskCloudLink(banded);
    expect(link.spec.block).toBe("scatter");
    expect(link.spec.filters).toEqual({ seatCounty: "Cluj" });
    expect(unsupportedPopulationView(link.spec as never)).toBeNull();
    expect("error" in validateSpec(link.spec)).toBe(false);
    expect(link.tip).toBe("Norul nu se restrânge după angajați: arată toate firmele, nu doar cele cu 1–9 angajați.");
    expect(riskCloudLink(index({ maxEmployees: 0 })).tip).toBe("Norul nu se restrânge după angajați: arată toate firmele, nu doar cele fără angajați.");
  });

  it("keeps every condition and no tip without a band", () => {
    const link = riskCloudLink(index({ seatCounty: "Cluj" }));
    expect(link).toEqual({ spec: expect.objectContaining({ block: "scatter", filters: { seatCounty: "Cluj" } }), tip: null });
  });
});
