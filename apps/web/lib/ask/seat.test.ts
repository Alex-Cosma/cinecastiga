import { describe, expect, it } from "vitest";
import { SEAT_ABROAD_LABEL } from "@seap/db";
import { builderView } from "../../app/intreaba/builder/view";
import { seatClearChoices, seatCurrentRow, seatOptions, windowKind, windowTip } from "../../app/intreaba/builder/window-model";
import { answerVersion } from "./answer-core";
import { assembleCounts } from "./facets";
import { ABROAD } from "./facet-parts";
import { describeConditions } from "./filters/describe";
import { chooseQuestion, chooseValue, seatFromCounty } from "./filters/transition";
import type { FilterSpec } from "./filters/types";
import type { QuestionSpec } from "./question-ui";
import { SEAT_ABROAD, firmCountyShown, firmSeatWords, seatCountyWords, seatSwitched, seatWords } from "./seat";
import { validateSpec, type AskSpec } from "./spec";

// F4: the firm's seat, one column and two keys (plan §2.5, §3; kit §4 "Sediul firmei"; owner-seat-switch).

const q = (spec: Partial<QuestionSpec> & { block: string }): QuestionSpec => ({ measure: "value", filters: {}, ...spec });
const firms = (filters: QuestionSpec["filters"] = {}) => q({ block: "table", dim: "supplier", topN: 10, filters });
const meta = { checkpoint: null, tookMs: 1 };

describe("the seat in words", () => {
  it("says the seat against the buyer, or a county of its own (R9: never «din»)", () => {
    expect([firmSeatWords("same"), firmSeatWords("same", "Cluj"), firmSeatWords("same", "Bucuresti"), firmSeatWords("other"), firmSeatWords("abroad")])
      .toEqual(["în județul instituției", "în județul Cluj", "în București", "în alt județ", "în străinătate"]);
    expect([seatCountyWords("Iasi"), seatCountyWords("București")]).toEqual(["în județul Iasi", "în București"]);
    expect(seatWords(firms({ firmSeat: "other" }))).toBe("în alt județ");
    // A link's county on a firm profile is the seat too; on a ranking of firms it is the buyers' place.
    expect(seatWords(q({ block: "scatter", dim: "supplier", filters: { county: "Cluj" } }))).toBe("în județul Cluj");
    expect(seatWords(firms({ county: "Cluj" }))).toBeNull();
  });

  it("keeps a foreign firm apart under one label, the marts' own", () => {
    expect(SEAT_ABROAD).toBe(SEAT_ABROAD_LABEL);
  });

  it("tells the answers the seat switch changed from those that only carry its keys", () => {
    for (const spec of [firms(), q({ block: "trend", dim: "supplier" }), q({ block: "scatter", dim: "supplier" }), q({ block: "entity_card", dim: "supplier", rankBy: "value" }),
      q({ block: "compare", filters: { supplierId: 1, compareWithId: 2 } }), q({ block: "distribution", filters: { supplierId: 1, county: "Cluj" } })])
      expect([spec.block, seatSwitched(spec as AskSpec), firmCountyShown(spec as AskSpec)]).toEqual([spec.block, true, true]);
    for (const spec of [q({ block: "table", dim: "authority" }), q({ block: "stat" }), q({ block: "map" }), q({ block: "network", filters: { supplierId: 1 } })])
      expect([spec.block, seatSwitched(spec as AskSpec), firmCountyShown(spec as AskSpec)]).toEqual([spec.block, false, false]);
    // A seat condition alone shows where the seat comes from, without a methodology alert (no older watch has it).
    const total = q({ block: "stat", filters: { firmSeat: "other" } }) as AskSpec;
    expect([seatSwitched(total), firmCountyShown(total), answerVersion(total).conditions]).toEqual([false, true, {}]);
  });
});

