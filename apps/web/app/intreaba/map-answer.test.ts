import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { questionTitle } from "../../lib/ask/filters/title";
import { sentenceText, sentenceTokens } from "../../lib/ask/filters/sentence";
import { FILTERS } from "../../lib/ask/filters/registry";
import { filterContext } from "../../lib/ask/filters/context";
import { buildPills } from "../../lib/ask/pills";
import { answerCore } from "../../lib/ask/answer-core";
import { LOCAL_ADMIN_ONLY_MAP, LOCAL_ADMIN_PLACE, validateSpec, type AskSpec } from "../../lib/ask/spec";
import type { MapFacts, MapLocal } from "../../lib/ask/map-facts";
import { askedLens, withLens, withoutFirm } from "../../lib/ask/map-lens";
import { appliedAfterStrip } from "./answer-state";
import { answerCsv } from "./answer-csv";
import MapBlock from "./MapBlock";
import { countyMetrics, FACTS_LOADING, FACTS_NONE, localNotes, mapLensOptions, nationalMetric, SEAT_ELSEWHERE_NOTE, SEAT_WAITS, shownLens } from "./map-answer";

/*
 * F5, the map's lens, local administrations and county card (plan §4.4, map
 * final §3.3–§3.11): the lenses offered on each question, the lens drawn and
 * the title after it, each county's number and why it is grey, the per-capita
 * figure on the counties the list holds whole, the card, the CSV.
 */

const Y25 = { yearFrom: 2025, yearTo: 2025 };
const map = (filters: AskSpec["filters"] = {}, rest: Partial<AskSpec> = {}): AskSpec => ({ block: "map", measure: "value", filters, ...rest });
const local = (rest: Partial<AskSpec> = {}) => map({ ...Y25, authorityKind: "local_admin" }, rest);
const PORR = { supplierName: "PORR CONSTRUCT", supplierId: 2108050 };
const facts = (counties: MapFacts["counties"], extra: Partial<MapFacts> = {}): { status: "ready"; value: MapFacts } =>
  ({ status: "ready", value: { part: "map", counties, seat: true, share: false, checkpoint: null, tookMs: 1, ...extra } });
const seat = (same: number, other: number, buc: number, foreign: number, unknown: number, n = 100) => ({
  same: { value: same, count: n }, other: { value: other, count: n }, bucuresti: { value: buc, count: 0 }, foreign: { value: foreign, count: 0 }, unknown: { value: unknown, count: 0 },
});
const LOCAL: MapLocal = { population: { Cluj: 679141, Prahova: 695119, Bucuresti: 1716961 }, missing: ["Prahova", "Suceava"], towns: 2970, sectors: 6, councils: 39 };

