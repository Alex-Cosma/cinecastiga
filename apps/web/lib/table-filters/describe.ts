import { formatInt } from "../format";
import { emptyValue, isActive, withValue } from "./codec";
import type { ColumnDef, FilterState, FilterValue, TableColumns } from "./types";

/*
 * The words of the applied filters: one chip per chosen option (each removable on its own), one per date or value
 * interval. `labels` holds the names the server sent with the counts (a partner's name for its id); a value without
 * one shows as stored. Pure.
 */

const MONTHS = ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sep.", "oct.", "nov.", "dec."];

/** „ian. 2021” for 2021-01. */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${year}`;
}

/** „anul 2021”, „anii 2019, 2021”, „din mar. 2020 până în dec. 2021”, „din mar. 2020”, „până în dec. 2021”. */
export function datesText(value: Extract<FilterValue, { kind: "dates" }>): string {
  if (value.years.length > 0) return `${value.years.length === 1 ? "anul" : "anii"} ${value.years.join(", ")}`;
  if (value.from && value.to) return `din ${monthLabel(value.from)} până în ${monthLabel(value.to)}`;
  return value.from ? `din ${monthLabel(value.from)}` : `până în ${monthLabel(value.to ?? "")}`;
}

/** „10.000–100.000 lei”, „peste 50.000 lei”, „sub 5.000 lei”. */
export function rangeText(value: Extract<FilterValue, { kind: "range" }>, unit = ""): string {
  const tail = unit ? ` ${unit}` : "";
  if (value.min !== null && value.max !== null) return `${formatInt(value.min)}–${formatInt(value.max)}${tail}`;
  return value.min !== null ? `peste ${formatInt(value.min)}${tail}` : `sub ${formatInt(value.max)}${tail}`;
}

export type Labels = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface Chip {
  /** Stable across renders: the column and, for a list, the value. */
  id: string;
  column: ColumnDef;
  /** The lead word („furnizor”), possibly empty, then the value in bold. */
  lead: string;
  value: string;
  /** The filters once this chip is removed. */
  without: FilterState;
}

const labelOf = (column: ColumnDef, labels: Labels, value: string): string =>
  column.labels?.[value] ?? labels[column.key]?.[value] ?? value;

/** The chips of the applied filters, in the columns' order. */
export function chipsOf(columns: TableColumns, state: FilterState, labels: Labels = {}): Chip[] {
  const chips: Chip[] = [];
  for (const column of columns) {
    const value = state[column.key];
    if (!isActive(value)) continue;
    if (value.kind === "dates") {
      chips.push({ id: column.key, column, lead: "", value: datesText(value), without: withValue(state, column.key, null) });
    } else if (value.kind === "range") {
      chips.push({ id: column.key, column, lead: column.chip, value: rangeText(value, column.unit), without: withValue(state, column.key, null) });
    } else {
      for (const v of value.values) {
        const rest = value.values.filter((x) => x !== v);
        chips.push({
          id: `${column.key}:${v}`, column, lead: column.chip, value: labelOf(column, labels, v),
          without: withValue(state, column.key, rest.length > 0 ? { ...value, values: rest } : emptyValue(column)),
        });
      }
    }
  }
  return chips;
}