describe("the seat's conditions in words (describeConditions)", () => {
  it("says on a ranking whose total it is, and in the pills and the receipt", () => {
    const other = describeConditions(firms({ firmSeat: "other" }));
    expect([other.totalLine, other.pills[0], other.byId.firmSeat?.chip]).toEqual(["doar firmele cu sediul în alt județ", "cu sediul în alt județ", "Cu sediul în alt județ"]);
    expect(other.scope).toContainEqual({ label: "Sediul firmei", value: "În alt județ (față de instituție)" });
    const own = describeConditions(firms({ seatCounty: "Cluj" }), { grounding: { seatCounty: { query: "Cluj", canonical: "Cluj" } } });
    expect([own.totalLine, own.pills[0]]).toEqual(["doar firmele cu sediul în județul Cluj", "cu sediul în județul Cluj"]);
    // A link's seat on a question that does not say it is its chip ("Din link"), in the same words.
    expect(describeConditions(q({ block: "stat", filters: { firmSeat: "abroad" } })).byId.firmSeat?.chip).toBe("Cu sediul în străinătate");
  });
});

describe("the window „Unde au sediul firmele?” (kit §4, §6 table 1 and entity_card 1)", () => {
  const seatWindow = (spec: QuestionSpec, key: string) => {
    const view = builderView(spec);
    const win = view.windows[key];
    if (!win) throw new Error(`no window ${key}: ${Object.keys(view.windows).join(", ")}`);
    return win;
  };

  it("offers on a ranking of firms the seat against the buyer, abroad, and a county searched below", () => {
    const win = seatWindow(firms(), "i:firmSeat");
    expect([windowKind(win), win.title, windowTip(win, firms())]).toEqual(["seat", "Unde au sediul firmele?", { id: "sediul-firmei" }]);
    const { options, value } = seatOptions(win, firms());
    expect(options.map((o) => [o.value, o.label, o.disabled ?? null])).toEqual([
      ["none", "Oriunde", null], ["same", "În județul instituției", null], ["other", "În alt județ", null], ["abroad", "În străinătate", null],
    ]);
    expect(value).toBe("none");
    // With the buyers' county fixed, "the institution's county" is named; around an institution, the centre's (its counts' centreCounty).
    expect(seatOptions(win, firms({ county: "Cluj" })).options[1]?.label).toBe("În județul Cluj");
    expect(seatOptions(win, firms(), undefined, "Buzău").options[1]?.label).toBe("În județul Buzău");
    // A foreign firm has no MF filing: beside the CÂȘTIGĂTORII band, "În străinătate" says why it cannot be chosen.
    const banded = seatOptions(win, firms({ minEmployees: 1, maxEmployees: 9 })).options.find((o) => o.value === "abroad");
    expect(banded?.disabled).toMatch(/^Firmele străine nu au bilanț/);
  });

  it("offers on „Cine conduce?” by value abroad and a county; on the profiles a county only", () => {
    const leader = q({ block: "entity_card", dim: "supplier", rankBy: "value" });
    expect(seatOptions(seatWindow(leader, "i:firmSeat"), leader).options.map((o) => o.value)).toEqual(["none", "abroad"]);
    const cloud = q({ block: "scatter", dim: "supplier" });
    const win = seatWindow(cloud, "s:seatCounty");
    expect([windowKind(win), seatOptions(win, cloud).options.map((o) => o.value)]).toEqual(["seat", ["none"]]);
    const index = q({ block: "entity_card", dim: "supplier", rankBy: "risk" });
    expect(seatOptions(seatWindow(index, "i:seatCounty"), index).options.map((o) => o.value)).toEqual(["none"]);
  });

  it("checks the chosen seat, a county on top, and clears every seat key from „Oriunde”", () => {
    const chosen = firms({ firmSeat: "other" });
    expect(seatOptions(seatWindow(chosen, "s:firmSeat"), chosen).value).toBe("other");
    expect(seatCurrentRow(firms({ seatCounty: "Cluj" }))).toMatchObject({ label: "În județul Cluj", choice: { filter: "seatCounty", value: "Cluj" } });
    const link = q({ block: "scatter", dim: "supplier", filters: { county: "Cluj" } });
    expect(seatCurrentRow(link)?.label).toBe("În județul Cluj");
    expect(seatClearChoices(link).map((c) => c.filter)).toEqual(["firmSeat", "seatCounty", "county"]);
    expect(seatClearChoices(firms({ county: "Cluj", firmSeat: "same" })).map((c) => c.filter)).toEqual(["firmSeat", "seatCounty"]);
  });

  it("writes one seat at a time, and runs what it offers", () => {
    const start = firms({ firmSeat: "other" });
    const win = seatWindow(start, "s:firmSeat");
    const county = chooseValue(start, win.slot, { filter: "seatCounty", value: "Cluj" });
    expect([county.spec.filters.firmSeat, county.spec.filters.seatCounty, county.notes]).toEqual([undefined, "Cluj", []]);
    expect(validateSpec(county.spec)).not.toHaveProperty("error");
    const back = chooseValue(county.spec, win.slot, { filter: "firmSeat", value: "same" });
    expect([back.spec.filters.firmSeat, back.spec.filters.seatCounty]).toEqual(["same", undefined]);
  });
});