describe("„Harta arată” (map final §3.7)", () => {
  it("offers Valoare · Firme din județ · Înregistrări, per inhabitant on the local administrations, the share beside a firm", () => {
    const ready = facts({});
    expect(mapLensOptions(map(), ready).map((o) => o.label)).toEqual(["Valoare", "Firme din județ", "Înregistrări"]);
    expect(mapLensOptions(local(), ready).map((o) => o.label)).toEqual(["Valoare", "Pe locuitor", "Firme din județ", "Înregistrări"]);
    expect(mapLensOptions(map(PORR), facts({}, { share: true })).map((o) => o.label)).toEqual(["Valoare", "Cota firmei", "Înregistrări"]);
    expect(mapLensOptions(map({ adminPersonKey: "k", adminName: "POPESCU ION" }), facts({}, { share: true })).map((o) => o.label)).toEqual(["Valoare", "Cota firmelor", "Înregistrări"]);
    // The facts not read yet, not readable, or the seat not filled: the lens is shown with its reason.
    expect(mapLensOptions(map(), { status: "loading" })[1]).toMatchObject({ value: "seat", disabled: FACTS_LOADING });
    expect(mapLensOptions(map(), { status: "none" })[1]).toMatchObject({ disabled: FACTS_NONE });
    expect(mapLensOptions(map(), facts({}, { seat: false }))[1]).toMatchObject({ disabled: SEAT_WAITS });
    expect(mapLensOptions(map(PORR), facts({}, { share: false }))[1]).toMatchObject({ value: "share", disabled: FACTS_NONE });
  });

  it("draws the lens the question asks while it can, else Valoare; the choice comes back with its option", () => {
    const seatLens = map(Y25, { map: { lens: "seat" } });
    expect(askedLens(seatLens)).toBe("seat");
    expect(shownLens(seatLens, mapLensOptions(seatLens, facts({})))).toBe("seat");
    expect(shownLens(seatLens, mapLensOptions(seatLens, { status: "loading" }))).toBe("value");
    // A firm hides the seat (§3.4): the map is on Valoare; without the firm the lens is back (the key stayed).
    const withFirm = { ...seatLens, filters: { ...seatLens.filters, ...PORR } };
    expect(askedLens(withFirm)).toBe("value");
    expect(askedLens(withoutFirm(withFirm))).toBe("value"); // withoutFirm drops the lens with the firm (the share's whole)
    expect(askedLens({ ...withFirm, filters: Y25 })).toBe("seat");
    // Per inhabitant only on the local administrations; an old link's per-capita map answers on Valoare.
    expect(askedLens(map(Y25, { measure: "value_per_capita" }))).toBe("value");
    expect(askedLens(local({ measure: "value_per_capita" }))).toBe("value_per_capita");
  });

  it("writes the measure or map.lens, never the selection (the strip's path „measure”)", () => {
    expect(appliedAfterStrip(map(Y25), "measure", "seat")).toEqual(map(Y25, { map: { lens: "seat" } }));
    expect(appliedAfterStrip(map(Y25, { map: { lens: "seat" } }), "measure", "count")).toEqual(map(Y25, { measure: "count" }));
    expect(withLens(local(), "value_per_capita")).toEqual(local({ measure: "value_per_capita" }));
    expect(validateSpec(map(Y25, { map: { lens: "share" } }))).not.toHaveProperty("error");
    expect(validateSpec({ ...map(), map: { lens: "other" } })).toHaveProperty("error");
  });

  it("titles the answer after its lens; the sentence stays the question's (§3.7, the exception to R11)", () => {
    expect(questionTitle(map(Y25))).toBe("Cum se împart achizițiile făcute de instituțiile publice pe județe, în 2025?");
    expect(questionTitle(local({ measure: "value_per_capita" })))
      .toBe("Cât revine pe locuitor din achizițiile făcute de primăriile și consiliile județene, pe județe, în 2025?");
    expect(questionTitle(map(Y25, { map: { lens: "seat" } })))
      .toBe("Ce parte din achizițiile făcute de instituțiile publice câștigă firmele cu sediul în același județ, în 2025?");
    expect(questionTitle(map(Y25, { measure: "count" }))).toBe("Cum se împart pe județe înregistrările achizițiilor făcute de instituțiile publice, în 2025?");
    expect(questionTitle(map({ yearFrom: 2024, yearTo: 2025, purchaseKind: "lucrari", ...PORR }, { map: { lens: "share" } })))
      .toBe("Ce parte din achizițiile de lucrări făcute de instituțiile publice din fiecare județ câștigă PORR CONSTRUCT, în 2024–2025?");
    // The sentence of the question is the same on every lens.
    const sentence = (spec: AskSpec) => sentenceText(sentenceTokens(spec));
    expect(sentence(map(Y25, { map: { lens: "seat" } }))).toBe(sentence(map(Y25)));
  });
});

