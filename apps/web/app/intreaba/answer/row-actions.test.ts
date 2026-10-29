import { describe, expect, it } from "vitest";
import { EXCLUDE_FULL, excludeEntity } from "../../../lib/ask/filters/exclusions";
import type { FilterSpec } from "../../../lib/ask/filters/types";
import type { AskSpec } from "../../../lib/ask/spec";
import { entityRowActions } from "./row-actions";

/*
 * P7, the "⋯" of an answer's row (kit component 15, F4): the actions the
 * question gives that row's entity, in the kit's order and glyphs, and
 * "Scoate din calcul" disabled with its reason once five are out.
 */

const on = { records: () => undefined, exclude: () => undefined };
const row = { id: "202", name: "SYSTRA SA" };
const spec = (s: Partial<AskSpec>): AskSpec => ({ block: "table", measure: "value", filters: {}, ...s }) as AskSpec;
const shape = (actions: ReturnType<typeof entityRowActions>) => actions.map((a) => [a.label, a.glyph, a.href ?? null, a.disabled ?? null]);

describe("the «⋯» of an answer's row", () => {
  it("on a ranking of firms: records, «Scoate din calcul», the firm's page", () => {
    expect(shape(entityRowActions(spec({ dim: "supplier", topN: 10 }), row, on))).toEqual([
      ["Vezi înregistrările", "→", null, null], ["Scoate din calcul", "−", null, null], ["Fișa firmei", "↗", "/entitati/202", null],
    ]);
  });

  it("on institutions, «Cine conduce?» by value and a trend; none on counties, records and the page on the index's tied profiles", () => {
    expect(shape(entityRowActions(spec({ dim: "authority", topN: 10 }), row, on)).map((a) => a[0])).toEqual(["Vezi înregistrările", "Scoate din calcul", "Fișa instituției"]);
    expect(entityRowActions(spec({ block: "entity_card", dim: "supplier", rankBy: "value" }), row, on)).toHaveLength(3);
    expect(entityRowActions(spec({ block: "trend", dim: "supplier", filters: { yearFrom: 2024, yearTo: 2025 } }), row, on)).toHaveLength(3);
    expect(entityRowActions(spec({ dim: "county", topN: 10 }), row, on)).toEqual([]);
    // F6c: the profiles tied at the top of the index (entity_card-2): their records and their page, no calculation to leave them out of.
    expect(shape(entityRowActions(spec({ block: "entity_card", dim: "supplier", rankBy: "risk" }), row, on))).toEqual([
      ["Vezi înregistrările", "→", null, null], ["Fișa firmei", "↗", "/entitati/202", null],
    ]);
    expect(shape(entityRowActions(spec({ block: "entity_card", dim: "authority", rankBy: "risk" }), row, on)).map((a) => a[0])).toEqual(["Vezi înregistrările", "Fișa instituției"]);
  });

  it("leaves out an action without its handler, and disables «Scoate din calcul» at five, with the reason", () => {
    expect(shape(entityRowActions(spec({ dim: "supplier", topN: 10 }), row, {})).map((a) => a[0])).toEqual(["Fișa firmei"]);
    let five = spec({ dim: "supplier", topN: 10 }) as unknown as FilterSpec;
    for (let i = 0; i < 5; i++) five = excludeEntity(five, { field: "supplier", value: String(300 + i), label: `F${i}` })!;
    const exclude = entityRowActions(five as unknown as AskSpec, row, on).find((a) => a.label === "Scoate din calcul");
    expect(exclude?.disabled).toBe(EXCLUDE_FULL);
  });
});
