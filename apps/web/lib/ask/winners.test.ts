import { describe, expect, it } from "vitest";
import { questionKey, transitionQuestion, type QuestionSpec } from "./question-ui";
import { runnableError, validateSpec, type AskSpec } from "./spec";
import { TABLE_PAGE_SIZE } from "./compile";
import { BLOCK_FILTERS } from "./filters/blocks";
import { filterContext } from "./filters/context";
import { describeConditions } from "./filters/describe";
import { FILTERS } from "./filters/registry";
import { sentenceTokens } from "./filters/sentence";
import { chooseValue } from "./filters/transition";
import { questionTitle } from "./filters/title";
import { newScopesOf, newYearsOf } from "./filters/defs/winners";
import type { FilterId, FilterSpec, Slot } from "./filters/types";
import { answerVersion } from "./answer-core";
import { newFirmTag, RANKING_PAGE_SIZE, rankedGroupLead, rowFactsWanted, winnerFactTags } from "./winner-words";

/*
 * F5, the ranked winners (plan §3, §4.2; final table §3.3, §3.6, §3.7, §4):
 * their rules, the places that offer them, their words in the sentence, the
 * title and the total line, the facts of a row, and what a change of subject
 * does to them. The engine's figures are winners.integration.test.ts's.
 */

const q = (spec: Partial<QuestionSpec> & { block: string }): FilterSpec =>
  transitionQuestion({ measure: "value", filters: {}, ...spec } as QuestionSpec).spec as FilterSpec;
const firms = (filters: QuestionSpec["filters"] = {}) => q({ block: "table", dim: "supplier", topN: 10, filters });
const institutions = (filters: QuestionSpec["filters"] = {}) => q({ block: "table", dim: "authority", topN: 10, filters });
const cluj = { uatSiruta: 54975, uatName: "Cluj-Napoca", yearFrom: 2024, yearTo: 2025 };
const errorOf = (spec: FilterSpec) => runnableError(validateSpec(spec) as AskSpec);

describe("the rules of the ranked winners (WINNERS_RULES)", () => {
  it("asks the sense with the year, a named buyer for new suppliers, 2020 in the archive, no year after the period", () => {
    expect(validateSpec(firms({ newSince: 2024 }))).toEqual({ error: "„Firme noi” cere sensul și anul. Alege-le din fereastră." });
    expect(validateSpec(firms({ newSince: 2024, newScope: "buyer" }))).toMatchObject({ error: expect.stringContaining("Furnizori noi") });
    expect(errorOf(firms({ ...cluj, newSince: 2024, newScope: "buyer" }))).toBeNull();
    expect(validateSpec(firms({ newSince: 2019, newScope: "archive" }))).toMatchObject({ error: expect.stringContaining("2020") });
    expect(errorOf(firms({ newSince: 2015, newScope: "registry" }))).toBeNull();
    expect(validateSpec(firms({ yearFrom: 2024, yearTo: 2024, newSince: 2025, newScope: "registry" }))).toMatchObject({ error: expect.stringContaining("după sfârșitul perioadei") });
    // A foreign firm has no register number (SEAT_RULES).
    expect(validateSpec(firms({ firmSeat: "abroad", newSince: 2024, newScope: "registry" }))).toMatchObject({ error: expect.stringContaining("Registrul Comerțului") });
    // Only on rankings: a total has no list to narrow.
    expect(validateSpec({ block: "stat", measure: "value", filters: { newSince: 2024, newScope: "archive" } })).toMatchObject({ error: expect.stringContaining("clasamente") });
    // On institutions the firms' own years are their sellers' selection.
    expect(errorOf(institutions({ newSince: 2024, newScope: "registry" }))).toBeNull();
  });

  it("keeps the main public client to firms of one named buyer, one firm taking half to institutions", () => {
    expect(validateSpec(firms({ mainClient: true }))).toMatchObject({ error: expect.stringContaining("instituție aleasă") });
    expect(errorOf(firms({ ...cluj, mainClient: true }))).toBeNull();
    expect(validateSpec(institutions({ mainClient: true }))).toMatchObject({ error: expect.any(String) });
    expect(errorOf(institutions({ dominantSupplier: true }))).toBeNull();
    expect(validateSpec(firms({ dominantSupplier: true }))).toMatchObject({ error: expect.stringContaining("instituțiilor") });
  });
});

