import { TIMESERIES_RULES, type MonthWindow, type TimeseriesOptions } from "../../spec";
import { MAX_SERIES_MONTHS, seriesMonthsSpan } from "../../series";
import type { FilterDef, FilterSpec } from "../types";
import { alwaysScope, edited } from "./shared";

/*
 * The evolution's lenses (plan §4.3, §3; final timeseries §3.7–§3.9): month by
 * month (the grain, in the „Când?” window of the sentence's period phrase),
 * the split beside the answer („Împarte: Total · Directe / proceduri ·
 * Domenii”) and the same months of every year („Aceleași luni: ian.–{M}”, the
 * strip's switch, its chip under the sentence once set). F3 applies them
 * (compile.ts case "timeseries", agg_months where it answers). An evolution
 * without them is today's answer: year by year, whole years, one bar each.
 */

const optionsOf = (spec: FilterSpec): TimeseriesOptions => spec.timeseries ?? {};
/** The spec with one option set (undefined: removed). */
function writeOption<K extends keyof TimeseriesOptions>(spec: FilterSpec, key: K, value: TimeseriesOptions[K] | undefined): FilterSpec {
  return edited(spec, (next) => {
    const options: TimeseriesOptions = { ...optionsOf(next) };
    if (value === undefined) delete options[key];
    else options[key] = value;
    if (Object.keys(options).length) next.timeseries = options;
    else delete next.timeseries;
  });
}

/** Month by month fits the period: both years, at most 36 months (TIMESERIES_RULES.grain). */
export const monthsFit = (spec: FilterSpec): boolean => {
  const span = seriesMonthsSpan(spec.filters);
  return span !== null && span >= 1 && span <= MAX_SERIES_MONTHS;
};

export const timeseriesGrain: FilterDef<"month"> = {
  id: "timeseriesGrain", keys: ["timeseries.grain"], placement: "sentence", control: "segmented",
  label: "Lună de lună", windowTitle: "Când?",
  // The grouping of the bars (substr(finalization_date, 1, 7)); the selection is the period's.
  engine: { timeseries: "row" }, scope: alwaysScope("display"), since: "F3",
  read: (spec) => optionsOf(spec).grain,
  // Months by month cut no year: the same months leave with it (TIMESERIES_RULES.months, a note).
  write: (spec, value) => writeOption(spec, "grain", value),
  // "An de an | Lună de lună" in „Când?”; the window's month presets write the period first, then this.
  choices: (spec) => [...(monthsFit(spec) ? ["month" as const] : []), ...(optionsOf(spec).grain ? [undefined] : [])],
  validate: TIMESERIES_RULES.grain,
};

export const timeseriesSplit: FilterDef<"channel" | "domain"> = {
  id: "timeseriesSplit", keys: ["timeseries.split"], placement: "strip", control: "segmented",
  label: "Împarte",
  // The parts of each bar (by src or CPV division), whose sum is the bar: the selection does not change.
  engine: { timeseries: "display" }, scope: alwaysScope("display"), since: "F3",
  read: (spec) => optionsOf(spec).split,
  write: (spec, value) => writeOption(spec, "split", value),
  // "Total · Directe / proceduri · Domenii": the channels on every purchase, the domains on more than one domain.
  choices: (spec) => [
    undefined,
    ...((spec.dataset ?? "all") === "all" ? ["channel" as const] : []),
    ...(!spec.filters.cpvTerm && spec.filters.purchaseKind !== "lucrari" ? ["domain" as const] : []),
  ],
  validate: TIMESERIES_RULES.split,
};

export const timeseriesMonths: FilterDef<"auto" | MonthWindow> = {
  id: "timeseriesMonths", keys: ["timeseries.months"], placement: "strip", control: "toggle",
  label: "Aceleași luni", windowTitle: "Ce luni compari?",
  // Every year cut to the same months (predicates.ts seriesMonths); `auto` resolved at each run, as the trend's.
  engine: { timeseries: "row" }, scope: alwaysScope("selection"), since: "F3",
  read: (spec) => optionsOf(spec).months,
  write: (spec, value) => writeOption(spec, "months", Array.isArray(value) ? [value[0], value[1]] as const : value),
  // The strip's switch, offered by the answer that found the last year incomplete (its marker, data.ref); off removes it.
  choices: (spec) => optionsOf(spec).months !== undefined ? [undefined] : [],
  validate: TIMESERIES_RULES.months,
};

export const TIMESERIES_DEFS: readonly FilterDef[] = [timeseriesGrain, timeseriesSplit, timeseriesMonths];
