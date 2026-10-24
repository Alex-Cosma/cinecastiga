import { PICKER_FAMILY, windowOf } from "../../../lib/ask/filters/blocks";
import { filterContext } from "../../../lib/ask/filters/context";
import type { EmployeesChoice } from "../../../lib/ask/filters/defs/from-whom";
import type { PeriodChoice } from "../../../lib/ask/filters/defs/selection";
import { choicesOf, choiceState, type Choice, type SubjectChoice } from "../../../lib/ask/filters/pickers";
import type { FilterCtx, FilterSpec } from "../../../lib/ask/filters/types";
import { employeesOnBands, MONTH_SHORT } from "../../../lib/ask/filters/words";
import { KIND_WORDS, leaderAxis, type QuestionSpec } from "../../../lib/ask/question-ui";
import { EMPLOYEE_BANDS, bandRange } from "./Bands";
import type { KitOption } from "./kit-types";
import type { BuilderWindowSpec } from "./view";

/*
 * The inside of each window, without React (plan §2.3, kit components 7–13):
 * which control a place opens and the rows of its lists, each with the choice
 * it writes (pickers.ts) and its state (choiceState: hidden rows are not
 * drawn, a disabled one keeps its reason, R1). BuilderWindow draws them; the
 * searches fetch there.
 */

export type WindowKind =
  | "subject" | "focal" | "buyer" | "from" | "period" | "cpv" | "place" | "locality" | "employees" | "admin" | "compareWith"
  | "list" | "advanced" | "exclusions";

/** The control a window holds, from its place: a composed picker first, then the filter's own. */
export function windowKind(win: BuilderWindowSpec): WindowKind {
  if (win.key === "advanced") return "advanced";
  if (win.key.startsWith("x:")) return "exclusions";
  const { slot } = win;
  if (slot.picker) return slot.picker;
  switch (slot.id) {
    case "period": return "period";
    case "cpvTerm": return "cpv";
    case "county": return "place";
    case "locality": return "locality";
    case "employees": return "employees";
    case "admin": return "admin";
    case "compareWith": return "compareWith";
    case "authority": case "supplier": return "focal";
    default: return "list";
  }
}

/** A row of a list window and what choosing it writes. */
export interface ChoiceOption extends KitOption { choice: Choice }

const capital = (text: string) => text.charAt(0).toLocaleUpperCase("ro-RO") + text.slice(1);
/** A value as an option's key: radios compare strings. */
export const optionValue = (value: unknown): string => JSON.stringify(value ?? null);

/** The first row of the buyer's window and of a kind (kit §4 Cumpărătorul). */
export const ALL_INSTITUTIONS = { label: "Toate instituțiile publice", detail: "inclusiv companii de stat și utilități" } as const;

const DATASET_ROWS: Record<string, [string, string]> = {
  all: ["Toate achizițiile", "Directe și din proceduri"],
  da: ["Achizițiile directe", "Fără licitație"],
  contracts: ["Contractele din proceduri", "Licitații și alte proceduri"],
};
const DATASET_ORDER = ["all", "da", "contracts"];
/** The lengths a ranking offers (the def's other values are probes of the free number). */
const TOP_ROWS = [5, 10, 25, 50];

/** The words of one choice in a list window (kit §4: the long form in windows). */
export function choiceWords(choice: Choice, spec: QuestionSpec): { label: string; detail?: string; group?: string } {
  const { filter, value } = choice;
  switch (filter) {
    case "dataset": { const [label, detail] = DATASET_ROWS[String(value ?? "all")] ?? DATASET_ROWS.all!; return { label, detail }; }
    case "measure":
      if (value === "count") return { label: "Numărul de înregistrări" };
      if (value === "value_per_capita") return { label: "Valoarea pe locuitor", detail: "Primăriile și consiliile județene cu populație cunoscută" };
      return { label: spec.block === "timeseries" ? "Valoarea" : "Valoarea înregistrată" };
    case "topN": return { label: value === undefined ? "Tot clasamentul" : value === 1 ? "Primul" : `Primele ${value}` };
    case "rankBy": return { label: value === "risk" ? "Are cel mai ridicat indice de risc" : spec.dim === "supplier" ? "Câștigă cel mai mult" : "Cumpără cel mai mult" };
    case "authorityKind": return value === undefined ? { ...ALL_INSTITUTIONS } : { label: capital(KIND_WORDS[String(value)]?.bare ?? String(value)) };
    case "dim": {
      const { dim, kind } = (typeof value === "object" && value ? value : { dim: value }) as SubjectChoice;
      if (dim === "supplier") return { label: "Firme", group: "Firme" };
      if (dim === "county") return { label: "Județe", group: "Județe" };
      return { label: kind ? capital(KIND_WORDS[kind]?.bare ?? kind) : "Instituții publice", group: "Instituții" };
    }
    default: return { label: value === undefined ? "Oricare" : String(value) };
  }
}

