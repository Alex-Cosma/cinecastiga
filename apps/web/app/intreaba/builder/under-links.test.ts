import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { populationDetail, unnamedEntityIds } from "../../../lib/ask/filters/describe";
import { decodeSpec } from "../../../lib/ask/permalink";
import type { QueryPopulation } from "../../../lib/ask/population";
import type { QuestionSpec } from "../../../lib/ask/question-ui";
import UnderChips, { type UnderChipItem } from "./UnderChips";
import { builderView } from "./view";

/*
 * What a chip under the sentence (P4) says of an old link's condition, as
 * markup: the "›" beside a tautology of "Cine conduce?" (plan §4.13, final
 * entity_card §7) and the (?) of a precise selection.
 */

const text = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const legacy = (spec: QuestionSpec) => builderView(spec).under.filter((item): item is Extract<UnderChipItem, { kind: "legacy" }> => item.kind === "legacy");

describe("an old link's tautology of «Cine conduce?»", () => {
  const firm: QuestionSpec = { block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: { supplierName: "PORR", supplierId: 7, yearFrom: 2025, yearTo: 2025 } };

  it("says why on its (?) and offers the entity's total beside the chip, through retarget", () => {
    const [chip] = legacy(firm);
    expect(chip).toMatchObject({ words: "firma „PORR”", tip: { title: "Din link", text: "Cu o singură firmă aleasă, răspunsul e chiar ea." }, link: { label: "Cât câștigă PORR", glyph: "›" } });
    const href = chip!.link!.href!;
    expect(href).toMatch(/^\/intreaba\?spec=/);
    expect(decodeSpec(decodeURIComponent(href.slice("/intreaba?spec=".length)))).toMatchObject({ block: "stat", filters: { supplierName: "PORR", supplierId: 7, yearFrom: 2025, yearTo: 2025 } });
    const markup = renderToStaticMarkup(createElement(UnderChips, { items: builderView(firm).under, onRemove: () => {} }));
    expect(text(markup)).toContain("Din link: firma „PORR”");
    expect(markup).toMatch(/<a class="qb-relax-link" href="\/intreaba\?spec=[^"]+">Cât câștigă PORR<span class="qb-glyph" aria-hidden="true">›<\/span><\/a>/);
    const institution = legacy({ ...firm, dim: "authority", filters: { authorityName: "MUNICIPIUL BUZAU", authorityId: 9 } });
    expect(institution.map((c) => ["text" in c.tip ? c.tip.text : null, c.link?.label])).toEqual([["Cu o singură instituție aleasă, răspunsul e chiar ea.", "Cât cumpără MUNICIPIUL BUZAU"]]);
  });

  it("is no tautology on the index, nor for the other role", () => {
    expect(legacy({ ...firm, rankBy: "risk" }).every((c) => !c.link)).toBe(true);
    expect(legacy({ ...firm, dim: "authority" }).every((c) => !c.link)).toBe(true);
  });
});

describe("the (?) of an old link's precise selection", () => {
  // The S2 report's link: an institution and a CPV code, or a firm or a county, by id and without labels.
  const population: QueryPopulation = { operator: "or", groups: [
    { operator: "and", conditions: [{ field: "authority", op: "in", values: ["2146445"] }, { field: "cpv", op: "in", values: ["45"] }] },
    { operator: "or", conditions: [{ field: "supplier", op: "in", values: ["2124387"] }, { field: "county", op: "in", values: ["Buzău"] }] },
  ] };
  const link: QuestionSpec = { block: "timeseries", measure: "value", filters: {}, population };
  const tipOf = (spec: QuestionSpec, entities?: Record<string, string>) => {
    const [chip] = builderView(spec, entities ? { entities } : {}).under.filter((item) => item.kind === "legacy" || item.kind === "origin");
    return chip && "text" in chip.tip ? chip.tip.text : null;
  };
  const LINK_TIP = "Condiție din link; se aplică la fel. Nu se alege aici.";

  it("counts the institutions and firms until their names come, never a bare id", () => {
    expect(legacy(link).map((c) => c.words)).toEqual(["selecție avansată, 4 condiții"]);
    expect(tipOf(link)).toBe(`${LINK_TIP} (doar 1 instituție ȘI doar CPV 45) SAU (doar 1 firmă SAU doar județul Buzău)`);
    expect(tipOf(link)).not.toMatch(/\d{5,}/);
  });

  it("names them once the builder has looked them up, and asks only for those a chip names", () => {
    expect(unnamedEntityIds(population)).toEqual(["2146445", "2124387"]);
    expect(tipOf(link, { "2146445": "Municipiul Cluj-Napoca", "2124387": "DEDEMAN S.R.L." }))
      .toBe(`${LINK_TIP} (doar instituția Municipiul Cluj-Napoca ȘI doar CPV 45) SAU (doar firma DEDEMAN S.R.L. SAU doar județul Buzău)`);
    // A name not (yet) known: that list stays counted.
    expect(tipOf(link, { "2146445": "Municipiul Cluj-Napoca" })).toBe(`${LINK_TIP} (doar instituția Municipiul Cluj-Napoca ȘI doar CPV 45) SAU (doar 1 firmă SAU doar județul Buzău)`);
    // Labelled lists name themselves; a list of three is counted whatever is known; past 20 ids nothing is asked.
    const labelled: QueryPopulation = { operator: "and", groups: [{ operator: "and", conditions: [{ field: "supplier", op: "in", values: ["7"], labels: ["PORR"] }, { field: "authority", op: "in", values: ["1", "2", "3"] }] }] };
    expect([unnamedEntityIds(labelled), populationDetail(labelled, { "1": "A", "2": "B", "3": "C" })]).toEqual([[], "doar firma PORR ȘI doar 3 instituții"]);
    const many: QueryPopulation = { operator: "or", groups: Array.from({ length: 21 }, (_, i) => ({ operator: "and" as const, conditions: [{ field: "supplier" as const, op: "in" as const, values: [String(100 + i)] }] })) };
    expect(unnamedEntityIds(many)).toEqual([]);
  });

  it("names another page's selection in its (?) too (a relationship's pairs)", () => {
    const pairs: QuestionSpec = { block: "stat", measure: "value", filters: { authorityId: 1, authorityName: "X" }, population: { operator: "or", groups: [
      { operator: "and", conditions: [{ field: "authority", op: "in", values: ["1"] }, { field: "supplier", op: "in", values: ["101"] }] },
      { operator: "and", conditions: [{ field: "authority", op: "in", values: ["1"] }, { field: "supplier", op: "in", values: ["102"] }] },
    ] } };
    expect(tipOf(pairs)).toBe("(doar 1 instituție ȘI doar 1 firmă) SAU (doar 1 instituție ȘI doar 1 firmă)");
    expect(tipOf(pairs, { "1": "X", "101": "PORR", "102": "ERBASU" })).toBe("(doar instituția X ȘI doar firma PORR) SAU (doar instituția X ȘI doar firma ERBASU)");
    // An entity's records (entityCaptureSpec): the looked-up name in the chip itself.
    const entity: QuestionSpec = { block: "stat", measure: "value", filters: {}, population: { operator: "and", groups: [{ operator: "or", conditions: [
      { field: "authority", op: "in", values: ["5"] }, { field: "supplier", op: "in", values: ["5"] },
    ] }] } };
    expect(unnamedEntityIds(entity.population)).toEqual(["5"]);
    expect(builderView(entity, { entities: { "5": "PORR" } }).under).toEqual([expect.objectContaining({ kind: "origin", prefix: "Activitatea entității", words: "PORR (ca instituție sau ca firmă)" })]);
  });
});
