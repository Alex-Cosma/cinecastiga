import { describe, expect, it } from "vitest";
import { questionKey, transitionQuestion, type QuestionSpec } from "../question-ui";
import { BLOCK_FILTERS } from "./blocks";
import { filterContext } from "./context";
import { legacyConditions, presentConditions } from "./legacy-conditions";
import type { Choice } from "./pickers";
import { chooseQuestion, chooseValue, restoreParked } from "./transition";
import type { FilterId, FilterSpec, Slot } from "./types";

/*
 * Changing the draft (plan §2.4, §2.8; kit §5.43): what stays, what leaves
 * with a note, what waits in the parked row. registry.test.ts walks every
 * choice and pair for "never a silent drop"; these are the finals' cases.
 */

const q = (spec: Partial<QuestionSpec> & { block: string }): FilterSpec =>
  transitionQuestion({ measure: "value", filters: {}, ...spec } as QuestionSpec).spec as FilterSpec;
/** The sentence's phrase of a filter on this draft. */
const phrase = (spec: FilterSpec, id: FilterId): Slot => {
  const found = BLOCK_FILTERS[spec.block as keyof typeof BLOCK_FILTERS].sentence(spec, filterContext(spec)).find((s) => s.id === id || s.writes?.includes(id));
  if (!found) throw new Error(`no phrase for ${id} on ${questionKey(spec)}`);
  return found;
};
const choose = (spec: FilterSpec, id: FilterId, choice: Choice) => chooseValue(spec, phrase(spec, id), choice);
const ids = (spec: FilterSpec) => [...presentConditions(spec).keys()];

describe("the axis of «Cine conduce?» is a lens (kit §5.43, plan §4.13)", () => {
  const hospitals = q({ block: "entity_card", dim: "authority", rankBy: "value", dataset: "da", filters: { cpvTerm: "medicamente", yearFrom: 2025, yearTo: 2025, county: "Cluj", authorityKind: "comuna" } });

  it("parks what the index cannot apply, with the phrases the reader saw", () => {
    const risk = choose(hospitals, "rankBy", { filter: "rankBy", value: "risk" });
    expect(risk.spec.rankBy).toBe("risk");
    expect(risk.parked).toMatchObject({ label: "Nu se aplică indicelui", lens: "value" });
    expect(risk.parked?.items.map((item) => [item.id, item.label])).toEqual([["cpvTerm", "„medicamente”"], ["period", "2025"]]);
    // An institution's county and kind are the index's too, and direct acquisitions are its archive (the profile line
    // says so): they stay; nothing else changes, nothing is noted.
    expect(ids(risk.spec)).toEqual(["dataset", "authorityKind", "county"]);
    expect([risk.notes, risk.dropped]).toEqual([[], []]);
    // Parked is a draft state: the spec, so the link, a saved question and a watch, carry none of it.
    expect(JSON.stringify(risk.spec)).not.toMatch(/medicamente|yearFrom/);
  });

  it("brings everything back from one parked chip, or from the value axis", () => {
    const risk = choose(hospitals, "rankBy", { filter: "rankBy", value: "risk" });
    for (const back of [restoreParked(risk.spec, risk.parked!), chooseValue(risk.spec, phrase(risk.spec, "rankBy"), { filter: "rankBy", value: "value" }, risk.parked)]) {
      expect(questionKey(back.spec)).toBe(questionKey(hospitals));
      expect(back.parked).toBeNull();
    }
  });

  it("parks a firm's seat on the value axis, and the buyer's place on the index (the county changes meaning)", () => {
    const seat = q({ block: "entity_card", dim: "supplier", rankBy: "risk", filters: { county: "Cluj" } });
    const value = choose(seat, "rankBy", { filter: "rankBy", value: "value" });
    expect(value.parked).toMatchObject({ label: "Nu se aplică valorii", lens: "risk", items: [{ id: "county", label: "în județul Cluj" }] });
    expect(value.parked?.tip).toMatch(/^Pe valoare, județul e locul instituției/);
    expect(value.spec.filters.county).toBeUndefined();
    const place = q({ block: "entity_card", dim: "supplier", rankBy: "value", filters: { county: "Cluj", authorityKind: "comuna", authorityName: "Comuna Exemplu", authorityId: 101 } });
    const risk = choose(place, "rankBy", { filter: "rankBy", value: "risk" });
    // The named institution wins the buyer's phrase: the kind and the county it carried were the link's chips, parked too.
    expect(risk.parked?.items.map((item) => item.id)).toEqual(["authority", "county", "authorityKind"]);
    // Without it, the buyer's kind and place are the sentence's, and both wait for the value axis.
    expect(choose(q({ block: "entity_card", dim: "supplier", rankBy: "value", filters: { county: "Cluj", authorityKind: "comuna" } }), "rankBy", { filter: "rankBy", value: "risk" }).parked?.items.map((item) => item.id))
      .toEqual(["authorityKind", "county"]);
  });

  it("parks a link's chips the index refuses, and lets the value axis apply them again", () => {
    const link = q({ block: "entity_card", dim: "supplier", rankBy: "value", filters: { singleBidder: true }, dataset: "contracts" });
    const risk = choose(link, "rankBy", { filter: "rankBy", value: "risk" });
    expect(risk.parked?.items.map((item) => item.id)).toEqual(["dataset", "singleBidder"]);
    expect(legacyConditions(risk.spec)).toEqual([]);
    expect(questionKey(restoreParked(risk.spec, risk.parked!).spec)).toBe(questionKey(link));
  });
});

