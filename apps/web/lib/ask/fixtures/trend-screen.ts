import type { TrendRow } from "../compile";
import type { AskSpec } from "../spec";
import type { TrendRowFacts } from "../trend-shared";
import type { TrendData } from "../../../app/intreaba/trend-answer";

/*
 * A small trend answer (trend-2) for the screen's tests: every list with its
 * rows, the composition and the facts of the shown rows, of five firms and
 * one equal. Not data: the names and sums are made up.
 */

const row = (entityId: string, name: string, valueA: number, valueB: number, county: string | null = "București"): TrendRow => ({ entityId, name, county, valueA, valueB });
const facts = (o: Partial<TrendRowFacts>): TrendRowFacts =>
  ({ year: 2025, value: 0, largest: null, joint: 0, partner: null, firstActivity: "2019-04-02", lastActivity: "2025-11-20", cuiValid: true, country: null, ...o });

export const UP = row("1", "ALFA CONSTRUCT SRL", 100, 1500);
export const NEW = row("2", "BETA SERV SRL", 0, 900);
export const FOREIGN = row("5", "GAMMA GMBH", 0, 300, null);
export const DOWN = row("3", "DELTA SA", 800, 200);
export const GONE = row("4", "EPSILON SRL", 50, 0);

export const trendSpec = (trend?: AskSpec["trend"], o: Partial<AskSpec> = {}): AskSpec =>
  ({ block: "trend", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: 2024, yearTo: 2025 }, ...(trend ? { trend } : {}), ...o });

export function trendFixture(o: Partial<TrendData> = {}): TrendData {
  return {
    block: "trend", yearA: 2024, yearB: 2025, change: "up", list: "up", noun: "firme",
    months: { from: 1, to: 12, mode: "auto" },
    rowsTrend: [UP],
    groups: { all: [UP, NEW, DOWN, FOREIGN, GONE], up: [UP], new: [NEW, FOREIGN], first: [NEW], down: [DOWN], gone: [GONE] },
    composition: {
      all: { count: 6, valueA: 1050, valueB: 3000 }, up: { count: 1, valueA: 100, valueB: 1500 }, new: { count: 2, valueA: 0, valueB: 1200 },
      first: { count: 1, valueA: 0, valueB: 900 }, down: { count: 1, valueA: 800, valueB: 200 }, gone: { count: 1, valueA: 50, valueB: 0 },
      equal: { count: 1, valueA: 100, valueB: 100 },
    },
    rowFacts: {
      "1": facts({ value: 1500, largest: { value: 1200, src: "contracts" }, partner: { entityId: "9", name: "PRIMARIA EXEMPLU", value: 600 } }),
      "2": facts({ value: 900, largest: { value: 900, src: "da" }, partner: { entityId: "9", name: "PRIMARIA EXEMPLU", value: 900 }, firstActivity: "2025-03-01", cuiValid: false }),
      "5": facts({ value: 300, firstActivity: "2019-02-01", cuiValid: false, country: "DE" }),
      "3": facts({ year: 2024, value: 800, joint: 500, partner: { entityId: "8", name: "SPITALUL EXEMPLU", value: 400 } }),
      "4": facts({ year: 2024, value: 50, lastActivity: "2026-02-02" }),
    },
    ...o,
  };
}
