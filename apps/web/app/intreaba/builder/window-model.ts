import { GLOSSARY } from "../../../lib/glossary";
import { PICKER_FAMILY, windowOf } from "../../../lib/ask/filters/blocks";
import { filterContext } from "../../../lib/ask/filters/context";
import type { EmployeesChoice } from "../../../lib/ask/filters/defs/from-whom";
import type { PeriodChoice } from "../../../lib/ask/filters/defs/selection";
import { choicesOf, choiceState, type Choice, type SubjectChoice } from "../../../lib/ask/filters/pickers";
import type { FilterCtx, FilterSpec } from "../../../lib/ask/filters/types";
import { TREND_ORDER_WORDS, adminPhrase, employeesOnBands, employeesPhrase, localityName, MONTH_SHORT } from "../../../lib/ask/filters/words";
import { KIND_ONE, KIND_WORDS, entityLabel, leaderAxis, type QuestionSpec } from "../../../lib/ask/question-ui";
import { DEFAULT_TREND_MIN_BASE, type AskSpec } from "../../../lib/ask/spec";
import { MIN_TREND_YEAR } from "../../../lib/ask/months-window";
import { TREND_ALL_CHANGES, TREND_CHANGE_LABELS, TREND_CHANGE_PHRASE, TREND_NOUN_WORDS, trendNoun } from "../../../lib/ask/filters/defs/trend";
import { formatRon } from "../../../lib/format";
import { EMPLOYEE_BANDS, bandRange } from "./Bands";
import type { KitOption, KitRestRow, KitTip } from "./kit-types";
import type { BuilderWindowSpec } from "./view";

/*
 * The inside of each window, without React (plan §2.3, kit components 7–13):
 * which control a place opens and the rows of its lists, each with the choice
 * it writes (pickers.ts) and its state (choiceState: hidden rows are not
 * drawn, a disabled one keeps its reason, R1). BuilderWindow draws them; the
 * searches fetch there.
 */

export type WindowKind =
  | "subject" | "focal" | "buyer" | "from" | "peers" | "period" | "cpv" | "place" | "locality" | "employees" | "admin" | "compareWith"
  | "months" | "list" | "advanced" | "exclusions";