describe("„Primăriile și consiliile județene” (map final §3.3)", () => {
  it("is a kind of the map only, second in its window, compared over the whole country", () => {
    expect(validateSpec(local())).not.toHaveProperty("error");
    expect(validateSpec({ ...local(), block: "stat" })).toEqual({ error: LOCAL_ADMIN_ONLY_MAP });
    expect(validateSpec(map({ ...Y25, authorityKind: "local_admin", county: "Cluj" }))).toEqual({ error: LOCAL_ADMIN_PLACE });
    const spec = map(Y25);
    expect(FILTERS.authorityKind.choices(spec, filterContext(spec)).slice(0, 3)).toEqual([undefined, "local_admin", "comuna"]);
    expect(FILTERS.authorityKind.choices({ ...spec, block: "stat" }, filterContext({ ...spec, block: "stat" }))).not.toContain("local_admin");
    // Another kind leaves the per-inhabitant lens for the value.
    expect(FILTERS.authorityKind.write(local({ measure: "value_per_capita" }), "spital").measure).toBe("value");
  });

  it("says its buyers in the sentence and the pills, per inhabitant only there", () => {
    expect(sentenceText(sentenceTokens(local()))).toBe("Cum se împart achizițiile făcute de primăriile și consiliile județene pe județe, în 2025?");
    expect(buildPills(local({ measure: "value_per_capita" }), {})).toEqual(expect.arrayContaining(["valoarea pe locuitor", "doar primării și consilii județene"]));
    expect(buildPills(map(Y25, { measure: "value_per_capita" }), {})).toContain("valoarea înregistrată");
  });

  it("divides by the county's resident population, greys a county whose council the list lacks, and keeps it out of a watch", () => {
    const data = { counties: [{ county: "Cluj", value: 2_831_000_000, count: 11068 }, { county: "Prahova", value: 1_101_000_000, count: 11336 }], local: LOCAL };
    const m = countyMetrics(data, "value_per_capita", null);
    expect(Math.round(m.get("Cluj")!.metric!)).toBe(4169);
    expect(m.get("Cluj")!.muted).toBeNull();
    expect(m.get("Prahova")!.muted).toMatch(/Consiliul județean/);
    expect(Math.round(nationalMetric({ ...data, unknown: { value: 0, count: 0 } }, "value_per_capita", null)!)).toBe(Math.round(3_932_000_000 / (679141 + 695119 + 1716961)));
    // A link's county is no country (S5 review): no „Pe țară”.
    expect(nationalMetric({ ...data, unknown: { value: 0, count: 0 } }, "value_per_capita", null, true)).toBeNull();
    expect(localNotes(LOCAL).map((n) => n.text)).toEqual(["Lista strictă: 3.015 primării și consilii județene", "Fără consiliul județean: Prahova, Suceava"]);
    const answer = { block: "map", counties: data.counties, unknown: { value: 0, count: 0 }, local: LOCAL };
    expect(answerCore("map", answer)).toEqual({ block: "map", counties: data.counties, unknown: { value: 0, count: 0 } });
  });
});

