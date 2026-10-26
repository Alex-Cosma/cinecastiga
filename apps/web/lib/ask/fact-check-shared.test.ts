import { describe, expect, it } from "vitest";
import {
  ceilingWords, COMPETITION_PROCEDURES, coverageEnd, factLegacy, factNoReason, factRestricted, factVerdict, monthSpan, noRecordsWords, procedureWords, relationWords,
  OUTSIDE_WHY, roDay, sampleBadges, shareWords, shortLei, VERDICT_TIPS, VERDICT_WORDS,
} from "./fact-check-shared";
import { shareLabel } from "../entity-summary";

/*
 * fact_check-2's rules and words (plan §4.10, final fact_check §4–§5): the
 * three verdicts, why "Nu", the sentence's narrowing and an old link's
 * condition, the weight, the band of the whole relation, the badges.
 */

const pair = { authorityId: 1, authorityName: "A", supplierId: 2, supplierName: "B" };

describe("the verdict of a verification", () => {
  it("is „Da” with a record or a row outside the sums, „Acord-cadru” with only ceilings, „Nu” otherwise", () => {
    expect(factVerdict({ count: 58, excluded: 0, frameworks: 0 })).toBe("yes");
    // Saraiu × ELYAN: one direct acquisition of 135 mil. lei (estimated 135.000), above the filter: still a purchase (owner F6a).
    expect(factVerdict({ count: 0, excluded: 1, frameworks: 0 })).toBe("yes");
    expect(factVerdict({ count: 0, excluded: 1, frameworks: 3 })).toBe("yes");
    // Oradea × Kes Business: a ceiling is not a purchase, and its call-offs may be missing from the data.
    expect(factVerdict({ count: 0, excluded: 0, frameworks: 1 })).toBe("framework");
    expect(factVerdict({ count: 0, excluded: 0, frameworks: 0 })).toBe("no");
  });

  it("says why „Nu”: an old link's condition, the sentence's choices, or nothing in the data", () => {
    expect(factNoReason({ legacy: false, relationHas: false })).toBe("none");
    expect(factNoReason({ legacy: true, relationHas: false })).toBe("none");
    expect(factNoReason({ legacy: true, relationHas: true })).toBe("legacy");
    expect(factNoReason({ legacy: false, relationHas: true })).toBe("choices");
    expect(noRecordsWords({ filters: { ...pair, yearFrom: 2026, yearTo: 2026 } }, "choices")).toBe("Nicio înregistrare în 2026.");
    expect(noRecordsWords({ filters: { ...pair, yearFrom: 2023 } }, "choices")).toBe("Nicio înregistrare din 2023 încoace.");
    expect(noRecordsWords({ dataset: "da", filters: { ...pair, yearFrom: 2026, yearTo: 2026 } }, "choices")).toBe("Nicio înregistrare cu alegerile făcute.");
    expect(noRecordsWords({ filters: pair }, "legacy")).toBe("Nicio înregistrare cu condiția din link.");
    expect(noRecordsWords({ filters: pair }, "none")).toBe("Nicio înregistrare între ei în datele noastre.");
    expect(VERDICT_WORDS).toEqual({ yes: "Da", framework: "Acord-cadru", no: "Nu" });
    expect(VERDICT_TIPS.yes).toContain("Nu dovedește livrarea sau plata.");
  });

  it("tells the sentence's narrowing (Când, Ce, Cum) from an old link's condition", () => {
    expect(factRestricted({ filters: pair })).toBe(false);
    expect(factRestricted({ dataset: "all", filters: pair })).toBe(false);
    expect(factRestricted({ dataset: "da", filters: pair })).toBe(true);
    expect(factRestricted({ filters: { ...pair, yearTo: 2021 } })).toBe(true);
    expect(factRestricted({ filters: { ...pair, cpvTerm: "45" } })).toBe(true);
    expect(factLegacy({ filters: { ...pair, yearFrom: 2024, cpvTerm: "45" } })).toBe(false);
    for (const spec of [{ filters: { ...pair, singleBidder: true } }, { filters: { ...pair, county: "Cluj" } }, { filters: { ...pair, minEmployees: 1 } },
      { filters: { ...pair, adminPersonKey: "x" } }, { filters: pair, minimumRecords: { role: "supplier", count: 10 } },
      { filters: pair, population: { operator: "and", groups: [] } }])
      expect(factLegacy(spec), JSON.stringify(spec)).toBe(true);
  });
});

