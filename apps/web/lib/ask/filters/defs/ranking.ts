import { VALUE_RANGES, type ValueRange } from "../../purchase";
import { SELECTION_RULES } from "../../spec";
import { TRANSACTION_FORMS } from "../context";
import type { FilterDef } from "../types";
import { alwaysScope, edited, levels, readAhead, setFilters } from "./shared";

/*
 * What a row is, how the list is ordered and how long it is (plan §2.2
 * ranking.ts). None of them changes the total of the selection; per-capita
 * changes which institutions can be ranked (the RPL 2021 town halls and
 * county councils) and stays a display choice of the ranking. The plan keeps
 * the size of the purchase here too (F3), a selection: it changes the total.
 */

type DimValue = "authority" | "supplier" | "county";
type MeasureValue = "value" | "count" | "value_per_capita";

export const dim: FilterDef<DimValue> = {
  id: "dim", keys: ["dim"], placement: "presentation", control: "list",
  label: "Ce reprezintă un rând",
  windowTitle: "Pe cine vrei să vezi?", windowNote: "Alege ce reprezintă fiecare rând din rezultat.",
  // On a distribution or a comparison the focal picker sets it to the entity's role.
  engine: { table: "block", trend: "block", scatter: "block", "entity_card:value": "block", "entity_card:risk": "block" },
  scope: alwaysScope("display"),
  read: (spec) => spec.dim as DimValue | undefined,
  write: (spec, value) => edited(spec, (next) => { if (value) next.dim = value; else delete next.dim; }),
  choices: (spec) => ["supplier", "authority", ...(["scatter", "entity_card"].includes(spec.block) ? [] : ["county" as const])],
};

export const measure: FilterDef<MeasureValue> = {
  id: "measure", keys: ["measure"], placement: "presentation", control: "list",
  label: "Măsura", windowTitle: "Cum comparăm?",
  // COUNT_MEASURE_BLOCKS; elsewhere the answer is in lei whatever the spec says. The breakdown's order (F3).
  engine: { table: "display", stat: "display", timeseries: "display", map: "display", breakdown: "display" },
  scope: alwaysScope("display"),
  read: (spec) => spec.measure as MeasureValue,
  write: (spec, value) => edited(spec, (next) => { next.measure = value ?? "value"; }),
  choices: (spec) => ["value", "count", ...(spec.block === "table" && spec.dim === "authority" ? ["value_per_capita" as const] : [])],
};

export const topN: FilterDef<number> = {
  id: "topN", keys: ["topN"], placement: "presentation", control: "list",
  label: "Lungimea clasamentului",
  windowTitle: "Cât de lung să fie clasamentul?", windowNote: "Lista de surse păstrează întreaga bază a întrebării, indiferent câte rânduri afișăm.",
  // Without topN a table is the complete ranking, in pages; a trend shows ten.
  engine: { table: "display", trend: "display" }, scope: alwaysScope("display"),
  read: (spec) => spec.topN,
  write: (spec, value) => edited(spec, (next) => { if (value === undefined) delete next.topN; else next.topN = value; }),
  // "Primele 5 · 10 · 25 · 50", "Toate rezultatele" on a table, or a number from 1 to 50.
  choices: (spec) => [5, 10, 25, 50, ...(spec.block === "table" ? [undefined] : []), 1, 37],
};

/**
 * F3, the size of the whole purchase (plan §4.1, kit §4 "Mărimea achiziției"):
 * the ranges "Sub 10.000 lei · 10.000–100.000 · 100.000–1 mil. · Peste 1 mil.
 * lei" or two bounds typed in, [min, max). A selection: the chip "Doar cele de
 * peste 1 mil. lei" under the sentence and the total line say it. Every answer
 * over the records applies it (purchaseValueConds); the sums stay on shares.
 */
export const purchaseValue: FilterDef<ValueRange> = {
  id: "purchaseValue", keys: ["filters.purchaseValueMin", "filters.purchaseValueMax"], placement: "under", control: "rangePills",
  label: "Mărimea achiziției", windowTitle: "Cât de mare e fiecare achiziție?",
  engine: levels(TRANSACTION_FORMS, "row"), scope: alwaysScope("selection"), since: "F3",
  read: (spec) => {
    const value: ValueRange = {};
    if (spec.filters.purchaseValueMin !== undefined) value.purchaseValueMin = Number(spec.filters.purchaseValueMin);
    if (spec.filters.purchaseValueMax !== undefined) value.purchaseValueMax = Number(spec.filters.purchaseValueMax);
    return Object.keys(value).length ? value : undefined;
  },
  write: (spec, value) => setFilters(spec, { purchaseValueMin: value?.purchaseValueMin, purchaseValueMax: value?.purchaseValueMax }),
  // The kit's ranges, and two bounds typed in ("Între … și … lei").
  choices: () => [...VALUE_RANGES.map(({ label: _label, ...range }) => range), { purchaseValueMin: 50_000, purchaseValueMax: 250_000 }],
  validate: SELECTION_RULES.purchaseValue,
};

export const mainClient = readAhead<true>({
  id: "mainClient", keys: ["filters.mainClient"], placement: "row", control: "toggle",
  label: "Clientul lor principal", scope: "group",
  sample: { block: "table", value: true, base: { dim: "supplier", filters: { authorityId: 1 } } },
});

export const dominantSupplier = readAhead<true>({
  id: "dominantSupplier", keys: ["filters.dominantSupplier"], placement: "row", control: "toggle",
  label: "O firmă ia peste jumătate", scope: "group",
  sample: { block: "table", value: true, base: { dim: "authority" } },
});

export const RANKING_DEFS: readonly FilterDef[] = [dim, measure, topN, purchaseValue, mainClient, dominantSupplier];
