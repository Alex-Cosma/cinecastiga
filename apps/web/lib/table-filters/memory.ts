import { isActive } from "./codec";
import type { Facet, FilterState, FilterValue, OptionCount, TableColumns } from "./types";

/*
 * The column filters over rows already in memory (the admin's accounts, its request journal and its proxies): the
 * same declarations, values and facets as the SQL side (server/query.ts), read through one function per column
 * instead of a binding. Pure, for the browser and the server alike.
 */

/** A column's value(s) in one row: a 'YYYY-MM-DD…' date, a number, a code, or several codes. */
export type Read<R> = (row: R) => string | number | null | undefined | readonly (string | null | undefined)[];
export type Readers<R> = Readonly<Record<string, Read<R>>>;

const fold = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const list = (v: ReturnType<Read<unknown>>): string[] =>
  (Array.isArray(v) ? v : [v]).filter((x): x is string | number => x !== null && x !== undefined && x !== "").map(String);

/** A number read from a row; null for a missing or non-numeric value (never 0). */
const numberOf = (raw: ReturnType<Read<unknown>>): number | null => {
  if (raw === null || raw === undefined || raw === "" || Array.isArray(raw)) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
};

/** Whether one row meets one active filter. */
function meets(read: Read<unknown>, value: FilterValue, row: unknown): boolean {
  const raw = read(row);
  if (value.kind === "dates") {
    const date = typeof raw === "string" ? raw : null;
    if (!date) return false;
    if (value.years.length > 0) return value.years.includes(date.slice(0, 4));
    const month = date.slice(0, 7);
    return (!value.from || month >= value.from) && (!value.to || month <= value.to);
  }
  if (value.kind === "range") {
    const n = numberOf(raw);
    if (n === null) return false;
    return (value.min === null || n >= value.min) && (value.max === null || n <= value.max);
  }
  return list(raw).some((v) => value.values.includes(v));
}

/** The rows the filters keep, leaving out the column `except` (whose funnel is being counted). */
export function filterRows<R>(readers: Readers<R>, rows: readonly R[], state: FilterState, except?: string): R[] {
  const active = Object.entries(state).filter(([key, value]) => key !== except && isActive(value) && readers[key]);
  return active.length === 0 ? [...rows] : rows.filter((row) => active.every(([key, value]) => meets(readers[key] as Read<unknown>, value, row)));
}

const BINS = 8;

/** A column's options under the other filters, the chosen first, then by rows (as facetOf on the server). */
export function memoryFacet<R>(
  columns: TableColumns, readers: Readers<R>, rows: readonly R[], key: string, state: FilterState,
  { term = "", limit = 50, labelOf }: { term?: string; limit?: number; labelOf?: (value: string) => string | undefined } = {},
): Facet {
  const column = columns.find((c) => c.key === key);
  const read = readers[key];
  if (!column || !read) throw new Error(`unknown filter column: ${key}`);
  const kept = filterRows(readers, rows, state, key);

  if (column.kind === "dates") {
    const months = new Map<string, number>();
    let undated = 0;
    for (const row of kept) {
      const v = read(row);
      const month = typeof v === "string" && /^\d{4}-\d{2}/.test(v) ? v.slice(0, 7) : null;
      if (month) months.set(month, (months.get(month) ?? 0) + 1);
      else undated++;
    }
    return { kind: "dates", months: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, n]) => ({ month, n })), undated };
  }

  if (column.kind === "range") {
    const values = kept.map((row) => numberOf(read(row))).filter((n): n is number => n !== null);
    if (values.length === 0) return { kind: "range", min: null, max: null, bins: [] };
    const lo = Math.min(...values), hi = Math.max(...values);
    const llo = Math.log10(Math.max(lo, 1)), step = (Math.log10(Math.max(hi, 1)) - llo) / BINS;
    if (step <= 0) return { kind: "range", min: lo, max: hi, bins: [{ from: lo, to: hi, n: values.length }] };
    const bins = Array.from({ length: BINS }, (_, i) => ({ from: 10 ** (llo + i * step), to: 10 ** (llo + (i + 1) * step), n: 0 }));
    for (const v of values) bins[Math.min(BINS - 1, Math.floor((Math.log10(Math.max(v, 1)) - llo) / step))]!.n++;
    return { kind: "range", min: lo, max: hi, bins };
  }

  const chosen = state[key];
  const selected = chosen && (chosen.kind === "options" || chosen.kind === "pick") ? chosen.values : [];
  const counts = new Map<string, number>();
  for (const row of kept) for (const v of new Set(list(read(row)))) counts.set(v, (counts.get(v) ?? 0) + 1);
  for (const v of selected) if (!counts.has(v)) counts.set(v, 0);
  const label = (v: string) => column.labels?.[v] ?? labelOf?.(v) ?? v;
  const wanted = fold(term.trim());
  const options: OptionCount[] = [...counts]
    .map(([value, n]) => ({ value, label: label(value), n }))
    .filter((o) => !wanted || fold(o.label).includes(wanted) || fold(o.value).includes(wanted))
    .sort((a, b) => Number(selected.includes(b.value)) - Number(selected.includes(a.value)) || (b.n ?? 0) - (a.n ?? 0) || a.label.localeCompare(b.label, "ro"));
  return { kind: column.kind, options: options.slice(0, limit), more: options.length > limit };
}
