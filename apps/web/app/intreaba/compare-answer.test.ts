import { describe, expect, it } from "vitest";
import type { CompareEntity } from "../../lib/ask/compile";
import {
  cardSpan, consortiumWords, generalRow, jointRow, partnersOfWhole, percent, perCapitaShown, seatParts, seatRow, sharedSubtitle, yearColumns, yearReadout,
} from "./compare-answer";

/*
 * F4, the comparison's cards (final compare §3.4, §4): each context row with
 * the figures of the final's examples; an answer saved before F4 keeps
 * today's card.
 */

const entity = (patch: Partial<CompareEntity>): CompareEntity => ({
  entityId: "1", name: "A", county: "Cluj", role: "authority", value: 0, count: 0, cri: null, nFlags: 0, flags: [], population: null, ...patch,
});

describe("the card's years", () => {
  it("are the selection's from 2018, the older records apart; an older answer keeps its profile's years", () => {
    const timisoara = entity({ years: [{ year: 2014, value: 41.8, count: 1 }, { year: 2017, value: 2.1, count: 16 }, { year: 2018, value: 21.8, count: 214 }, { year: 2026, value: 555, count: 68 }] });
    expect(cardSpan(timisoara)).toEqual({ years: "2018–2026", older: 17 });
    expect(cardSpan(entity({ years: [{ year: 2014, value: 1 }], active: { from: 2014, to: 2026 } }))).toEqual({ years: "2014–2026", older: 0 });
  });
  it("draw the years before 2018 as one column, then every year to the last, the empty ones too", () => {
    const a = entity({ years: [{ year: 2018, value: 345, count: 506 }, { year: 2020, value: 232, count: 716 }] });
    const b = entity({ years: [{ year: 2014, value: 42, count: 1 }, { year: 2017, value: 2, count: 16 }, { year: 2019, value: 644, count: 284 }] });
    const columns = yearColumns(a, b);
    expect(columns.map((c) => c.short)).toEqual(["<2018", "2018", "2019", "2020"]);
    expect(columns[0]).toMatchObject({ label: "înainte de 2018", older: true, a: { value: 0, count: 0 }, b: { value: 44, count: 17 } });
    expect(columns[2]).toMatchObject({ a: { value: 0, count: 0 }, b: { value: 644, count: 284 } });
    expect(yearReadout(columns[1]!, { a: "Cluj-Napoca", b: "Timișoara" })).toEqual(["Cluj-Napoca: 345 lei · 506 înregistrări", "Timișoara: 0 lei · 0 înregistrări"]);
    expect(yearColumns(entity({ years: [{ year: 2025, value: 1, count: 1 }] }), entity({}))).toEqual([]);
  });
});

describe("the cards' context rows", () => {
  it("say the suppliers' seat by value, the unknown apart", () => {
    // Cluj-Napoca (final §4.2): 43% / 44% / 13%.
    const parts = seatParts({ same: 1_893_037_731, other: 1_916_681_819, abroad: 599_165_780, unknown: 825_903 })!;
    expect([percent(parts.same), percent(parts.other), percent(parts.abroad)]).toEqual(["43%", "43%", "14%"]);
    expect(seatParts({ same: 0, other: 0, abroad: 0, unknown: 0 })).toBeNull();
  });
  it("say the unknown seat as its own part, and nothing but that without the institution's county (S4 review)", () => {
    const row = seatRow(entity({ county: "Bucuresti", seats: { same: 6, other: 2, abroad: 0, unknown: 2 } }));
    expect(row && "words" in row ? row.words : row).toEqual(["în același județ 60%", "în alt județ 20%", "în străinătate 0%", "sediu necunoscut 20%"]);
    const known = seatRow(entity({ seats: { same: 6, other: 4, abroad: 0, unknown: 0 } }));
    expect(known && "words" in known ? known.words.length : known).toBe(3);
    // Electrocentrale Craiova: no county, 99% unknown; never „în același județ 0%”.
    expect(seatRow(entity({ county: null, seats: { same: 0, other: 0, abroad: 7, unknown: 702 } }))).toEqual({ none: "Județul instituției nu e cunoscut." });
    expect(seatRow(entity({ role: "supplier" }))).toBeNull();
  });
  it("show „Pe locuitor” only between two of one level (an older answer: both with a population)", () => {
    const townHall = entity({ population: 286_598, populationLevel: "local" }), council = entity({ population: 691_106, populationLevel: "county" });
    expect(perCapitaShown(townHall, entity({ population: 250_849, populationLevel: "local" }))).toBe(true);
    expect(perCapitaShown(townHall, council)).toBe(false);
    expect(perCapitaShown(townHall, entity({}))).toBe(false);
    expect(perCapitaShown(entity({ population: 1 }), entity({ population: 2 }))).toBe(true);
  });
  it("count a consortium's records against its contracts, only where they differ", () => {
    const streams = (count: number, distinct?: number) => ({ da: { value: 0, count: 0 }, contracts: { value: 1, count, singleBid: null, bidsKnown: 0, ...(distinct !== undefined ? { distinct } : {}) } });
    expect(consortiumWords(entity({ streams: streams(667, 569) }))).toBe("Proceduri: 667 de înregistrări din 569 de contracte.");
    expect(consortiumWords(entity({ streams: streams(12, 12) }))).toBeNull();
    expect(consortiumWords(entity({ streams: streams(12) }))).toBeNull();
  });
  it("add what is coded above a CPV domain", () => {
    expect(generalRow(entity({ general: 483_291_406.81 }))).toBe("+ 483,3 mil. lei pe coduri mai generale");
    expect(generalRow(entity({ general: 0 }))).toBeNull();
    expect(generalRow(entity({}))).toBeNull();
  });
});

describe("„Doar clienții comuni” on the cards (final §3.4)", () => {
  // CONSTRUCȚII ERBAȘU and TERRA GAZ: 15 shared clients; Erbașu 7,1 mld. of 12,1 mld.; 1,37 mld. won together in 37 contracts.
  const erbasu = entity({ role: "supplier", value: 7_122_902_650, count: 219, partners: 15, whole: { value: 12_108_775_346, count: 483, partners: 73 },
    joint: { value: 1_371_022_525, contracts: 37 } });
  it("say the shared clients, their share of the firm's whole selection and the part won together", () => {
    expect(sharedSubtitle(erbasu)).toBe("la 15 clienți comuni · 59% din totalul firmei");
    expect(partnersOfWhole(erbasu)).toBe("15 din 73");
    expect(jointRow(erbasu)).toBe("1,4 mld. lei · 37 de contracte · 19%");
  });
  it("say nothing of them without „Doar clienții comuni” or without a contract won together", () => {
    expect(sharedSubtitle(entity({}))).toBeNull();
    expect(partnersOfWhole(entity({ partners: 3 }))).toBeNull();
    expect(jointRow({ ...erbasu, joint: { value: 0, contracts: 0 } })).toBeNull();
  });
});