/** The control a window holds, from its place: a composed picker first, then the filter's own. */
export function windowKind(win: BuilderWindowSpec): WindowKind {
  if (win.key === "advanced" || win.key.startsWith("a:")) return "advanced";
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
    case "trendMonths": return "months";
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

/**
 * The subject window's words on the profiles' questions: "Cine?" on the risk
 * cloud names the institutions first, with every one leading and the rest
 * that cannot be chosen after the kinds (final scatter §3.1); "Cine
 * concurează?" speaks in the singular of "Care [firmă]" (final entity_card §3.1).
 */
function subjectWords(dim: SubjectChoice["dim"], kind: string | undefined, block: string): { label: string; detail?: string; group?: string } {
  if (block === "entity_card") {
    if (dim === "supplier") return { label: "Firmă" };
    return { label: kind ? capital(KIND_ONE[kind] ?? kind) : "Orice instituție publică", group: "Instituție" };
  }
  if (dim === "supplier") return { label: "Firme", group: "Firme" };
  if (dim === "county") return { label: "Județe", group: "Județe" };
  if (block === "scatter") return kind ? { label: capital(KIND_WORDS[kind]?.bare ?? kind), group: "Instituții publice" } : { ...ALL_INSTITUTIONS, group: "Instituții publice" };
  return { label: kind ? capital(KIND_WORDS[kind]?.bare ?? kind) : "Instituții publice", group: "Instituții" };
}

/** The axis of "Cine conduce?": each row says what it changes (final entity_card §3.2). */
const AXIS_DETAIL = {
  value: "Valoarea înregistrată, în perioada aleasă.",
  risk: "Tot istoricul, doar achiziții directe. Perioada, domeniul și cumpărătorul nu se aplică.",
} as const;

/**
 * "Ce fel de schimbare?" (trend final §3.1): each change with its one-line rule, in the question's
 * years, in the vocabulary's long form (kit §4): the sentence's word ("Creștere"), the groups' noun
 * after the selection ("Furnizori noi" of a chosen buyer, "Clienți noi" of a chosen firm).
 */
function trendChangeWords(change: string, spec: QuestionSpec): { label: string; detail: string } {
  const a = spec.filters.yearFrom ?? "primul an", b = spec.filters.yearTo ?? "ultimul an";
  switch (change) {
    case "up": return { label: capital(TREND_CHANGE_PHRASE.up), detail: `În ambii ani, mai mult în ${b}.` };
    case "new": return { label: `${capital(TREND_NOUN_WORDS[trendNoun(spec as unknown as AskSpec)].many)} ${TREND_CHANGE_LABELS.new.toLocaleLowerCase("ro-RO")}`, detail: `Nicio înregistrare în ${a}, cel puțin una în ${b}.` };
    case "down": return { label: capital(TREND_CHANGE_PHRASE.down), detail: `În ambii ani, mai puțin în ${b}.` };
    case "gone": return { label: TREND_CHANGE_LABELS.gone, detail: `Înregistrări în ${a}, niciuna în ${b}.` };
    default: return { label: TREND_ALL_CHANGES, detail: "Toate grupurile, după diferența în lei." };
  }
}

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
    case "rankBy": return value === "risk"
      ? { label: "Are cel mai ridicat indice de risc", detail: AXIS_DETAIL.risk }
      : { label: spec.dim === "supplier" ? "Câștigă cel mai mult" : "Cumpără cel mai mult", detail: AXIS_DETAIL.value };
    case "authorityKind": return value === undefined ? { ...ALL_INSTITUTIONS } : { label: capital(KIND_WORDS[String(value)]?.bare ?? String(value)) };
    case "dim": {
      const { dim, kind } = (typeof value === "object" && value ? value : { dim: value }) as SubjectChoice;
      return subjectWords(dim, kind, spec.block);
    }
    case "trendChange": return trendChangeWords(String(value), spec);
    case "trendOrder": return value === "percent"
      ? { label: capital(TREND_ORDER_WORDS.percent), detail: "Doar cele prezente în ambii ani, de la un prag." }
      : { label: capital(TREND_ORDER_WORDS.lei) };
    case "trendMinBase": return { label: formatRon(Number(value)) };
    // "Ce luni compari?" (trend final §3.3): the automatic months, or whole years; chosen months are its fields.
    case "trendMonths": return value === "whole"
      ? { label: "Ani întregi", detail: "Toate lunile, în ambii ani." }
      : { label: "Aceleași luni, automat", detail: "Până la ultima lună completă. Se recalculează la fiecare actualizare." };
    default: return { label: value === undefined ? "Oricare" : String(value) };
  }
}

/**
 * The (?) beside a window's title, where its rows need one more sentence
 * than their own words (kit §4: short labels, the rest in a tip): how the
 * kinds are told apart, what the index is, what the comparison group holds.
 */
export function windowTip(win: BuilderWindowSpec, spec: QuestionSpec): KitTip | undefined {
  const { block } = spec;
  if (win.slot.picker === "subject" && block === "scatter")
    return { title: "Tipul instituției", text: `${GLOSSARY["tip-institutie"].text} „Alte instituții” nu se poate alege: e restul grupului.` };
  if (win.slot.picker === "subject" && block === "entity_card") return { id: "tip-institutie" };
  if (win.slot.id === "rankBy") return { title: "Indicele de risc", text: "Un semnal statistic, nu o dovadă." };
  if (win.slot.picker === "peers")
    return { title: "Grupul de comparație", text: `Profilurile cu cel puțin 10 achiziții directe. ${GLOSSARY["tip-institutie"].text}` };
  // The trend's years start in 2019 (trend final §3.2); its months are the same in both years (§3.3).
  if (win.slot.id === "period" && block === "trend") return { title: "Ce ani compari?", text: `Din ${MIN_TREND_YEAR}: 2018 e incomplet în date.` };
  if (win.slot.id === "trendMonths")
    return { title: "Aceleași luni", text: "Ambii ani se compară pe aceleași luni, ca diferența să nu vină din lunile lipsă." };
  return undefined;
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
    // A trend without the key is every change (an old link); an order in percent without its base ranks from 1 mil. lei.
    case "trendChange": return spec.trend?.change ?? "all";
    case "trendOrder": return spec.trend?.order ?? "lei";
    case "trendMinBase": return spec.trend?.minBase ?? DEFAULT_TREND_MIN_BASE;
    default: return undefined;
  }
}

