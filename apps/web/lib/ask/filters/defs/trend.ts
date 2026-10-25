import { DEFAULT_TREND_MIN_BASE, TREND_RULES, type AskSpec, type MonthWindow, type TrendChange, type TrendOptions } from "../../spec";
import type { FilterDef, FilterSpec } from "../types";
import { alwaysScope, edited } from "./shared";

/*
 * The trend's lenses (plan §4.7, §3; trend final §3): which change, the same
 * months of both years, the order and the base of a growth, the first year of
 * the new ones. F2 applies them (compile.ts case "trend", trendGroupSql and
 * trendYearsPredicate in predicates.ts; the months by sameMonthsWindow). A trend
 * without them is today's answer: every change, ordered by its size in lei, on
 * whole years. The builder places them (BLOCK_FILTERS.trend): the change in
 * the sentence and the strip, the months under the sentence (P4), the order
 * and its base in the presentation line, "Prima dată" in the strip; what a new
 * trend writes and what follows a choice on it are trend-rules.ts'.
 */

/** The groups in the kit's words (§4): the answer's buttons, the chips, the pills, the sources' note. */
export const TREND_CHANGE_LABELS: Readonly<Record<TrendChange, string>> = {
  all: "Toate", up: "Creșteri", new: "Noi", down: "Scăderi", gone: "Nu mai apar",
};
/**
 * A group's name in a sentence, a chip or a note (kit §4: bare „Noi” only on the short buttons):
 * „Noi față de 2024”, „Nu mai apar în 2025”; the others as on the buttons.
 */
export function trendGroupLabel(change: TrendChange, yearA?: unknown, yearB?: unknown): string {
  const year = (y: unknown) => typeof y === "number" || (typeof y === "string" && y !== "");
  if (change === "new" && year(yearA)) return `Noi față de ${yearA}`;
  if (change === "gone" && year(yearB)) return `Nu mai apar în ${yearB}`;
  return TREND_CHANGE_LABELS[change];
}

/** What the trend's groups are called after the selection (trend final §1): firms of a chosen buyer are its suppliers, institutions of a chosen firm its clients. */
export type TrendNoun = "firme" | "furnizori" | "instituții" | "clienți" | "județe";
export function trendNoun(spec: Pick<AskSpec, "dim" | "filters">): TrendNoun {
  const f = spec.filters;
  if (spec.dim === "county") return "județe";
  if (spec.dim === "supplier") return f.authorityId || f.authorityName || f.uatSiruta ? "furnizori" : "firme";
  return f.supplierId || f.supplierName ? "clienți" : "instituții";
}

const optionsOf = (spec: FilterSpec): TrendOptions => spec.trend ?? {};
/** The spec with one trend option set (undefined: removed), and what that change implies for the others. */
function writeOption<K extends keyof TrendOptions>(spec: FilterSpec, key: K, value: TrendOptions[K] | undefined,
  implies: (options: TrendOptions) => void = () => {}): FilterSpec {
  return edited(spec, (next) => {
    const options: TrendOptions = { ...optionsOf(next) };
    if (value === undefined) delete options[key];
    else options[key] = value;
    implies(options);
    if (Object.keys(options).length) next.trend = options;
    else delete next.trend;
  });
}
/** Counties: the new and the gone are sure to be empty without a firm or a domain (all 42 buy in both years, trend final §3.1). */
const surelyFull = (spec: FilterSpec) =>
  spec.dim === "county" && !spec.filters.supplierId && !spec.filters.supplierName && !spec.filters.cpvTerm;

export const trendChange: FilterDef<TrendChange> = {
  id: "trendChange", keys: ["trend.change"], placement: "strip", control: "countGroups",
  label: "Felul schimbării", windowTitle: "Ce fel de schimbare?",
  // A HAVING on the result grouped by entity or county (trendGroupSql): the list narrows to the group.
  engine: { trend: "group" }, scope: alwaysScope("group"), since: "F2",
  read: (spec) => optionsOf(spec).change,
  // A group keeps only its own options (trend final §4.3): the order and its base on growths, the first year on the new ones.
  write: (spec, value) => writeOption(spec, "change", value, (options) => {
    if (options.change !== "up") { delete options.order; delete options.minBase; }
    if (options.change !== "new") delete options.firstOnly;
  }),
  // The answer's five buttons (the builder writes one explicitly; no key reads "all").
  choices: (spec) => surelyFull(spec) ? ["up", "down", "all"] : ["up", "new", "down", "gone", "all"],
};

export const trendMonths: FilterDef<"auto" | "whole" | MonthWindow> = {
  id: "trendMonths", keys: ["trend.months"], placement: "under", control: "toggle",
  label: "Aceleași luni", windowTitle: "Ce luni compari?",
  // trendYearsPredicate: the same months of both years, on the record; `auto` resolved at each run (sameMonthsWindow).
  engine: { trend: "row" }, scope: alwaysScope("selection"), since: "F2",
  read: (spec) => optionsOf(spec).months,
  write: (spec, value) => writeOption(spec, "months", Array.isArray(value) ? [value[0], value[1]] as const : value),
  // The automatic chip, removed (whole years), or months a reader chose ("Compară pe aceleași luni…", January to a month).
  choices: () => ["auto", "whole", [1, 6] as const],
};

export const trendOrder: FilterDef<"lei" | "percent"> = {
  id: "trendOrder", keys: ["trend.order"], placement: "presentation", control: "segmented",
  label: "Ordinea",
  // The order of the growths' list (trendGroupSql); in percent the base picks who is ranked (trendMinBase).
  engine: { trend: "display" }, scope: alwaysScope("display"), since: "F2",
  read: (spec) => optionsOf(spec).order,
  // The builder writes the base it shows: from 1 mil. lei (trend final §3.9).
  write: (spec, value) => writeOption(spec, "order", value, (options) => {
    if (options.order === "percent") options.minBase ??= DEFAULT_TREND_MIN_BASE;
    else delete options.minBase;
  }),
  choices: (spec) => optionsOf(spec).change === "up" ? ["lei", "percent"] : [],
  validate: TREND_RULES.order,
};

export const trendMinBase: FilterDef<number> = {
  id: "trendMinBase", keys: ["trend.minBase"], placement: "presentation", control: "rangePills",
  label: "Dintre cele cu cel puțin",
  // In the HAVING of the growths: only those with at least this much in year A are ranked in percent.
  engine: { trend: "group" }, scope: alwaysScope("group"), since: "F2",
  read: (spec) => optionsOf(spec).minBase,
  write: (spec, value) => writeOption(spec, "minBase", value),
  choices: (spec) => optionsOf(spec).order === "percent" ? [100_000, 1_000_000, 10_000_000] : [],
  validate: TREND_RULES.minBase,
};

export const trendFirstOnly: FilterDef<true> = {
  id: "trendFirstOnly", keys: ["trend.firstOnly"], placement: "strip", control: "segmented",
  label: "Prima dată",
  // Of the new ones, those whose first record in the archive is in year B (entity_profile.first_activity, in the HAVING).
  engine: { trend: "group" }, scope: alwaysScope("group"), since: "F2",
  read: (spec) => optionsOf(spec).firstOnly,
  write: (spec, value) => writeOption(spec, "firstOnly", value),
  // "Toate · Prima dată în 2025", on the new ones of firms or institutions.
  choices: (spec) => optionsOf(spec).change === "new" && spec.dim !== "county" ? [undefined, true] : [],
  validate: TREND_RULES.firstOnly,
};

export const TREND_DEFS: readonly FilterDef[] = [trendChange, trendMonths, trendOrder, trendMinBase, trendFirstOnly];
