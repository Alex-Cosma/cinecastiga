import { describe, expect, it } from "vitest";
import type { PodiumFact, PodiumPlace, TiePlace, Ties } from "../../lib/ask/entity-card-shared";
import { leadWords, placeFacts, placeWords, restWords, shareWords, signalWord, subjectNouns, tieFacts, tiePlace, tiesHeadline, tiesRest, tiesShown, totalLead } from "./entity-card-answer";

/*
 * „Cine conduce?” (entity_card-2) as the answer draws it (final entity_card §3.9–§3.10, frames C, E, F): the place
 * words, the tags (P8, at most three), the headline of the group at the top and the lines under it. Pure.
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
    // A direct acquisition says so; a place of one record is no „1 contract” of several.
    expect(placeFacts({ ...alliance, value: 1000, count: 2 }, fact({ largest: { value: 600, src: "da" } }), firm, 2025).map((t) => t.text)).toEqual(["1 achiziție directă: 60%"]);
    expect(placeFacts({ ...alliance, value: 1000, count: 1 }, fact({ largest: { value: 1000, src: "da" } }), firm, 2025)).toEqual([]);
  });

  it("carry the band the question set, with the balance sheet's year, amber when it is over two years old", () => {
    const band = { dim: "supplier", filters: { maxEmployees: 0 } } as const;
    expect(placeFacts(alliance, fact({ employees: 0, employeesYear: 2024 }), band, 2025).map((t) => [t.text, t.tone ?? "neutral"])).toEqual([["0 angajați · bilanț 2024", "neutral"]]);
    expect(placeFacts(alliance, fact({ employees: 0, employeesYear: 2021 }), band, 2025).map((t) => [t.text, t.tone])).toEqual([["0 angajați · bilanț 2021", "caveat"]]);
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
});

const tie = (n: number, extra: Partial<TiePlace> = {}): TiePlace => ({ entityId: String(n), name: `Spital ${n}`, county: "Cluj", count: 100 * n, value: 1000 - n, nFlags: 1, flags: ["da_split"], ...extra });
const ties = (count: number, pool: number, extra: Partial<Ties> = {}): Ties => ({
  version: 2, level: 0.2, maxFlags: 1, criteria: 5, count, pool, nextLevel: 0, nextCount: 5,
  rows: Array.from({ length: Math.min(count, 50) }, (_, i) => tie(i + 1)), ...extra,
});

describe("the group at the top of the index", () => {
  it("says „Indicele nu le deosebește” when over half of the pool, or a single signal, is at the top", () => {
    const head = tiesHeadline(ties(14, 19), hospitals);
    expect(head).toMatchObject({ kicker: "Indicele nu le deosebește", lead: "14 din 19 spitale au același indice", level: "0,20", signals: "1 semnal din 5", none: false });
    expect(tiesHeadline(ties(6, 53_556, { level: 1, maxFlags: 4, criteria: 4, nextLevel: 0.75, nextCount: 219 }), firm))
      .toMatchObject({ kicker: null, lead: "6 firme au indicele maxim", level: "1,00", signals: "4 semnale din 4" });
  });

  it("names a single leader, with the next level; and says when nobody has a signal", () => {
    const head = tiesHeadline(ties(1, 2_483, { level: 1, maxFlags: 4, criteria: 4, nextLevel: 0.75, nextCount: 14 }), firm);
    expect(head).toMatchObject({ kicker: "Singur pe primul loc", lead: "", level: "1,00", next: "Următorul nivel, 0,75: 14 din 2.483 de firme." });
    const none = tiesHeadline(ties(17, 17, { level: 0, maxFlags: 0, nextLevel: null, nextCount: 0 }), hospitals);
    expect(none).toMatchObject({ kicker: "Nu are semnale în profil", none: true });
    expect(none.lead).toBe("Niciuna din 17 spitale nu are semnale în profil");
  });

  it("shows five rows, all of them on request, and says what waits and what is not listed", () => {
    const group = ties(14, 19);
    expect(tiesShown(group, false)).toMatchObject({ hidden: 9 });
    expect(tiesShown(group, false).rows).toHaveLength(5);
    expect(tiesShown(group, true)).toMatchObject({ hidden: 0 });
    expect(tiesRest(group, 9)).toBe("+ încă 9 cu același indice · 5 fără semnale");
    expect(tiesRest(group, 0)).toBeNull();
    // 80 at the top: only the first 50 are listed, and the answer says so.
    const many = ties(80, 120);
    expect(many.rows).toHaveLength(50);
    expect(tiesRest(many, 45)).toBe("+ încă 45 cu același indice · 30 nu încap în listă · 5 fără semnale");
  });

  it("tags a profile's signals in the official words, two and „+N”, and a buyer that looks like a company or an association", () => {
    const flags = ["da_split", "da_year_end", "da_round", "da_rapid"];
    const tags = tieFacts(tie(1, { flags, nFlags: 4 }), hospitals);
    expect(tags.map((t) => [t.text, t.tone ?? "neutral"])).toEqual([["posibilă fracționare", "signal"], ["vârf în decembrie", "signal"], ["+2", "neutral"]]);
    expect(tags[2]!.tip).toMatchObject({ title: "Alte semnale" });
    expect(signalWord("da_concentration")).toBe("concentrare pe un furnizor");
    expect(tieFacts(tie(2, { name: "Eco Rural Consulting SRL-D", flags: ["da_split"] }), { dim: "authority", filters: {} }).map((t) => t.text)).toEqual(["posibilă fracționare", "societate"]);
    expect(tieFacts(tie(3, { name: "Eco Rural Consulting SRL", flags: [] }), firm)).toEqual([]);
    expect(tiePlace(tie(1, { county: "Bucuresti", count: 1 }))).toBe("București · 1 achiziție directă");
  });
});