/**
 * The rows of a list among this window's choices (one filter, or the buyer's
 * kinds), in the kit's order, without the hidden ones; `value` is the checked row.
 */
export function listOptions(win: BuilderWindowSpec, spec: QuestionSpec, only?: Choice["filter"], ctx: FilterCtx = filterContext(spec as FilterSpec)): { options: ChoiceOption[]; value: string; rest?: KitRestRow[] } {
  const filter = only ?? (win.slot.picker === "subject" ? "dim" : win.slot.id);
  let choices = choicesOf(win.slot, spec as FilterSpec, ctx).filter((c) => c.filter === filter);
  if (filter === "dataset") choices = DATASET_ORDER.flatMap((v) => choices.filter((c) => c.value === v));
  // The risk cloud is about institutions first (final scatter §3.1): their group leads, the firms follow.
  const scatterSubject = filter === "dim" && ctx.block === "scatter";
  if (scatterSubject) choices = [...choices.filter((c) => (c.value as SubjectChoice).dim === "authority"), ...choices.filter((c) => (c.value as SubjectChoice).dim !== "authority")];
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
  const value = options.some((o) => o.value === current) ? current : options[0]?.value ?? "";
  // What no kind names is the rest of the institutions, after the last kind: shown, not chosen (kit §4 Tipurile, R5).
  const kinds = scatterSubject ? options.filter((o) => (o.choice.value as SubjectChoice).dim === "authority")
    : filter === "authorityKind" ? options.filter((o) => o.choice.value !== undefined) : [];
  const lastKind = kinds.length > 1 ? kinds[kinds.length - 1] : undefined;
  return lastKind ? { options, value, rest: [{ label: OTHER_INSTITUTIONS, after: lastKind.value }] } : { options, value };
}

/** The institutions no kind names (kit §4): a rest row, never a choice. */
export const OTHER_INSTITUTIONS = "Alte instituții";
/** The firms whose seat is not known (kit §4 Sediul firmei, R5): a rest row of the seat windows, never a choice. */
export const UNKNOWN_SEAT = "Sediu necunoscut";

/** The value of the row that is the window's current choice: choosing it again changes nothing. */
export const CURRENT_ROW = "current";

/**
 * The current choice of a window whose values are searched (a county, a town
 * hall, an institution, a domain, a firm or a person): drawn checked at the
 * top, above the first row, so the window says what the phrase holds (a
 * radiogroup with nothing checked reads as "nothing chosen"). None when the
 * window is on its first row.
 */