describe("the seat's counts (part `seat`, kit R5)", () => {
  it("counts on a ranking the classes of the records, the rest not comparable, and the draft's firms once", () => {
    const counts = assembleCounts("seat", "firms", [
      { k: "same", v: "60", n: "4", f: false }, { k: "other", v: "30", n: "3", f: false }, { k: "abroad", v: "5", n: "1", f: false }, { k: null, v: "5", n: "2", f: false },
    ], { ...meta, whole: 8, relative: true });
    expect(counts.options.map((o) => [o.value, o.n, o.share])).toEqual([["same", 4, 0.6], ["other", 3, 0.3], [ABROAD, 1, 0.05]]);
    expect(counts.rest).toMatchObject({ label: "Nu se poate compara", n: 2, value_ron: 5 });
    // Two firms sell in their county and in another: „Oriunde” is 8 firms, not the classes' 10; the value adds up.
    expect(counts.total).toEqual({ n: 8, value_ron: 100 });
  });
});

describe("a firm profile's county, at the first edit (plan §2.6)", () => {
  it("becomes the seat's own key, the same condition, said as renamed", () => {
    const link = q({ block: "scatter", dim: "supplier", filters: { county: "Cluj" } }) as FilterSpec;
    expect(seatFromCounty(link).filters).toEqual({ seatCounty: "Cluj" });
    // An institution's county, a ranking's buyer county and a distribution's group keep theirs.
    for (const spec of [q({ block: "scatter", dim: "authority", filters: { county: "Cluj" } }), firms({ county: "Cluj" }),
      q({ block: "distribution", filters: { supplierId: 1, county: "Cluj" } })])
      expect(seatFromCounty(spec as FilterSpec)).toBe(spec);
    // „Tot clasamentul”: from the index to the ranking of firms, the seat stays the firms' (not the buyers' county).
    const ranking = chooseQuestion(q({ block: "entity_card", dim: "supplier", rankBy: "risk", filters: { county: "Cluj" } }), "table");
    expect([ranking.spec.filters.seatCounty, ranking.spec.filters.county, ranking.renamed]).toEqual(["Cluj", undefined, { county: "seatCounty" }]);
    // A total does not offer a seat: it leaves with its note.
    const total = chooseQuestion(q({ block: "scatter", dim: "supplier", filters: { county: "Cluj" } }), "stat");
    expect([total.spec.filters.seatCounty, total.spec.filters.county, total.notes]).toEqual([undefined, undefined, ["Am scos „cu sediul în județul Cluj”: nu se aplică la această întrebare."]]);
  });
});
