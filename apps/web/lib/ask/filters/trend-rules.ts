import { autoMonthsUnresolved, defaultTrendYears, MIN_TREND_YEAR, monthsLabel, sameMonthsWindow, trendYearsFrom, type CoveragePeriods, type MonthsWindow } from "../months-window";
import type { Dataset, MonthWindow, TrendOptions } from "../spec";
import { FILTERS } from "./defs";
import { describeConditions } from "./describe";
import { pathValues, type ParkedItem } from "./parked";
import type { FilterCtx, FilterId, FilterSpec } from "./types";

/*
 * The trend in the builder (plan §4.7, trend final §3.2, §3.3, §4.2, §4.3):
 * what a new trend writes when the reader enters it, what its options become
 * when the reader leaves it (set aside, never a silent drop), what follows a
 * choice made on it, and the state of "Aceleași luni" under its sentence.
 * The archive's periods are the engine's own (coveragePeriods through
 * /api/data-coverage), so the months the builder shows are the ones the answer
 * will count (sameMonthsWindow, the same function at the same checkpoint).
 * Plain TypeScript for client and server.
 */

/** The trend's own options, in the order of its words (describe.ts TREND_ORDER). */
export const TREND_FILTERS: readonly FilterId[] = ["trendChange", "trendFirstOnly", "trendMonths", "trendOrder", "trendMinBase"];

/** A new trend (trend final §4.2): the growths, on the same months when a compared year is incomplete. */
export const NEW_TREND: Readonly<Required<Pick<TrendOptions, "change" | "months">>> = { change: "up", months: "auto" };

const num = (value: unknown): number | undefined => value === undefined || value === null || value === "" ? undefined : Number(value);
const datasetOf = (spec: FilterSpec): Dataset => (spec.dataset ?? "all") as Dataset;

/**
 * The years and months a trend entered from `from` compares (trend final
 * §3.2): another question's single year Y is Y − 1 against Y, its range its
 * ends, its months of one year the same months of both; without a period, the
 * default years (the latest year every channel has complete, and the one
 * before). The picker starts in 2019: a period from 2018 starts a year later.
 * Each reinterpretation has its note; the defaults need none.
 */
function enteredYears(from: FilterSpec, periods: CoveragePeriods | null | undefined): { years: { yearFrom: number; yearTo: number } | null; months?: MonthWindow; notes: string[] } {
  const f = from.filters;
  const yearFrom = num(f.yearFrom), yearTo = num(f.yearTo), monthFrom = num(f.monthFrom), monthTo = num(f.monthTo);
  const defaults = defaultTrendYears(periods ?? null, datasetOf(from));
  const years = trendYearsFrom({ yearFrom, yearTo }, defaults);
  if (!years || yearFrom === undefined && yearTo === undefined) return { years, notes: [] };
  const notes: string[] = [];
  const range = yearFrom !== undefined && yearTo !== undefined && yearFrom < yearTo;
  if (range && years.yearFrom < MIN_TREND_YEAR && years.yearTo > MIN_TREND_YEAR) {
    notes.push(`Am comparat ${MIN_TREND_YEAR} cu ${years.yearTo}: 2018 e incomplet în date.`);
    return { years: { yearFrom: MIN_TREND_YEAR, yearTo: years.yearTo }, notes };
  }
  if (range) {
    if (years.yearTo - years.yearFrom > 1) notes.push(`Am comparat capetele perioadei: ${years.yearFrom} și ${years.yearTo}.`);
    return { years, notes };
  }
  const year = (yearTo ?? yearFrom)!;
  // One year's months: the same months of both years ("Aceleași luni: ian.–mai").
  const window = monthFrom !== undefined || monthTo !== undefined ? [monthFrom ?? 1, monthTo ?? 12] as const : null;
  if (window && window[0] <= window[1] && !(window[0] === 1 && window[1] === 12) && years.yearTo === year) {
    notes.push(`Am comparat ${monthsLabel({ from: window[0], to: window[1] })} ${year} cu aceleași luni din ${year - 1}.`);
    return { years, months: [window[0], window[1]], notes };
  }
  notes.push(years.yearTo === year ? `Am comparat ${year} cu anul dinainte.` : `Am comparat ${years.yearFrom} cu ${years.yearTo}: 2018 e incomplet în date.`);
  return { years, notes };
}