export function currentRow(kind: "place" | "locality" | "buyer" | "cpv" | "from" | "peers", spec: QuestionSpec, tabs: readonly ("supplier" | "admin" | "employees")[] = []): ChoiceOption | null {
  const f = spec.filters;
  const row = (label: string, detail?: string): ChoiceOption => ({ value: CURRENT_ROW, label, ...(detail ? { detail } : {}), choice: { filter: "county", value: f.county } });
  const county = f.county ? String(f.county) : null;
  const countyName = county && (/^bucure/i.test(county) ? "București" : `Județul ${county}`);
  const town = f.uatSiruta || f.uatName ? `Primăria ${f.uatName ? localityName(String(f.uatName)) : `SIRUTA ${f.uatSiruta}`}` : null;
  switch (kind) {
    case "place": return town ? row(town) : countyName ? row(countyName) : null;
    case "locality": return town ? row(town) : null;
    case "peers": return countyName ? row(countyName) : null;
    case "buyer": return f.authorityName || f.authorityId ? row(entityLabel(spec, "authority")) : town ? row(town) : null;
    case "cpv": {
      if (f.cpvTerm === undefined || f.cpvTerm === "") return null;
      const term = String(f.cpvTerm);
      return row(/^(?:\d{2,8}|\d{8}-\d)$/.test(term.replace(/\s+/g, "")) ? `CPV ${term}` : `„${term}”`);
    }
    case "from": {
      const tab = tabs.find((t) => t === "supplier" ? f.supplierName || f.supplierId : t === "admin" ? f.adminName || f.adminPersonKey : f.minEmployees !== undefined || f.maxEmployees !== undefined);
      if (!tab) return null;
      return row(capital(tab === "supplier" ? entityLabel(spec, "supplier") : tab === "admin" ? adminPhrase(f.adminName) : employeesPhrase(f.minEmployees, f.maxEmployees) ?? "Firmele alese"));
    }
  }
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

/** The first year the year chart draws and the free range of "Când?" offers (final timeseries §3.7, §4): older contracts are its footer row. */
export const SERIES_FIRST_YEAR = 2018;

/**
 * The presets of the period window (kit §4 Perioada): each says its years and
 * the current year says how far its data go ("2026 · până la 25 sept.").
 * "Compleți" leaves out only a year still running: data up to 31 Dec make the
 * last year complete. A trend compares two years: consecutive pairs, the
 * complete one first, the one with the running year on the same months; its
 * free range starts in 2019 (MIN_TREND_YEAR). The year chart has intervals only (plan §4.3): one year
 * is one bar, so "Toți anii · Ultimii 5 ani compleți · Ultimii 3 ani compleți".
 */
export function periodPresets(spec: QuestionSpec, span: CoverageSpan | null, year: number): { presets: PeriodPreset[]; value: string | null } {
  const last = span?.to ? Number(span.to.slice(0, 4)) : year;
  const partial = span?.to && !span.to.endsWith("-12-31") ? span.to : null;
  const complete = partial ? last - 1 : last;
  const until = partial ? dayWords(partial).replace(/ \d{4}$/, "") : null;
  const all: PeriodPreset = { value: "all", label: "Toți anii", ...(span?.from && span.to ? { detail: `${monthWords(span.from)} – ${dayWords(span.to)}` } : {}), period: undefined };
  const years = (value: string, label: string, n: number): PeriodPreset => {
    const from = Math.max(SERIES_FIRST_YEAR, complete - n + 1);
    return { value, label, detail: `${from}–${complete}`, period: { yearFrom: from, yearTo: complete } };
  };
  const presets: PeriodPreset[] = spec.block === "trend"
    ? [
      { value: "pair-1", label: `${complete - 1} și ${complete}`, detail: "ultimii doi ani compleți", period: { yearFrom: complete - 1, yearTo: complete } },
      // A year still running is compared on the same months (trend-rules.ts trendFollows puts "Aceleași luni" back).
      ...(partial ? [{ value: "pair-0", label: `${last - 1} și ${last}`, detail: `pe aceleași luni · ${last}: până la ${until}`, period: { yearFrom: last - 1, yearTo: last } }] : []),
      { value: "pair-2", label: `${complete - 2} și ${complete - 1}`, period: { yearFrom: complete - 2, yearTo: complete - 1 } },
    ]
    : spec.block === "timeseries"
      ? [all, years("five", "Ultimii 5 ani compleți", 5), years("three", "Ultimii 3 ani compleți", 3)]
      : [
        { value: "current", label: String(last), ...(until ? { detail: `până la ${until}` } : {}), period: { yearFrom: last, yearTo: last } },
        { value: "previous", label: String(last - 1), period: { yearFrom: last - 1, yearTo: last - 1 } },
        years("three", "Ultimii 3 ani compleți", 3),
        all,
      ];
  const f = spec.filters;
  const same = (p: PeriodChoice | undefined) => p === undefined
    ? !f.yearFrom && !f.yearTo && !f.monthFrom && !f.monthTo
    : Number(f.yearFrom) === p.yearFrom && Number(f.yearTo) === p.yearTo && !f.monthFrom && !f.monthTo;
  return { presets, value: presets.find((p) => same(p.period))?.value ?? null };
}