/** The current value a list window shows checked. */
function currentOf(filter: Choice["filter"], spec: QuestionSpec): unknown {
  switch (filter) {
    case "dataset": return spec.dataset ?? "all";
    case "measure": return spec.measure ?? "value";
    case "topN": return spec.topN;
    case "rankBy": return leaderAxis(spec);
    case "authorityKind": return spec.filters.authorityKind;
    case "dim": return spec.dim === "authority" ? { dim: "authority", ...(spec.filters.authorityKind ? { kind: spec.filters.authorityKind } : {}) } : { dim: spec.dim };
    default: return undefined;
  }
}

/**
 * The rows of a list among this window's choices (one filter, or the buyer's
 * kinds), in the kit's order, without the hidden ones; `value` is the checked row.
 */
export function listOptions(win: BuilderWindowSpec, spec: QuestionSpec, only?: Choice["filter"], ctx: FilterCtx = filterContext(spec as FilterSpec)): { options: ChoiceOption[]; value: string } {
  const filter = only ?? (win.slot.picker === "subject" ? "dim" : win.slot.id);
  let choices = choicesOf(win.slot, spec as FilterSpec, ctx).filter((c) => c.filter === filter);
  if (filter === "dataset") choices = DATASET_ORDER.flatMap((v) => choices.filter((c) => c.value === v));
  if (filter === "topN") choices = choices.filter((c) => c.value === undefined || TOP_ROWS.includes(Number(c.value)) || c.value === spec.topN);
  // A window opens on its first row (R4): "Toate instituțiile publice" leads its kinds. In the buyer's
  // window that row clears the whole window (an institution, a kind or a town hall: pickers.ts).
  if (filter === "authorityKind") {
    const all = win.slot.picker === "buyer" ? choicesOf(win.slot, spec as FilterSpec, ctx).filter((c) => c.value === undefined).slice(0, 1) : choices.filter((c) => c.value === undefined);
    choices = [...all, ...choices.filter((c) => c.value !== undefined)];
  }
  const seen = new Set<string>();
  const options: ChoiceOption[] = [];
  for (const choice of choices) {
    const state = choiceState(win.slot, choice, spec as FilterSpec, ctx);
    const value = optionValue(choice.value);
    if (state.state === "hidden" || seen.has(value)) continue;
    seen.add(value);
    const words = filter === "authorityKind" && choice.value === undefined ? { ...ALL_INSTITUTIONS } : choiceWords(choice, spec);
    options.push({ value, ...words, ...(state.state === "disabled" ? { disabled: state.reason } : {}), choice });
  }
  const current = optionValue(currentOf(filter, spec));
  return { options, value: options.some((o) => o.value === current) ? current : options[0]?.value ?? "" };
}

/** The tabs of "De la cine?" this window offers, in the order of its place (kit §5.24). */
export function fromTabs(win: BuilderWindowSpec): ("supplier" | "admin" | "employees")[] {
  const own = windowOf(win.slot);
  return (PICKER_FAMILY.from ?? []).filter((id) => own.includes(id)) as ("supplier" | "admin" | "employees")[];
}

/** The tab a "De la cine?" window opens on: the one the draft uses, else the first. */
export function fromTab(win: BuilderWindowSpec, spec: QuestionSpec): "supplier" | "admin" | "employees" {
  const tabs = fromTabs(win), f = spec.filters;
  return tabs.find((tab) => tab === "supplier" ? Boolean(f.supplierName || f.supplierId)
    : tab === "admin" ? Boolean(f.adminName || f.adminPersonKey) : f.minEmployees !== undefined || f.maxEmployees !== undefined) ?? tabs[0] ?? "supplier";
}