describe("the places that offer them (BLOCK_FILTERS)", () => {
  const rowOf = (spec: FilterSpec) => BLOCK_FILTERS.table.rows(spec, filterContext(spec)).map((row) => [row.label, row.chips.map((chip) => chip.id)]);
  it("draws CÂȘTIGĂTORII and INSTITUȚIILE as group rows", () => {
    expect(rowOf(firms())).toEqual([["Câștigătorii", ["newSince", "employees"]]]);
    expect(rowOf(firms(cluj))).toEqual([["Câștigătorii", ["newSince", "employees", "mainClient"]]]);
    expect(rowOf(institutions())).toEqual([["Instituțiile", ["dominantSupplier"]]]);
    expect(rowOf(q({ block: "table", dim: "county", topN: 10, filters: {} }))).toEqual([]);
    for (const id of ["newSince", "mainClient", "dominantSupplier"] as FilterId[]) expect(FILTERS[id].scope("table", firms() as never)).toBe("group");
  });

  it("puts „Firme noi” first on „Cine conduce?” by value, never on the index (S5R-entity-card-new-firms-merge)", () => {
    const leader = (rankBy: "value" | "risk", filters: QuestionSpec["filters"] = {}) => q({ block: "entity_card", dim: "supplier", rankBy, filters });
    const rows = (spec: FilterSpec) => BLOCK_FILTERS.entity_card.rows(spec, filterContext(spec)).map((row) => [row.label, row.kind, row.chips.map((chip) => chip.id)]);
    expect(rows(leader("value"))).toEqual([["Câștigătorii", "group", ["newSince", "employees"]]]);
    // The main public client stays the table's (WINNERS_RULES.mainClient), even with a named buyer.
    expect(rows(leader("value", cluj))).toEqual([["Câștigătorii", "group", ["newSince", "employees"]]]);
    expect(rows(leader("risk"))).toEqual([["Câștigătorii", "selection", ["employees"]]]);
    const ctx = (spec: FilterSpec) => ({ ...filterContext(spec), year: 2026 });
    expect(newScopesOf(leader("value", cluj), ctx(leader("value", cluj)))).toEqual(["buyer", "archive", "registry"]);
    expect(newScopesOf(leader("risk"), ctx(leader("risk")))).toEqual([]);
    expect(errorOf(leader("value", { ...cluj, newSince: 2024, newScope: "buyer" }))).toBeNull();
  });

  it("offers new for the buyer only with one, the last four years up to the period's end, the archive's from 2020", () => {
    const ctx = (spec: FilterSpec) => ({ ...filterContext(spec), year: 2026 });
    expect(newScopesOf(firms(), ctx(firms()))).toEqual(["archive", "registry"]);
    expect(newScopesOf(firms(cluj), ctx(firms(cluj)))).toEqual(["buyer", "archive", "registry"]);
    expect(newYearsOf(firms(cluj), ctx(firms(cluj)), "buyer")).toEqual([2022, 2023, 2024, 2025]);
    expect(newYearsOf(firms({ yearTo: 2021 }), ctx(firms()), "archive")).toEqual([2020, 2021]);
    expect(newYearsOf(firms({ yearTo: 2021 }), ctx(firms()), "registry")).toEqual([2018, 2019, 2020, 2021]);
    expect(newYearsOf(firms(), ctx(firms()), "registry")).toEqual([2023, 2024, 2025, 2026]);
  });
});

