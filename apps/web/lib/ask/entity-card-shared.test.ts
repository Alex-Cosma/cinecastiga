import { describe, expect, it } from "vitest";
import {
  buyerForm, criteriaCount, jointShare, leadOverSecond, LEADER_MIN_DAS, levelWords, oneRecordShare, placeShare, podiumRest, signalsWords, tiesNotDistinct,
  type Podium, type PodiumPlace,
} from "./entity-card-shared";
import { bareNational, podiumFactsOf, podiumOf } from "./entity-card";
import { ENTITY_CARD_MIN_DAS } from "./predicates";

/*
 * „Cine conduce?” (entity_card-2, final entity_card §3.9–§3.10): the shapes and words the engine, the answer, its CSV
 * and a watch share. Pure.
 */

const place = (n: number, value: number, count = 10): PodiumPlace => ({ entityId: String(n), name: `Firma ${n}`, county: "Cluj", value, count });
const total = { value: 1000, count: 60, entities: 40 };

describe("the podium", () => {
  it("keeps places 1–3, the total they are counted against and the selection's beside a band's", () => {
    const places = [place(1, 500), place(2, 300), place(3, 100), place(4, 50)];
    const whole = podiumOf(places, total, undefined);
    expect(whole.places.map((p) => p.entityId)).toEqual(["1", "2", "3"]);
    expect(whole.total).toEqual(total);
    expect(whole.selection).toBeUndefined();
    // Under a band of CÂȘTIGĂTORII the share is the category's; the selection's total stays (owner decision entity_card 4).
    const band = podiumOf(places, total, { value: 600, count: 20, entities: 5 });
    expect(band.total).toEqual({ value: 600, count: 20, entities: 5 });
    expect(band.selection).toEqual(total);
    // Nothing gives the total: no share to say.
    expect(podiumOf(places, null, undefined).total).toBeNull();
  });

  it("says each place's share, the distance from place 2 and what the three leave", () => {
    const podium = podiumOf([place(1, 500), place(2, 300), place(3, 100)], total, undefined) as Podium;
    expect(placeShare(podium.places[0]!, podium.total)).toBe(0.5);
    expect(placeShare(podium.places[0]!, null)).toBeNull();
    expect(leadOverSecond(podium)).toBe(200);
    expect(leadOverSecond({ places: [place(1, 5)] })).toBeNull();
    // 1000 − 900 left, over the other 37 of 40.
    expect(podiumRest(podium)).toEqual({ entities: 37, value: 100, share: 0.1 });
    // Three places that are every entity leave no rest; neither does an unknown total.
    expect(podiumRest({ places: podium.places, total: { value: 900, count: 30, entities: 3 } })).toBeNull();
    expect(podiumRest({ places: podium.places, total: null })).toBeNull();
  });

  it("ranks the index with the profiles the engine counts", () => {
    expect(LEADER_MIN_DAS).toBe(ENTITY_CARD_MIN_DAS);
  });

  it("reads the national ranking's total from agg_national only where no condition narrows it", () => {
    expect(bareNational({ filters: {} })).toBe(true);
    expect(bareNational({ filters: { county: "" } })).toBe(true);
    expect(bareNational({ filters: { yearFrom: 2025 } })).toBe(false);
    expect(bareNational({ filters: {}, dataset: "da" })).toBe(false);
    expect(bareNational({ filters: {}, minimumRecords: { role: "supplier", count: 5 } })).toBe(false);
  });
});

