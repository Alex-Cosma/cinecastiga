import { describe, expect, it } from "vitest";
import type { BlockData } from "../../lib/ask/compile";
import type { AskSpec } from "../../lib/ask/spec";
import { emptyAnswer, relaxations } from "./answer-empty";

/*
 * Review S2-F1b, G2 (kit component 17): an empty answer offers at most three
 * wider questions, named by the first row of each window, the last
 * conditions first; never the question itself (its entity, its subject).
 */

const spec = (s: Partial<AskSpec> & { block: AskSpec["block"] }): AskSpec => ({ measure: "value", filters: {}, ...s } as AskSpec);

describe("the empty answer (G2)", () => {
  it("is an answer with no record; a verification's «Nu» is an answer", () => {
    expect(emptyAnswer({ block: "stat", stat: { value: 0, count: 0 } } as BlockData)).toBe(true);
    expect(emptyAnswer({ block: "stat", stat: { value: 5, count: 1 } } as BlockData)).toBe(false);
    expect(emptyAnswer({ block: "table", rows: [], page: 0 } as unknown as BlockData)).toBe(true);
    expect(emptyAnswer({ block: "map", counties: [{ county: "Cluj", value: 0, count: 0 }], unknown: { value: 0, count: 0 } } as unknown as BlockData)).toBe(true);
    expect(emptyAnswer({ block: "fact_check", fact: { count: 0 } } as unknown as BlockData)).toBe(false);
  });

  it("is a trend whose selection is empty; an empty group of a full selection says so in its list (TB-screen)", () => {
    const trend = (all: number, rows: number) => ({ block: "trend", yearA: 2024, yearB: 2025, rowsTrend: Array(rows).fill({}),
      composition: { all: { count: all, valueA: 0, valueB: 0 }, gone: { count: 0, valueA: 0, valueB: 0 } } }) as unknown as BlockData;
    expect(emptyAnswer(trend(0, 0))).toBe(true);
    expect(emptyAnswer(trend(42, 0))).toBe(false);
    // An answer stored before trend-2: its one list.
    expect(emptyAnswer({ block: "trend", yearA: 2024, yearB: 2025, rowsTrend: [] } as unknown as BlockData)).toBe(true);
  });

  it("widens the last conditions first, by the first row of their windows, at most three", () => {
    const stat = spec({ block: "stat", dataset: "da", filters: { cpvTerm: "asfaltare", county: "Cluj", authorityKind: "spital", yearFrom: 2025, yearTo: 2025 } });
    const relax = relaxations(stat);
    expect(relax.map((r) => r.label)).toEqual(["Toți anii", "Toată țara", "Toate instituțiile publice"]);
    expect(relax[0]!.spec.filters).toEqual({ cpvTerm: "asfaltare", county: "Cluj", authorityKind: "spital" });
    expect(relax[1]!.spec.filters).not.toHaveProperty("county");
    // A precise selection under the sentence goes first.
    const advanced = spec({ block: "table", dim: "supplier", filters: { yearFrom: 2025, yearTo: 2025 }, population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "value", op: "gte", value: "100000" }] }] } });
    expect(relaxations(advanced).map((r) => r.label)).toEqual(["Scoate „Selecție avansată”", "Toți anii"]);
    expect(relaxations(advanced)[0]!.spec).not.toHaveProperty("population");
  });

  it("«Cine conduce?» with nobody in the selection is an empty answer, widened by the sentence's phrases and the firms' size (F6c)", () => {
    expect(emptyAnswer({ block: "entity_card", card: {}, empty: true } as unknown as BlockData)).toBe(true);
    expect(emptyAnswer({ block: "entity_card", card: {} } as unknown as BlockData)).toBe(false);
    // By value: the period and the domain from the sentence's end, then the band under it, at most three.
    const value = spec({ block: "entity_card", dim: "supplier", rankBy: "value", filters: { cpvTerm: "medicamente", yearFrom: 2025, yearTo: 2025, maxEmployees: 0 } });
    expect(relaxations(value).map((r) => r.label)).toEqual(["Scoate „Angajați”", "Toți anii", "Orice domeniu"]);
    expect(relaxations(value)[0]!.spec.filters).toEqual({ cpvTerm: "medicamente", yearFrom: 2025, yearTo: 2025 });
    // On the index: the whole country, or without the band.
    const index = spec({ block: "entity_card", dim: "supplier", rankBy: "risk", filters: { seatCounty: "Cluj", maxEmployees: 0 } });
    expect(relaxations(index).map((r) => r.label)).toEqual(["Scoate „Angajați”", "Oriunde"]);
  });

  it("never widens the question itself: the entity it is about, its subject", () => {
    const network = spec({ block: "network", dim: "authority", filters: { authorityName: "MUNICIPIUL BUZAU", authorityId: 1, cpvTerm: "asfaltare" } });
    expect(relaxations(network).map((r) => r.label)).toEqual(["Orice domeniu"]);
    expect(relaxations(spec({ block: "stat", filters: {} }))).toEqual([]);
  });
});