describe("another question from the catalogue", () => {
  it("drops, each with its note, what the new question cannot apply", () => {
    const to = chooseQuestion(q({ block: "stat", filters: { cpvTerm: "medicamente", yearFrom: 2025, yearTo: 2025, minEmployees: 1, maxEmployees: 9 } }), "scatter");
    expect(to.dropped).toEqual(["cpvTerm", "period", "employees"]);
    expect(to.notes).toEqual([
      "Am scos „pentru „medicamente””: nu se aplică la această întrebare.", "Am scos „în 2025”: nu se aplică la această întrebare.",
      "Am scos „firme cu 1–9 angajați”: nu se aplică la această întrebare.",
    ]);
  });

  it("keeps what it shows, and what an old link carried where the engine still applies it", () => {
    expect(chooseQuestion(q({ block: "stat", filters: { minEmployees: 1, maxEmployees: 9 } }), "map").dropped).toEqual(["employees"]);
    // A link's threshold stays its chip on the map, and leaves the trend, which refuses it.
    const link = q({ block: "stat", filters: {}, minimumRecords: { role: "supplier", count: 3 } });
    const map = chooseQuestion(link, "map");
    expect([map.dropped, legacyConditions(map.spec).map((c) => c.label)]).toEqual([[], ["Din link: firme cu cel puțin 3 înregistrări în selecție"]]);
    expect(chooseQuestion(link, "trend").dropped).toEqual(["minimumRecords"]);
    // A profile reads every stream as its archive: direct acquisitions stay, without a note (the profile line says it).
    expect(chooseQuestion(q({ block: "stat", dataset: "da", filters: {} }), "scatter")).toMatchObject({ dropped: [], notes: [] });
  });

  it("brings the parked conditions back where the new question applies them", () => {
    const value = q({ block: "entity_card", dim: "supplier", rankBy: "value", filters: { cpvTerm: "medicamente" } });
    const risk = choose(value, "rankBy", { filter: "rankBy", value: "risk" });
    const table = chooseQuestion(risk.spec, "table", risk.parked);
    expect([table.spec.filters.cpvTerm, table.parked, table.dropped]).toEqual(["medicamente", null, []]);
    expect(chooseQuestion(risk.spec, "scatter", risk.parked).dropped).toEqual(["cpvTerm"]);
  });
});

describe("a window's choice", () => {
  it("switches the risk cloud to firms: the kind leaves with a note, the county stays as their seat (plan §4.12)", () => {
    const to = choose(q({ block: "scatter", dim: "authority", filters: { authorityKind: "spital", county: "Buzău" } }), "dim", { filter: "dim", value: { dim: "supplier" } });
    expect([to.spec.dim, to.spec.filters.county, to.spec.filters.authorityKind]).toEqual(["supplier", "Buzău", undefined]);
    expect(to.notes).toEqual(["Am scos „doar spitale”: nu se potrivește cu alegerea nouă.", "Județul ales e acum sediul firmelor, nu locul instituțiilor."]);
    // County councils have one per county: the place becomes the whole country, with a note.
    const councils = choose(q({ block: "scatter", dim: "authority", filters: { county: "Buzău" } }), "dim", { filter: "dim", value: { dim: "authority", kind: "consiliu_judetean" } });
    expect([councils.spec.filters.county, councils.notes]).toEqual([undefined, ["Am scos „din județul Buzău”: nu se potrivește cu alegerea nouă."]]);
  });

  it("keeps a buyer's kind when a ranking of institutions becomes one of firms", () => {
    const to = choose(q({ block: "table", dim: "authority", filters: { authorityKind: "spital" } }), "dim", { filter: "dim", value: { dim: "supplier" } });
    expect([to.spec.filters.authorityKind, to.notes]).toEqual(["spital", []]);
  });

  it("chooses one tab of «De la cine?» and one buyer at a time, replacing the other without a note (kit §5.24)", () => {
    const firm = q({ block: "stat", filters: { supplierName: "PORR", supplierId: 22 } });
    const person = choose(firm, "supplier", { filter: "admin", value: { key: "ion|1970-01-01|x", name: "ION" } });
    expect([person.spec.filters.supplierId, person.spec.filters.adminName, person.notes]).toEqual([undefined, "ION", []]);
    const kind = q({ block: "stat", filters: { authorityKind: "spital", county: "Cluj" } });
    const one = choose(kind, "authorityKind", { filter: "authority", value: { name: "Spitalul X", id: 7 } });
    // The named institution says no place: the county it leaves behind has a note.
    expect([one.spec.filters.authorityKind, one.spec.filters.authorityId, one.dropped, one.notes]).toEqual([undefined, 7, ["county"], ["Am scos „din județul Cluj”: nu se potrivește cu alegerea nouă."]]);
  });

  it("notes what a window removes outside itself: the single bidder of another stream, the second entity of another role", () => {
    const link = q({ block: "table", dim: "supplier", dataset: "contracts", filters: { singleBidder: true } });
    expect(choose(link, "dataset", { filter: "dataset", value: "da" }).notes).toEqual(["Am scos „doar contractele cu o singură ofertă”: nu se potrivește cu alegerea nouă."]);
    const pair = q({ block: "compare", filters: { authorityName: "A", authorityId: 1, compareWith: "B", compareWithId: 2 } });
    const firm = choose(pair, "authority", { filter: "supplier", value: { name: "PORR", id: 22 } });
    expect([firm.spec.filters.compareWith, firm.notes]).toEqual([undefined, ["Am scos „comparat cu „B””: nu se potrivește cu alegerea nouă."]]);
  });
});