/**
 * A trend entered from another question (plan §2.6 "implicitele se scriu doar
 * la intrarea în trend"): `{ change: "up", months: "auto" }` under what came
 * back from the parked row, and the years of enteredYears. Months of another
 * question leave the period (a trend counts whole years or its own months).
 * Without the archive's periods and any period, the years stay empty and the
 * builder asks for them.
 */
export function enterTrend(from: FilterSpec, spec: FilterSpec, periods: CoveragePeriods | null | undefined): { spec: FilterSpec; notes: string[] } {
  const { years, months, notes } = enteredYears(from, periods);
  const next = structuredClone(spec);
  delete next.filters.monthFrom;
  delete next.filters.monthTo;
  if (years) { next.filters.yearFrom = years.yearFrom; next.filters.yearTo = years.yearTo; }
  next.trend = { ...NEW_TREND, ...(months ? { months } : {}), ...next.trend };
  return { spec: next, notes };
}

/**
 * The trend's options a reader leaves with another question (plan §2.4
 * "pune deoparte"): set aside, so the link never carries them and touching one
 * goes back to the trend with all of them. The defaults a new trend writes
 * again need no chip.
 */
export function leavingTrend(spec: FilterSpec): ParkedItem[] {
  if (spec.block !== "trend" || !spec.trend) return [];
  const words = describeConditions(spec).byId;
  return TREND_FILTERS.filter((id) => {
    const value = FILTERS[id].read(spec);
    return value !== undefined && !(id === "trendChange" && value === NEW_TREND.change || id === "trendMonths" && value === NEW_TREND.months);
  }).map((id) => ({
    id, label: id === "trendChange" && spec.trend?.change === "all" ? "Toate schimbările" : words[id]?.chip ?? FILTERS[id].label,
    values: pathValues(spec, FILTERS[id].keys),
  }));
}

/** Counties without a firm or a domain: all 42 buy in both years, so none is new or gone (trend final §3.1, §4.3). */
const countiesAllBuy = (spec: FilterSpec) =>
  spec.dim === "county" && !spec.filters.supplierId && !spec.filters.supplierName && !spec.filters.cpvTerm;
export const COUNTIES_ALL_BUY = "Toate județele cumpără în ambii ani.";

/** Whether `year` is incomplete for the trend's source: `auto` would compare part of it (or cannot say which part). */
function incomplete(spec: FilterSpec, year: number, periods: CoveragePeriods): boolean {
  const window = sameMonthsWindow(periods, datasetOf(spec), year, "auto");
  return "error" in window || window.to < 12;
}

/**
 * What follows a choice on a trend (trend final §4.3), each with its note:
 * counties without a firm or a domain go back to the growths; a year chosen
 * past the archive's complete months brings "Aceleași luni" back by itself
 * (the amber chip says it), from whole years or an old link without the key.
 */
export function trendFollows(before: FilterSpec, after: FilterSpec, periods: CoveragePeriods | null | undefined): { spec: FilterSpec; notes: string[] } {
  if (after.block !== "trend") return { spec: after, notes: [] };
  let spec = after;
  const notes: string[] = [];
  const change = spec.trend?.change;
  if ((change === "new" || change === "gone") && countiesAllBuy(spec)) {
    spec = FILTERS.trendChange.write(spec, NEW_TREND.change);
    notes.push(COUNTIES_ALL_BUY);
  }
  const yearTo = num(spec.filters.yearTo);
  const moved = before.block === "trend" && (num(before.filters.yearTo) !== yearTo || num(before.filters.yearFrom) !== num(spec.filters.yearFrom));
  const months = spec.trend?.months;
  if (periods && moved && yearTo !== undefined && (months === undefined || months === "whole") && incomplete(spec, yearTo, periods))
    spec = FILTERS.trendMonths.write(spec, NEW_TREND.months);
  return { spec, notes };
}

