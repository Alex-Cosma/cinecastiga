import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { decodeSpec } from "../../../lib/ask/permalink";
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
    expect(markup).toMatch(/<a class="fk-relax-link" href="\/intreaba\?spec=[^"]+">Cât câștigă PORR<span class="fk-glyph" aria-hidden="true">›<\/span><\/a>/);
    const institution = legacy({ ...firm, dim: "authority", filters: { authorityName: "MUNICIPIUL BUZAU", authorityId: 9 } });
    expect(institution.map((c) => ["text" in c.tip ? c.tip.text : null, c.link?.label])).toEqual([["Cu o singură instituție aleasă, răspunsul e chiar ea.", "Cât cumpără MUNICIPIUL BUZAU"]]);
  });

  it("is no tautology on the index, nor for the other role", () => {
    expect(legacy({ ...firm, rankBy: "risk" }).every((c) => !c.link)).toBe(true);
    expect(legacy({ ...firm, dim: "authority" }).every((c) => !c.link)).toBe(true);
  });
});
