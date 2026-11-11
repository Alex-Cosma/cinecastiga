import type { TableColumns } from "./table-filters/types";

/*
 * The filterable columns of a product's buyers on /preturi/[produs] (owner, 11 November 2026: sort and filter the
 * columns as the app's other tables do). The SQL lives in unit-prices.ts (priceBuyerSource).
 */
export const PRICE_BUYER_COLUMNS: TableColumns = [
  { key: "institutie", kind: "pick", label: "Instituția", chip: "instituția", param: "institutia", valuePattern: /^\d{1,16}$/, counts: false },
  // Shown with every year (owner, 11 November 2026: all years by default); each row is an institution in one year.
  { key: "an", kind: "options", label: "An", chip: "anul", param: "anii", valuePattern: /^20\d\d$/, order: "newest" },
  { key: "judet", kind: "options", label: "Județ", chip: "județul", param: "judet", valuePattern: /^[\p{L} .'-]{2,40}$/u },
  { key: "pret", kind: "range", label: "Preț pe unitate", chip: "preț", param: "pret", unit: "lei" },
  { key: "multiplu", kind: "range", label: "Multiplul medianei", chip: "multiplul", param: "multiplu", unit: "×" },
  { key: "cantitate", kind: "range", label: "Cantitate", chip: "cantitatea", param: "cantitate" },
  { key: "peste", kind: "range", label: "Peste mediană", chip: "peste mediană", param: "peste", unit: "lei" },
  { key: "furnizor", kind: "pick", label: "Furnizori", chip: "furnizor", param: "furnizor", valuePattern: /^\d{1,16}$/ },
];

/** How the buyers can be ordered: the header's sort buttons, by the address (`ordine`, `sens`). */
export type PriceBuyerSort = "lei" | "multiplu" | "pret" | "cantitate" | "institutie" | "an";
export const PRICE_BUYER_SORTS: readonly PriceBuyerSort[] = ["lei", "multiplu", "pret", "cantitate", "institutie", "an"];