describe("their words", () => {
  const sentence = (spec: FilterSpec) => sentenceTokens(spec, filterContext(spec)).map((t) => t.kind === "text" ? t.text : `[${t.kind === "slot" ? t.value : t.text}]`).join("");
  it("says the list in the title's tail on firms, and the sellers in the sentence on institutions (kit §5 table 5)", () => {
    expect(questionTitle(firms({ ...cluj, newSince: 2024, newScope: "buyer" }))).toMatch(/, doar furnizorii noi din 2024\?$/);
    expect(questionTitle(firms({ newSince: 2025, newScope: "archive" }))).toMatch(/doar firmele cu prima înregistrare din 2025\?$/);
    expect(questionTitle(firms({ ...cluj, mainClient: true }))).toMatch(/doar firmele al căror principal client public e instituția aleasă\?$/);
    expect(questionTitle(institutions({ dominantSupplier: true }))).toMatch(/doar instituțiile la care o firmă ia peste jumătate\?$/);
    expect(sentence(institutions({ newSince: 2024, newScope: "registry", maxEmployees: 0 }))).toContain("de la [firme înmatriculate din 2024, fără angajați]");
    expect(sentence(q({ block: "table", dim: "county", topN: 10, filters: { newSince: 2025, newScope: "archive" } }))).toContain("de la [firme cu prima înregistrare din 2025]");
  });

  it("names the chips as the kit does (kit §4) and lists them for a watch's receipt", () => {
    const d = (spec: FilterSpec) => describeConditions(spec).byId;
    expect(d(firms({ ...cluj, newSince: 2024, newScope: "buyer" })).newSince?.chip).toBe("Furnizori noi · din 2024");
    expect(d(firms({ newSince: 2025, newScope: "archive" })).newSince?.chip).toBe("Prima dată · din 2025");
    expect(d(firms({ newSince: 2024, newScope: "registry" })).newSince?.chip).toBe("Înmatriculate din 2024");
    expect(d(firms({ ...cluj, mainClient: true })).mainClient?.scope).toEqual([{ label: "Principalul lor client public", value: expect.stringContaining("cel puțin jumătate") }]);
    // A group narrows the list: the total line, which says what changes the total, does not list it.
    expect(describeConditions(firms({ newSince: 2024, newScope: "registry" })).totalWords).toEqual([]);
  });

  it("writes the list's line and the facts of a row (kit P8)", () => {
    expect(rankedGroupLead(firms({ ...cluj, newSince: 2024, newScope: "buyer" }), 177)).toBe("177 de furnizori noi din 2024");
    expect(rankedGroupLead(firms({ newSince: 2024, newScope: "registry", minEmployees: 1, maxEmployees: 9 }), 3658)).toBe("3.658 de firme înmatriculate din 2024, cu 1–9 angajați");
    expect(rankedGroupLead(firms({ newSince: 2025, newScope: "archive", maxEmployees: 0 }), 1)).toBe("1 firmă cu prima înregistrare din 2025, fără angajați");
    expect(rankedGroupLead(institutions({ dominantSupplier: true }), 1027)).toBe("1.027 de instituții la care o firmă ia peste jumătate");
    expect(rankedGroupLead(firms({ maxEmployees: 0 }), 12)).toBeNull();
    const facts = { first: "2024-03-02", registered: 2024, employees: 0, filed: 2021, foreign: true, firstHere: "2024-10-02", main: true };
    expect(winnerFactTags(firms({ ...cluj, newSince: 2024, newScope: "buyer", maxEmployees: 0, mainClient: true }), facts, 2026)).toEqual([
      { text: "prima dată aici: 02.10.2024" }, { text: "0 angajați · bilanț 2021", tone: "caveat" },
      { text: "principalul client public", tone: "accent" }, { text: "din străinătate" },
    ]);
    expect(winnerFactTags(firms({ newSince: 2024, newScope: "registry" }), facts, 2026)).toEqual([{ text: "înmatriculată în 2024" }, { text: "din străinătate" }]);
    const top = { id: "5", name: "DAROCONSTRUCT", value: 17, count: 1, share: 0.17 };
    expect(winnerFactTags(institutions(), { top }, 2026)).toEqual([{ text: "cel mai mare furnizor: DAROCONSTRUCT · 17,0%" }]);
    expect(winnerFactTags(institutions(), { top: { ...top, share: 0.6, count: 3 } }, 2026)[0]?.tone).toBe("accent");
    // S6: any ranking of firms with contracts reads its rows' joint value („în asociere”); direct acquisitions alone, only with a chip.
    const da = (filters: QuestionSpec["filters"] = {}) => ({ ...firms(filters), dataset: "da" }) as FilterSpec;
    expect([rowFactsWanted(firms()), rowFactsWanted(da()), rowFactsWanted(da({ maxEmployees: 0 })), rowFactsWanted(institutions())]).toEqual([true, false, true, true]);
    expect(RANKING_PAGE_SIZE).toBe(TABLE_PAGE_SIZE);
  });

  it("tags a row „în asociere” from a quarter of its value, after the chips' tags and before the seat (S5R-joint-tag-deferred)", () => {
    const facts = { first: "2019-01-01", registered: 2010, employees: 12, filed: 2025, foreign: true, joint: 25 };
    expect(winnerFactTags(firms(), facts, 2026, 100)).toEqual([{ text: "în asociere" }, { text: "din străinătate" }]);
    expect(winnerFactTags(firms(), { ...facts, joint: 24.9 }, 2026, 100)).toEqual([{ text: "din străinătate" }]);
    // Without the row's value (or with none in the selection) no share, no tag.
    expect(winnerFactTags(firms(), facts, 2026)).toEqual([{ text: "din străinătate" }]);
    expect(winnerFactTags(firms({ maxEmployees: 20, minEmployees: 10 }), facts, 2026, 50)).toEqual([
      { text: "12 angajați · bilanț 2025" }, { text: "în asociere" }, { text: "din străinătate" },
    ]);
  });

  it("names the sense of „Firme noi” once for the ranking and the podium (newFirmTag)", () => {
    const facts = { first: "2025-04-01", registered: 2024, firstHere: "2024-10-02" };
    expect(newFirmTag(firms({ ...cluj, newSince: 2024, newScope: "buyer" }), facts)).toEqual({ text: "prima dată aici: 02.10.2024" });
    expect(newFirmTag(firms({ newSince: 2025, newScope: "archive" }), facts)).toEqual({ text: "prima dată în 2025" });
    expect(newFirmTag(firms({ newSince: 2024, newScope: "registry" }), facts)).toEqual({ text: "înmatriculată în 2024" });
    expect(newFirmTag(firms(), facts)).toBeNull();
    expect(newFirmTag(firms({ newSince: 2024, newScope: "registry" }), { ...facts, registered: null })).toBeNull();
  });
});