/**
 * "Aceleași luni" under the trend's sentence (trend final §3.3, kit P4), from
 * the archive's periods (ctx.coverage):
 * - `auto` on an incomplete year: the amber chip with the months the answer
 *   will count ("Aceleași luni: ian.–mai"), × compares whole years;
 * - `auto` where a channel has no "complet până la" day: the warning
 *   "2026: luni neconfirmate" and "Compară pe aceleași luni…", and the run waits;
 * - chosen months: their chip, × back to `auto`;
 * - whole years (the chip removed) or an old link without the key, on an
 *   incomplete year: the switch "Aceleași luni" to turn them on;
 * - nothing on complete years.
 * Without the periods, `auto` past the calendar year is the chip without months.
 */
export type TrendMonthsState =
  | { kind: "auto"; year: number; window: MonthsWindow | null; through: string | null }
  | { kind: "unconfirmed"; year: number; channels: ("da" | "contracts")[]; prefill: MonthWindow }
  | { kind: "chosen"; window: MonthWindow }
  | { kind: "off"; year: number; unconfirmed: boolean; prefill: MonthWindow }
  | null;

const CHANNELS = { all: ["da", "contracts"], da: ["da"], contracts: ["contracts"] } as const;

/** January to the last whole month the archive reaches in `year` (the months to start a chooser from). */
function reachedMonths(periods: CoveragePeriods, dataset: Dataset, year: number): MonthWindow {
  const days = CHANNELS[dataset].map((c) => periods[c].completeUntil?.slice(0, 10) ?? periods[c].to?.slice(0, 10) ?? null).filter((d): d is string => Boolean(d)).sort();
  const end = days[0];
  if (!end || Number(end.slice(0, 4)) !== year) return [1, 12];
  const month = Number(end.slice(5, 7)), day = Number(end.slice(8, 10));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [1, Math.max(1, day === last ? month : month - 1)];
}

export function trendMonthsState(spec: FilterSpec, ctx: Pick<FilterCtx, "year" | "coverage">): TrendMonthsState {
  if (spec.block !== "trend") return null;
  const months = spec.trend?.months;
  if (Array.isArray(months)) return { kind: "chosen", window: [months[0], months[1]] };
  const periods = ctx.coverage;
  const yearTo = num(spec.filters.yearTo) ?? (periods ? num(periods.contracts.to?.slice(0, 4) ?? periods.da.to?.slice(0, 4)) : undefined);
  if (yearTo === undefined) return null;
  if (!periods) return months === "auto" && yearTo >= ctx.year ? { kind: "auto", year: yearTo, window: null, through: null } : null;
  const dataset = datasetOf(spec);
  const window = sameMonthsWindow(periods, dataset, yearTo, "auto");
  if ("error" in window) {
    const channels = CHANNELS[dataset].filter((c) => !periods[c].completeUntil);
    const prefill = reachedMonths(periods, dataset, yearTo);
    return months === "auto" ? { kind: "unconfirmed", year: yearTo, channels: [...channels], prefill } : { kind: "off", year: yearTo, unconfirmed: true, prefill };
  }
  if (window.to === 12) return null;
  if (months !== "auto") return { kind: "off", year: yearTo, unconfirmed: false, prefill: [window.from, window.to] };
  const through = CHANNELS[dataset].map((c) => periods[c].completeUntil?.slice(0, 10)).filter((d): d is string => Boolean(d)).sort()[0] ?? null;
  return { kind: "auto", year: yearTo, window, through };
}

/** Why a trend's run waits in the builder: `auto` cannot say which months of its year are complete (the engine's refusal, said before the run). */
export function trendMonthsWaiting(spec: FilterSpec, ctx: Pick<FilterCtx, "year" | "coverage">): string | null {
  const state = trendMonthsState(spec, ctx);
  return state?.kind === "unconfirmed" ? autoMonthsUnresolved(state.year) : null;
}
