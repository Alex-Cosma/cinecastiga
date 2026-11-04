import type { ColumnDef, DatesValue, FilterState, FilterValue, ListValue, RangeValue, TableColumns } from "./types";

/*
 * A table's filters in the address and back. Each column owns one parameter:
 *   dates    an=2020,2021   or   an=2020-01..2021-12   (an open end: an=2020-03.. or an=..2021-12)
 *   options  tip=directe,contracte
 *   pick     furnizor=123,456
 *   range    valoare=10000..100000   (valoare=50000.. or valoare=..5000)
 * Anything malformed is dropped, never guessed; the default (no filter) writes nothing. Pure.
 */

const YEAR = /^\d{4}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const NUMBER = /^\d+(\.\d+)?$/;

const sorted = (values: Iterable<string>): string[] => [...new Set(values)].sort();

/** Whether a value filters anything. */
export function isActive(value: FilterValue | undefined): value is FilterValue {
  if (!value) return false;
  if (value.kind === "dates") return value.years.length > 0 || value.from !== null || value.to !== null;
  if (value.kind === "range") return value.min !== null || value.max !== null;
  return value.values.length > 0;
}

/** The empty value of a column: what „Șterge filtrul” leaves. */
export function emptyValue(column: Pick<ColumnDef, "kind">): FilterValue {
  if (column.kind === "dates") return { kind: "dates", years: [], from: null, to: null };
  if (column.kind === "range") return { kind: "range", min: null, max: null };
  return { kind: column.kind, values: [] };
}

/** The state with one column set; an empty value removes the column. */
export function withValue(state: FilterState, key: string, value: FilterValue | null): FilterState {
  const next = { ...state };
  if (value && isActive(value)) next[key] = value;
  else delete next[key];
  return next;
}

/** The active filters only: what the server and the band see. */
export function activeOnly(state: FilterState): FilterState {
  return Object.fromEntries(Object.entries(state).filter(([, value]) => isActive(value)));
}

function readDates(raw: string): DatesValue | null {
  if (raw.includes("..")) {
    const [from = "", to = ""] = raw.split("..");
    const value: DatesValue = { kind: "dates", years: [], from: MONTH.test(from) ? from : null, to: MONTH.test(to) ? to : null };
    if (value.from && value.to && value.from > value.to) return null;
    return isActive(value) ? value : null;
  }
  const years = sorted(raw.split(",").filter((y) => YEAR.test(y)));
  return years.length > 0 ? { kind: "dates", years, from: null, to: null } : null;
}

function readList(column: ColumnDef, raw: string): ListValue | null {
  const pattern = column.valuePattern ?? /^[\w.-]{1,40}$/;
  const values = sorted(raw.split(",").filter((v) => pattern.test(v)));
  return values.length > 0 ? { kind: column.kind as ListValue["kind"], values } : null;
}

function readRange(raw: string): RangeValue | null {
  if (!raw.includes("..")) return null;
  const [lo = "", hi = ""] = raw.split("..");
  const min = NUMBER.test(lo) ? Number(lo) : null;
  const max = NUMBER.test(hi) ? Number(hi) : null;
  if (min !== null && max !== null && min > max) return null;
  return min !== null || max !== null ? { kind: "range", min, max } : null;
}

/** One column's value from its raw parameter. */
export function readValue(column: ColumnDef, raw: string): FilterValue | null {
  if (column.kind === "dates") return readDates(raw);
  if (column.kind === "range") return readRange(raw);
  return readList(column, raw);
}

/** The text of one column's value in the address. */
export function writeValue(value: FilterValue): string {
  if (value.kind === "dates") return value.years.length > 0 ? value.years.join(",") : `${value.from ?? ""}..${value.to ?? ""}`;
  if (value.kind === "range") return `${value.min ?? ""}..${value.max ?? ""}`;
  return value.values.join(",");
}

/** A table's filters from an address (`get` reads one parameter); unknown or malformed values are left out. */
export function readFilters(columns: TableColumns, get: (key: string) => string | null | undefined): FilterState {
  const read = (key: string) => get(key) ?? null;
  const state: Record<string, FilterValue> = {};
  for (const column of columns) {
    const raw = read(column.param);
    const value = raw !== null ? readValue(column, raw) : column.legacy?.read(read) ?? null;
    if (value && isActive(value)) state[column.key] = value;
  }
  return state;
}

/** The address with the table's parameters replaced; the page's other parameters stay, in their order. */
export function writeFilters(columns: TableColumns, current: string, state: FilterState): string {
  const params = new URLSearchParams(current);
  for (const column of columns) {
    params.delete(column.param);
    for (const legacy of column.legacy?.params ?? []) params.delete(legacy);
    const value = state[column.key];
    if (isActive(value)) params.set(column.param, writeValue(value));
  }
  const query = params.toString();
  return query ? `?${query.replaceAll("%2C", ",")}` : "";
}

/** The parameters of a request for the given filters (an API call), without the page's others. */
export function filterParams(columns: TableColumns, state: FilterState, into = new URLSearchParams()): URLSearchParams {
  for (const column of columns) {
    const value = state[column.key];
    if (isActive(value)) into.set(column.param, writeValue(value));
  }
  return into;
}