describe("the county's number and card (map final §3.9–§3.11)", () => {
  const counties = [{ county: "Giurgiu", value: 1_300, count: 16 }, { county: "Cluj", value: 9_800, count: 445 }];
  const read = facts({
    Giurgiu: { value: 1_300, count: 16, seat: seat(110, 1_110, 462, 77, 3, 8), buyer: { id: "7", name: "JUDETUL GIURGIU", value: 557, count: 9 }, buyers: 2, record: { value: 122, src: "contracts" }, base: { value: 1_430, count: 30 } },
    Cluj: { value: 9_800, count: 445, seat: seat(2_200, 6_800, 3_000, 300, 500), buyer: { id: "8", name: "DEER", value: 2_450, count: 20 }, buyers: 445, record: { value: 291, src: "contracts" }, base: { value: 98_000, count: 900 } },
  }, { share: true });

  it("greys a share on too few records or unknown seats, and the firm's share under 3 of its records or 20 of the county's", () => {
    const seatM = countyMetrics({ counties }, "seat", read.value);
    expect(seatM.get("Giurgiu")).toEqual({ metric: 110 / 1_300, muted: "Sub 20 de înregistrări." });
    expect(seatM.get("Cluj")).toEqual({ metric: 2_200 / 9_800, muted: null });
    // On the local map, Ilfov (CJ Ilfov, whose records are București's) is grey and says why (S5 review); elsewhere not.
    const ilfov = facts({ Ilfov: { value: 9_800, count: 445, seat: seat(2_200, 6_800, 3_000, 300, 500), buyer: null, buyers: 1, record: null } });
    expect(countyMetrics({ counties: [{ county: "Ilfov", value: 9_800, count: 445 }], local: LOCAL }, "seat", ilfov.value).get("Ilfov"))
      .toEqual({ metric: 2_200 / 9_800, muted: SEAT_ELSEWHERE_NOTE });
    expect(countyMetrics({ counties: [{ county: "Ilfov", value: 9_800, count: 445 }] }, "seat", ilfov.value).get("Ilfov")!.muted).toBeNull();
    const share = countyMetrics({ counties: [{ county: "Giurgiu", value: 181, count: 2 }, { county: "Cluj", value: 1_000, count: 37 }] }, "share", read.value);
    expect(share.get("Giurgiu")!.muted).toMatch(/sub 3/);
    expect(share.get("Cluj")).toEqual({ metric: 1_000 / 98_000, muted: null });
    expect(Math.round(nationalMetric({ counties, unknown: { value: 0, count: 0 } }, "seat", read.value)! * 1000)).toBe(Math.round((2_310 / 11_100) * 1000));
  });

  it("draws the grey counties hatched in the theme's tokens, and the card with the buyer, the record and the seat", () => {
    const html = renderToStaticMarkup(createElement(MapBlock, { counties, unknown: { value: 0, count: 0 }, spec: map(Y25, { map: { lens: "seat" } }), facts: read, lens: "seat" }));
    expect(html).toContain('class="ask-county ask-county-muted"');
    expect(html).toContain('id="ask-hatch"');
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|fill="|stroke="/i);
    expect(html).toMatch(/aria-label="Giurgiu: 8,5% \(date puține\)"/);
    expect(html).toContain("Pe țară: 20,8% la firme din județ");
    expect(html).toContain("București și Ilfov: firmele mari au sediul în capitală");
  });

  it("writes the card's and the lens' columns in the CSV, `inregistrari` for records", () => {
    const data = { block: "map" as const, counties, unknown: { value: 5, count: 1 } };
    const csv = answerCsv(data, map(Y25, { map: { lens: "seat" } }), "Hartă", { lens: "seat" }, { mapFacts: read.value }).text.split("\r\n");
    expect(csv[0]).toBe("﻿judet,valoare_lei,inregistrari,firme_din_judet,firme_alte_judete,din_care_bucuresti,firme_straine,sediu_necunoscut,cel_mai_mare_cumparator,pondere_cumparator,cea_mai_mare_inregistrare,pondere_inregistrare,harta_arata");
    expect(csv[1]).toBe('"Giurgiu",1300,16,110,1110,462,77,3,"JUDETUL GIURGIU",0.428462,122,0.093846,"firme-din-judet"');
    const firm = answerCsv(data, map({ ...Y25, ...PORR }, { map: { lens: "share" } }), "Hartă", { lens: "share" }, { mapFacts: read.value }).text.split("\r\n");
    expect(firm[0]).toContain("inregistrari,cota_firmei,cel_mai_mare_cumparator");
    expect(firm[1]).toMatch(/^"Giurgiu",1300,16,0\.909091,/);
    const percap = answerCsv({ ...data, counties: [counties[1]!], unknown: { value: 0, count: 0 }, local: LOCAL }, local({ measure: "value_per_capita" }), "Hartă").text.split("\r\n");
    expect(percap[0]).toContain("inregistrari,populatie,lei_pe_locuitor,");
    expect(percap[1]).toMatch(/^"Cluj",9800,445,679141,0\.01,/);
  });
});
