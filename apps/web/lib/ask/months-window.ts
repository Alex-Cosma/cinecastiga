import type { Dataset, MonthWindow, TrendOptions } from "./spec";

/*
 * The years and months a trend compares (plan §2.6, §2.8; trend final §3.2,
 * §3.3), in one place for the answer and its sources (runSpec, runRows), the
 * builder and the interpreter: the default years of a new trend, and the
 * window of `months: "auto"`. Both read the periods of the archive per
 * channel from one source (coveragePeriods in compile.ts, which
 * /api/data-coverage exposes). Plain TypeScript for client and server.
 */

/** First and last dated record of a channel (marts.data_coverage, Bucharest calendar days),
 * and the last day considered complete (audit F10; null or absent when not established). */
export interface ChannelPeriod { from: string | null; to: string | null; completeUntil?: string | null }
/** Both channels, read at a data checkpoint (the last ready app.monitoring_refreshes; null without one). */
export type CoveragePeriods = Record<"da" | "contracts", ChannelPeriod> & { checkpoint?: string | null };

/** The trend's year picker starts here: 2018 is incomplete in the archive (direct acquisitions from 2 April). */
export const MIN_TREND_YEAR = 2019;

/** How a window was chosen: whole years (no key, or the chip removed), `auto` resolved, or months a reader chose. */
export type MonthsMode = "whole" | "auto" | "chosen";
export interface MonthsWindow { from: number; to: number; mode: MonthsMode }
export const WHOLE_YEAR: MonthsWindow = { from: 1, to: 12, mode: "whole" };
export const isWholeYear = (window: Pick<MonthsWindow, "from" | "to">): boolean => window.from === 1 && window.to === 12;
/** The months both years count, or null for whole years (the engine's PredicateCtx.trendMonths). */
export const partialMonths = (window: MonthsWindow | null): MonthWindow | null =>
  window && !isWholeYear(window) ? [window.from, window.to] : null;

const MONTHS = ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sept.", "oct.", "nov.", "dec."] as const;
/** "ian.–mai", "mai" (kit §4: „Aceleași luni: ian.–mai”). */
export function monthsLabel(window: Pick<MonthsWindow, "from" | "to">): string {
  const from = MONTHS[window.from - 1]!, to = MONTHS[window.to - 1]!;
  return window.from === window.to ? from : `${from}–${to}`;
}

const channelsOf = (dataset: Dataset): ("da" | "contracts")[] => dataset === "all" ? ["da", "contracts"] : [dataset];
const yearEnd = (year: number) => `${year}-12-31`;
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * The last day of `year` a channel is known complete for: its "complet până
 * la" day (audit F10); without one, the end of the year when the archive goes
 * past it (a year the collection has closed); otherwise unknown.
 */
function completeThrough(period: ChannelPeriod, year: number): string | null {
  const until = period.completeUntil?.slice(0, 10);
  if (until) return until;
  const to = period.to?.slice(0, 10);
  return to && to > yearEnd(year) ? yearEnd(year) : null;
}

/**
 * The years of a new trend (trend final §3.2): B is the latest year that every
 * channel of the source has complete (its "complet până la" day on or after
 * 31 December B; without that day, an archive that goes past B), A = B − 1,
 * never before MIN_TREND_YEAR. Null when the periods cannot be read. The
 * engine never applies it: a spec without years keeps today's answer (the
 * first and last year of the archive); the builder and the interpreter write it.
 */
export function defaultTrendYears(periods: CoveragePeriods | null, dataset: Dataset): { yearFrom: number; yearTo: number } | null {
  if (!periods) return null;
  const channels = channelsOf(dataset).map((channel) => periods[channel]);
  const last = Math.max(...channels.map((p) => Number(p.to?.slice(0, 4) ?? 0)));
  for (let b = last; b > MIN_TREND_YEAR; b--)
    if (channels.every((p) => (completeThrough(p, b) ?? "") >= yearEnd(b))) return { yearFrom: b - 1, yearTo: b };
  return null;
}

/**
 * The two years of a trend opened from another question's period (trend
 * final §3.2): a range keeps its ends, one year Y compares Y − 1 with Y, and
 * neither starts before MIN_TREND_YEAR unless the range itself does (an old
 * link with 2018 keeps it). No year: the default years, when known.
 */
export function trendYearsFrom(
  period: { yearFrom?: number | undefined; yearTo?: number | undefined },
  defaults: { yearFrom: number; yearTo: number } | null,
): { yearFrom: number; yearTo: number } | null {
  const { yearFrom: from, yearTo: to } = period;
  if (from !== undefined && to !== undefined && from < to) return { yearFrom: from, yearTo: to };
  const year = to ?? from;
  if (year === undefined) return defaults;
  const b = Math.max(year, MIN_TREND_YEAR + 1);
  return { yearFrom: b - 1, yearTo: b };
}

/** `auto` cannot say which months are complete in `year`: the run asks for chosen months instead of comparing a part of a year with a whole one. */
export const autoMonthsUnresolved = (year: number) =>
  `Lunile complete din ${year} nu sunt confirmate în date. Alege lunile comparate sau ani încheiați.`;
export const noCompleteMonth = (year: number) =>
  `${year} nu are încă nicio lună completă în date. Alege ani încheiați.`;

/**
 * The months both years of a trend count (trend final §3.3). No key or
 * "whole": whole years. Chosen months: those. `auto` (new questions): whole
 * years while the later year `yearTo` is complete on every channel of the
 * source; otherwise January to the last whole month before the earliest
 * "complet până la" day. It is resolved again at every run, so a link, a saved
 * question or a watch keeps `auto` and follows the data; the answer returns
 * the window it executed (`executed`), which its sources send back.
 */
export function sameMonthsWindow(
  periods: CoveragePeriods | null,
  dataset: Dataset,
  yearTo: number,
  months: TrendOptions["months"],
): MonthsWindow | { error: string } {
  if (months === undefined || months === "whole") return WHOLE_YEAR;
  if (Array.isArray(months)) return { from: months[0], to: months[1], mode: "chosen" };
  if (!periods) return { error: autoMonthsUnresolved(yearTo) };
  const through = channelsOf(dataset).map((channel) => completeThrough(periods[channel], yearTo));
  if (through.some((day) => day === null)) return { error: autoMonthsUnresolved(yearTo) };
  const end = (through as string[]).sort()[0]!;
  if (end >= yearEnd(yearTo)) return { from: 1, to: 12, mode: "auto" };
  if (Number(end.slice(0, 4)) < yearTo) return { error: noCompleteMonth(yearTo) };
  const month = Number(end.slice(5, 7));
  const to = Number(end.slice(8, 10)) === lastDay(yearTo, month) ? month : month - 1;
  return to < 1 ? { error: noCompleteMonth(yearTo) } : { from: 1, to, mode: "auto" };
}