describe("a change of subject (transitionQuestion, final table §4)", () => {
  const subject = (spec: FilterSpec): Slot => BLOCK_FILTERS.table.sentence(spec, filterContext(spec)).find((s) => s.picker === "subject")!;
  it("moves the firms' own year to „de la [firme …]”, drops new for the buyer and the main client with a note", () => {
    const own = chooseValue(firms({ newSince: 2024, newScope: "registry" }), subject(firms()), { filter: "dim", value: { dim: "authority" } });
    expect([own.spec.filters.newSince, own.spec.filters.newScope, own.dropped]).toEqual([2024, "registry", []]);
    const buyer = chooseValue(firms({ ...cluj, newSince: 2024, newScope: "buyer", mainClient: true }), subject(firms(cluj)), { filter: "dim", value: { dim: "authority" } });
    expect(buyer.dropped).toEqual(expect.arrayContaining(["newSince", "mainClient"]));
    expect(buyer.notes.length).toBeGreaterThan(0);
    const back = chooseValue(institutions({ dominantSupplier: true }), subject(institutions()), { filter: "dim", value: { dim: "supplier" } });
    expect([back.spec.filters.dominantSupplier, back.dropped]).toEqual([undefined, ["dominantSupplier"]]);
  });

  it("is a new key: no version of before alerts a watch", () => {
    expect(answerVersion(validateSpec(firms({ newSince: 2024, newScope: "registry" })) as AskSpec).conditions).not.toHaveProperty("newSince");
    expect(questionKey(firms({ newSince: 2024, newScope: "registry" }))).toContain("newSince");
  });
});