describe("the facts of the places", () => {
  it("tag a quarter or more in joint contracts, and a single record from half of a place's value", () => {
    expect(jointShare(1000, { joint: 249 })).toBeNull();
    expect(jointShare(1000, { joint: 250 })).toBe(0.25);
    expect(jointShare(1000, { joint: 0 })).toBeNull();
    expect(jointShare(0, { joint: 5 })).toBeNull();
    expect(jointShare(1000, undefined)).toBeNull();
    expect(oneRecordShare({ value: 1000, count: 4 }, { largest: { value: 499, src: "contracts" } })).toBeNull();
    expect(oneRecordShare({ value: 1000, count: 4 }, { largest: { value: 500, src: "contracts" } })).toEqual({ share: 0.5, src: "contracts" });
    expect(oneRecordShare({ value: 1000, count: 4 }, undefined)).toBeNull();
  });

  it("add the channels' records: the joint value, the largest record and the firm's filing", () => {
    const facts = podiumFactsOf(
      [
        { id: "1", joint: "300.5", largest: "900", largest_src: "contracts" },
        { id: "1", joint: "0", largest: "950", largest_src: "da" },
        { id: "2", joint: "10", largest: null, largest_src: null },
      ],
      [{ id: "1", employees: 12, employees_year: 2024, first_activity: "2019-05-02T00:00:00" }],
      ["1", "2", "3"],
    );
    expect(facts[0]).toEqual({ entityId: "1", joint: 300.5, largest: { value: 950, src: "da" }, employees: 12, employeesYear: 2024, firstActivity: "2019-05-02" });
    expect(facts[1]).toMatchObject({ entityId: "2", joint: 10, largest: null, employees: null, employeesYear: null, firstActivity: null });
    expect(facts[2]).toMatchObject({ entityId: "3", joint: 0, largest: null });
  });
});

describe("the index", () => {
  it("writes a level and its signals as the answer says them", () => {
    expect(levelWords(0.2)).toBe("0,20");
    expect(levelWords(1)).toBe("1,00");
    expect(signalsWords({ maxFlags: 1, criteria: 5 })).toBe("1 semnal din 5");
    expect(signalsWords({ maxFlags: 4, criteria: 4 })).toBe("4 semnale din 4");
    expect(criteriaCount("authority")).toBe(5);
    expect(criteriaCount("supplier")).toBe(4);
  });

  it("does not tell the group apart when over half of the pool is at the top, or the top is one signal", () => {
    expect(tiesNotDistinct({ count: 14, pool: 19, maxFlags: 1 })).toBe(true);
    expect(tiesNotDistinct({ count: 10, pool: 19, maxFlags: 3 })).toBe(true);
    expect(tiesNotDistinct({ count: 9, pool: 19, maxFlags: 3 })).toBe(false);
    // A group of one is no tie; a single signal at the top is the same for everyone.
    expect(tiesNotDistinct({ count: 1, pool: 3, maxFlags: 1 })).toBe(false);
    expect(tiesNotDistinct({ count: 6, pool: 53_556, maxFlags: 1 })).toBe(true);
    expect(tiesNotDistinct({ count: 6, pool: 53_556, maxFlags: 4 })).toBe(false);
  });

  it("marks a buyer whose name shows a company or an association, never an institution", () => {
    expect(buyerForm("Eco Rural Consulting SRL-D")).toBe("societate");
    expect(buyerForm("SC RADIOTHERAPY CENTER CLUJ SRL")).toBe("societate");
    expect(buyerForm("INDUSTRIAL PARC S.R.L.")).toBe("societate");
    expect(buyerForm("Popescu Ion PFA")).toBe("societate");
    expect(buyerForm("ASOCIATIA CLUB SPORTIV PROGRESUL PECICA")).toBe("asociație");
    expect(buyerForm("Asociația de Dezvoltare Intercomunitară Nasaud")).toBe("asociație");
    expect(buyerForm("Fundația Comunitară Cluj")).toBe("asociație");
    expect(buyerForm("EURO APAVOL")).toBeNull();
    expect(buyerForm("Ocolul Silvic Rasinari R.A.")).toBeNull();
    expect(buyerForm("Spitalul Clinic Judetean de Urgenta Cluj-Napoca")).toBeNull();
    expect(buyerForm("Primaria Comunei Pâslaru")).toBeNull();
    // A word that only contains the letters is no legal form.
    expect(buyerForm("Liceul Tehnologic Sirul")).toBeNull();
  });
});
