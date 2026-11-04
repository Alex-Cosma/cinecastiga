import type { FilterValue } from "./types";

/* The funnels' own arithmetic: what a date choice means and how a typed amount reads. Pure. */

/** The years chosen, and the one year an interval of months lies in (null when it spans years). */
export function datesChoice(value: FilterValue | undefined): { years: string[]; from: string | null; to: string | null } {
  if (value?.kind !== "dates") return { years: [], from: null, to: null };
  if (value.years.length > 0) return { years: value.years, from: null, to: null };
  const year = value.from?.slice(0, 4) ?? value.to?.slice(0, 4) ?? null;
  const sameYear = year !== null && (!value.from || value.from.startsWith(year)) && (!value.to || value.to.startsWith(year));
  return sameYear ? { years: [year], from: value.from, to: value.to } : { years: [], from: value.from, to: value.to };
}

/**
 * The months of one year, as a value: the whole year is the year itself; a start alone runs to December, an end
 * alone from January, so the interval never leaves the year.
 */
export function monthsValue(year: string, from: string | null, to: string | null): FilterValue {
  const start = from ?? `${year}-01`;
  const end = to ?? `${year}-12`;
  if (start === `${year}-01` && end === `${year}-12`) return { kind: "dates", years: [year], from: null, to: null };
  return { kind: "dates", years: [], from: start, to: end < start ? start : end };
}

/** Text typed as „10.000” or „10 000,50” to a number; null when empty or not a number. */
export function parseAmount(text: string): number | null {
  const clean = text.replace(/[\s.]/g, "").replace(",", ".");
  if (clean === "") return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

