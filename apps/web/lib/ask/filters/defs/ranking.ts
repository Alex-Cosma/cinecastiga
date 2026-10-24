import type { FilterDef } from "../types";
import { alwaysScope, edited, readAhead } from "./shared";

/*
 * What a row is, how the list is ordered and how long it is (plan §2.2
 * ranking.ts). None of them changes the total of the selection; per-capita
 * changes which institutions can be ranked (the RPL 2021 town halls and
 * county councils) and stays a display choice of the ranking.
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
  // COUNT_MEASURE_BLOCKS; elsewhere the answer is in lei whatever the spec says.
  engine: { table: "display", stat: "display", timeseries: "display", map: "display" },
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

export const purchaseValue = readAhead<{ purchaseValueMin?: number; purchaseValueMax?: number }>({
  id: "purchaseValue", keys: ["filters.purchaseValueMin", "filters.purchaseValueMax"], placement: "under", control: "rangePills",
  label: "Mărimea achiziției", windowTitle: "Cât de mare e fiecare achiziție?", scope: "selection",
  sample: { block: "stat", value: { purchaseValueMin: 1_000_000 } },
});

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