describe("the words of a verification", () => {
  it("place a partner by value up to the 20th, then „unul din …”", () => {
    expect(shareWords({ rank: 2, of: 70, share: 0.1416 }, "client", "clienți", shareLabel)).toBe("al 2-lea client din 70 (14%)");
    expect(shareWords({ rank: 1, of: 17, share: 0.76 }, "client", "clienți", shareLabel)).toBe("primul client din 17 (76%)");
    // DEDEMAN × București: 5.236th of 10.575 clients.
    expect(shareWords({ rank: 5236, of: 10575, share: 0.00003 }, "client", "clienți", shareLabel)).toBe("unul din 10.575 de clienți · <1%");
  });

  it("sum up the whole relation in the band: records, value, years and the ceilings that are not added", () => {
    expect(relationWords({ count: 5, value: 70_235_806, yearFirst: 2022, yearLast: 2025, frameworks: 3, excluded: 0 }))
      .toEqual({ verdict: "da", facts: ["5 înregistrări", "70,2 mil. lei", "2022–2025", "și 3 acorduri-cadru"] });
    expect(relationWords({ count: 0, value: 0, yearFirst: null, yearLast: null, frameworks: 1, excluded: 0 })).toEqual({ verdict: "acord-cadru", facts: ["1 acord-cadru"] });
    expect(relationWords({ count: 0, value: 0, yearFirst: null, yearLast: null, frameworks: 0, excluded: 2 })).toEqual({ verdict: "da", facts: ["2 rânduri excluse din sume"] });
  });

  it("badge a record by its procedure, association, offers and a ceiling a build still sums; „ofertă”, never „ofertant”", () => {
    expect(sampleBadges({ daCode: null, date: null, cpvName: null, value: 1, src: "contracts", procedure: "Licitatie deschisa", nWinners: 3, fullValue: 18_379_470, bids: 1 }))
      .toEqual(["licitație deschisă", "în asociere · 3 firme · contract 18,4 mil.", "1 ofertă"]);
    // Kit §4 „Asocieri”: „în asociere · 3 firme”, never „asociere · …”; a whole contract under a million keeps its unit.
    expect(sampleBadges({ daCode: null, date: null, cpvName: null, value: 1, src: "contracts", nWinners: 2, fullValue: 850_000 })).toEqual(["în asociere · 2 firme · contract 850.000 lei"]);
    expect(sampleBadges({ daCode: null, date: null, cpvName: null, value: 1, src: "da" })).toEqual(["achiziție directă"]);
    expect(sampleBadges({ daCode: null, date: null, cpvName: null, value: 1, src: "contracts", procedure: "Negociere fara publicare prealabila", kind: "framework", bids: 4 }))
      .toEqual(["negociere fără publicare", "plafon acord-cadru", "4 oferte"]);
    expect(procedureWords("Procedura simplificata")).toBe("procedură simplificată");
    expect(procedureWords(null)).toBeNull();
    // The competition counts the open and restricted tenders only, as the signal award_single_bid.
    expect(COMPETITION_PROCEDURES).toEqual(["Licitatie deschisa", "Licitatie deschisa accelerata", "Licitatie restransa"]);
  });

  it("say a figure's unit under a million and a ceiling without a value in lei", () => {
    expect(shortLei(107_500_000)).toBe("107,5 mil.");
    expect(shortLei(18_453)).toBe("18.453 lei");
    expect(ceilingWords({ count: 1, ceiling: 28_160_000 })).toBe("plafon 28,2 mil. lei");
    expect(ceilingWords({ count: 1, ceiling: 0, unknown: 1 })).toBe("plafon necunoscut");
    expect(ceilingWords({ count: 2, ceiling: 9_000_000, unknown: 1 })).toBe("plafon 9 mil. lei + 1 fără valoare în lei");
    expect(OUTSIDE_WHY.no_ron_value).toBe("fără valoare în lei");
  });

  it("dates a span by month and a day as on the site", () => {
    expect(monthSpan("2018-07-09", "2026-06-11")).toBe("iul. 2018 – iun. 2026");
    expect(monthSpan("2024-03-11", "2024-12-30")).toBe("mar. – dec. 2024");
    expect(monthSpan("2024-08-01", "2024-08-01")).toBe("aug. 2024");
    expect(monthSpan(null, "2024-08-01")).toBeNull();
    expect(roDay("2026-06-11")).toBe("11.06.2026");
    expect(coverageEnd({ da: "2026-09-25", contracts: "2026-09-20" })).toBe("2026-09-25");
    expect(coverageEnd(undefined)).toBeNull();
  });
});