/** The bands a draft's employees cover; none for an old link's range off the bands (its chip says it, kit §5.5). */
export function bandValues(spec: QuestionSpec): string[] {
  const { minEmployees, maxEmployees } = spec.filters;
  if (minEmployees === undefined && maxEmployees === undefined || !employeesOnBands(minEmployees, maxEmployees)) return [];
  const min = minEmployees === undefined ? 0 : Number(minEmployees), max = maxEmployees === undefined ? null : Number(maxEmployees);
  return EMPLOYEE_BANDS.filter((band) => band.min >= min && (max === null || band.max !== null && band.max <= max)).map((band) => band.value);
}

/** The choice a run of bands writes (Bands' bandRange); none chosen removes the condition. */
export function bandsChoice(values: readonly string[]): Choice {
  const range = bandRange(EMPLOYEE_BANDS, values);
  const value: EmployeesChoice | undefined = range ? { minEmployees: range.min, ...(range.max !== null ? { maxEmployees: range.max } : {}) } : undefined;
  return { filter: "employees", value };
}

/**
 * The archive's span, from /api/data-coverage: the first direct acquisition
 * ("Toți anii · apr. 2018 – …"), the last day both streams reach, and the
 * first year of any record (the free range reaches the older contracts).
 */
export interface CoverageSpan { from?: string; to?: string; first?: string }

const dayWords = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_SHORT[(m ?? 1) - 1]} ${y}`;
};
const monthWords = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTH_SHORT[(m ?? 1) - 1]} ${y}`;
};

/** A period preset of "În ce perioadă?": its words and the period it writes (undefined: every year). */
export interface PeriodPreset extends KitOption { period: PeriodChoice | undefined }

/**
 * The presets of the period window (kit §4 Perioada): each says its years and
 * the current year says how far its data go ("2026 · până la 25 sept."). A
 * trend compares two years: consecutive pairs, the complete one first.
 */
export function periodPresets(spec: QuestionSpec, span: CoverageSpan | null, year: number): { presets: PeriodPreset[]; value: string | null } {
  const last = span?.to ? Number(span.to.slice(0, 4)) : year;
  const partial = span?.to && !span.to.endsWith("-12-31") ? span.to : null;
  const presets: PeriodPreset[] = spec.block === "trend"
    ? [
      { value: "pair-1", label: `${last - 2} și ${last - 1}`, detail: "ultimii doi ani compleți", period: { yearFrom: last - 2, yearTo: last - 1 } },
      { value: "pair-0", label: `${last - 1} și ${last}`, ...(partial ? { detail: `${last}: până la ${dayWords(partial).replace(/ \d{4}$/, "")}` } : {}), period: { yearFrom: last - 1, yearTo: last } },
      { value: "pair-2", label: `${last - 3} și ${last - 2}`, period: { yearFrom: last - 3, yearTo: last - 2 } },
    ]
    : [
      { value: "current", label: String(last), ...(partial ? { detail: `până la ${dayWords(partial).replace(/ \d{4}$/, "")}` } : {}), period: { yearFrom: last, yearTo: last } },
      { value: "previous", label: String(last - 1), period: { yearFrom: last - 1, yearTo: last - 1 } },
      { value: "three", label: "Ultimii 3 ani compleți", detail: `${last - 3}–${last - 1}`, period: { yearFrom: last - 3, yearTo: last - 1 } },
      { value: "all", label: "Toți anii", ...(span?.from && span.to ? { detail: `${monthWords(span.from)} – ${dayWords(span.to)}` } : {}), period: undefined },
    ];
  const f = spec.filters;
  const same = (p: PeriodChoice | undefined) => p === undefined
    ? !f.yearFrom && !f.yearTo && !f.monthFrom && !f.monthTo
    : Number(f.yearFrom) === p.yearFrom && Number(f.yearTo) === p.yearTo && !f.monthFrom && !f.monthTo;
  return { presets, value: presets.find((p) => same(p.period))?.value ?? null };
}
