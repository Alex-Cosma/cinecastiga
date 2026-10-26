import type { MonthWindow } from "./spec";
import { divisionShortName } from "./cpv-divisions";
import { sumDecimalStrings } from "./evidence";

/*
 * The evolution's own options (plan §3 `timeseries.*`, §4.3; final
 * timeseries §3.7–§3.10), for the engine and the screen alike: plain
 * TypeScript, no SQL. The engine groups the selection by year or month, and
 * by channel or CPV division when it is split; here the grouped rows become
 * the series, its parts and the marker of the same months of the year before.
 */

/** One bar: a year, or a month of it (grain "month"). */
export interface SeriesPoint {
  year: number;
  value: number;
  count: number;
  /** grain "month": 1–12. */
  month?: number;
  /** A split's value and records per part (SeriesData.parts' keys); their sum is the bar. */
  parts?: Record<string, { value: number; count: number }>;
}
/** A part of a split, bottom to top: the channels, or the divisions and „Alte domenii”. */
export interface SeriesPart { key: string; label: string; code?: string; /** A division's catalogue name, for the legend's (?). */ name?: string }
/**
 * The marker of the incomplete last year (final timeseries §3.9): the year
 * before on the same months (January to `months[1]`), drawn on its bar, and the
 * last year on the same months, for the bar's card.
 */
export interface SeriesRef { year: number; months: MonthWindow; value: number; count: number; current: { value: number; count: number } }

/** At most this many months, month by month (final timeseries §3.7). */
export const MAX_SERIES_MONTHS = 36;
/** A split names at most this many divisions, each with at least this share of the value over the series (final §3.8). */
export const MAX_SERIES_DIVISIONS = 4;
export const MIN_DIVISION_SHARE = 0.05;
/** The parts a split by channel draws, procedures at the bottom (final §3.8). */
export const CHANNEL_PARTS: readonly SeriesPart[] = [{ key: "contracts", label: "Proceduri" }, { key: "da", label: "Directe" }];
/** The rest of a split by domain: the divisions not named and the records without a code. */
export const OTHER_PART: SeriesPart = { key: "other", label: "Alte domenii" };

/** The months from (yearFrom, monthFrom) to (yearTo, monthTo), both included; null without both years. */
export function seriesMonthsSpan(f: { yearFrom?: unknown; yearTo?: unknown; monthFrom?: unknown; monthTo?: unknown }): number | null {
  if (f.yearFrom === undefined || f.yearTo === undefined) return null;
  return (Number(f.yearTo) - Number(f.yearFrom)) * 12 + Number(f.monthTo ?? 12) - Number(f.monthFrom ?? 1) + 1;
}

/** The divisions a split by domain names (final §3.8): at most four, each ≥ 5% of the value, largest first. */
export function pickDivisions(values: ReadonlyMap<string | null, number>): string[] {
  const total = [...values.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  return [...values.entries()]
    .filter((entry): entry is [string, number] => entry[0] !== null && entry[1] / total >= MIN_DIVISION_SHARE)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_SERIES_DIVISIONS)
    .map(([code]) => code);
}

/** A grouped row of the engine: the bar's key ("2025" or "2025-03"), its part (null unsplit), sums and, with a marker, the same months' sums. */
export interface SeriesRow { k: string | null; part: string | null; v: string; n: string; vm?: string | null; nm?: string | null }

/**
 * The series of the grouped rows (years, or months of years), its parts and
 * the marker. Undated rows (k null) are left out, as they always were. A split
 * by domain names its divisions over the whole series; every other division
 * and the records without a code are „Alte domenii”, drawn last (on top).
 */
export function assembleSeries(rows: readonly SeriesRow[], o: { grain: "year" | "month"; split: "channel" | "domain" | null; ref?: { year: number; to: number } | null }):
  { series: SeriesPoint[]; parts?: SeriesPart[]; ref?: SeriesRef } {
  const keyOk = o.grain === "month" ? /^\d{4}-\d{2}$/ : /^\d{4}$/;
  const dated = rows.filter((r) => r.k !== null && keyOk.test(r.k));
  let parts: SeriesPart[] | undefined;
  let partOf = (part: string | null): string | null => part;
  if (o.split === "channel") parts = CHANNEL_PARTS.filter((p) => dated.some((r) => r.part === p.key));
  if (o.split === "domain") {
    const byDivision = new Map<string | null, number>();
    for (const r of dated) byDivision.set(r.part, (byDivision.get(r.part) ?? 0) + Number(r.v));
    const named = pickDivisions(byDivision);
    // Largest at the bottom, „Alte domenii” on top in neutral grey (final §3.8).
    parts = [...named.map((code) => ({ key: code, code, label: divisionShortName(code) })), ...(dated.some((r) => !named.includes(r.part ?? "")) ? [OTHER_PART] : [])];
    partOf = (part) => part !== null && named.includes(part) ? part : OTHER_PART.key;
  }
  // The sums are added as the database's exact decimals (a bar of several parts is their exact sum, as one row would be).
  const exact = (values: readonly string[]) => values.length === 1 ? Number(values[0]) : Number(sumDecimalStrings(values));
  const points = new Map<string, { v: string[]; n: number; parts: Map<string, { v: string[]; n: number }> }>();
  for (const r of dated) {
    const at: { v: string[]; n: number; parts: Map<string, { v: string[]; n: number }> } = points.get(r.k!) ?? { v: [], n: 0, parts: new Map() };
    at.v.push(r.v);
    at.n += Number(r.n);
    if (parts) {
      const part = partOf(r.part) ?? OTHER_PART.key, p = at.parts.get(part) ?? { v: [], n: 0 };
      p.v.push(r.v);
      p.n += Number(r.n);
      at.parts.set(part, p);
    }
    points.set(r.k!, at);
  }
  const series = [...points.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, at]): SeriesPoint => ({
    year: Number(key.slice(0, 4)), value: exact(at.v), count: at.n,
    ...(o.grain === "month" ? { month: Number(key.slice(5, 7)) } : {}),
    ...(parts ? { parts: Object.fromEntries([...at.parts.entries()].map(([part, p]) => [part, { value: exact(p.v), count: p.n }])) } : {}),
  }));
  let ref: SeriesRef | undefined;
  if (o.ref) {
    const sum = (year: number) => {
      const of = dated.filter((r) => r.k === String(year));
      return { value: of.length ? exact(of.map((r) => String(r.vm ?? 0))) : 0, count: of.reduce((t, r) => t + Number(r.nm ?? 0), 0) };
    };
    const before = sum(o.ref.year - 1), current = sum(o.ref.year);
    if (before.count > 0) ref = { year: o.ref.year - 1, months: [1, o.ref.to], ...before, current };
  }
  return { series, ...(parts ? { parts } : {}), ...(ref ? { ref } : {}) };
}
