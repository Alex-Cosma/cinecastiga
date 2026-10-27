import { GLOSSARY } from "../../../lib/glossary";
import { PICKER_FAMILY, windowOf } from "../../../lib/ask/filters/blocks";
import { filterContext } from "../../../lib/ask/filters/context";
import type { EmployeesChoice } from "../../../lib/ask/filters/defs/from-whom";
import type { PeriodChoice } from "../../../lib/ask/filters/defs/selection";
import { choicesOf, choiceState, type Choice, type SubjectChoice } from "../../../lib/ask/filters/pickers";
import type { FilterCtx, FilterSpec } from "../../../lib/ask/filters/types";
import { TREND_ORDER_WORDS, adminPhrase, employeesOnBands, employeesPhrase, localityName, MONTH_SHORT } from "../../../lib/ask/filters/words";
import { KIND_ONE, KIND_WORDS, entityLabel, leaderAxis, type QuestionSpec } from "../../../lib/ask/question-ui";
import { DEFAULT_TREND_MIN_BASE, type AskSpec, type FirmSeat } from "../../../lib/ask/spec";
import { countyIsFirmSeat } from "../../../lib/ask/population";
import { firmSeatWords, seatCountyWords } from "../../../lib/ask/seat";
import { MAX_SERIES_MONTHS } from "../../../lib/ask/series";
import { MIN_TREND_YEAR, defaultTrendYears, type CoveragePeriods } from "../../../lib/ask/months-window";
import { TREND_ALL_CHANGES, TREND_CHANGE_LABELS, TREND_CHANGE_PHRASE, TREND_NOUN_WORDS, trendGap, trendGroupLabel, trendNoun } from "../../../lib/ask/filters/defs/trend";
import { formatInt, formatRon } from "../../../lib/format";
import { formatShare } from "../../../lib/ask/answer-text";
import { FACET_PENDING, facetCountText, facetTotalText, type FacetCounts, type FacetUnit, type FacetView } from "../../../lib/ask/facet-parts";
import { PROCEDURE_WORDS, type Procedure } from "../../../lib/ask/purchase";
import { EMPLOYEE_BANDS, bandRange } from "./Bands";
import { NETWORK_LIST_LABELS, NETWORK_ORDER_WORDS, NETWORK_SIGNALS_RULE, networkGroupRule, type NetworkGroup, type NetworkOrder } from "../../../lib/ask/network-shared";
import { lastNetworkYear } from "../../../lib/ask/filters/defs/network";
import type { GroupSwatch, KitOption, KitRestRow, KitTip } from "./kit-types";
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
  | "months" | "list" | "advanced" | "exclusions" | "size" | "seat";

/** The control a window holds, from its place: a composed picker first, then the filter's own. */
export function windowKind(win: BuilderWindowSpec): WindowKind {
  if (win.key === "advanced" || win.key.startsWith("a:")) return "advanced";
  if (win.key.startsWith("x:")) return "exclusions";
  const { slot } = win;
  if (slot.picker) return slot.picker;
  switch (slot.id) {
    case "period": return "period";
    case "cpvTerm": case "purchaseKind": return "cpv";
    case "purchaseValue": return "size";
    // The firm's seat (F4): its two keys, and a link's county on a firm profile, which is that seat.
    case "firmSeat": case "seatCounty": return "seat";
    case "county": return win.title === SEAT_WINDOW ? "seat" : "place";
    case "locality": return "locality";
    case "employees": return "employees";
    case "admin": return "admin";
    case "compareWith": return "compareWith";
    case "trendMonths": return "months";
    // The evolution's same months: the chip's window removes them (its switch is beside the answer).
    case "timeseriesMonths": return "list";
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

/** The procedures' group in "Ce fel de achiziții?" (kit item 8, stat final §3.1). */
export const PROCEDURE_GROUP = "O procedură anume";
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

/** A new institution without a chosen firm is often an old one under another identity (trend final §3.1). */
export const NEW_INSTITUTIONS_CAVEAT = "Des: reorganizări, asociații, beneficiari privați.";

/**
 * "Ce fel de schimbare?" (trend final §3.1): each change with its one-line rule, in the question's
 * years, in the vocabulary's long form (kit §4): the sentence's word ("Creștere"), the groups' noun
 * after the selection ("Furnizori noi" of a chosen buyer, "Clienți noi" of a chosen firm), and the
 * swatch of its button in the answer. Across other years (trendGap) the new and the gone say the year
 * without records ("Firme fără înregistrări în 2023", "Fără înregistrări în 2025").
 */
function trendChangeWords(change: string, spec: QuestionSpec): { label: string; detail: string; swatch: GroupSwatch } {
  const a = spec.filters.yearFrom ?? "primul an", b = spec.filters.yearTo ?? "ultimul an";
  const gap = trendGap(a, b), noun = trendNoun(spec as unknown as AskSpec);
  switch (change) {
    case "up": return { label: capital(TREND_CHANGE_PHRASE.up), detail: `În ambii ani, mai mult în ${b}.`, swatch: "up" };
    case "new": {
      const label = `${capital(TREND_NOUN_WORDS[noun].many)} ${(gap ? trendGroupLabel("new", a, b) : TREND_CHANGE_LABELS.new).toLocaleLowerCase("ro-RO")}`;
      const caveat = noun === "instituții" ? ` ${NEW_INSTITUTIONS_CAVEAT}` : "";
      return { label, detail: `Nicio înregistrare în ${a}, cel puțin una în ${b}.${caveat}`, swatch: "new" };
    }
    case "down": return { label: capital(TREND_CHANGE_PHRASE.down), detail: `În ambii ani, mai puțin în ${b}.`, swatch: "down" };
    case "gone": return { label: gap ? trendGroupLabel("gone", a, b) : TREND_CHANGE_LABELS.gone, detail: `Înregistrări în ${a}, niciuna în ${b}.`, swatch: "gone" };
    default: return { label: TREND_ALL_CHANGES, detail: "Toate grupurile, după diferența în lei.", swatch: "all" };
  }
}

/** The words of one choice in a list window (kit §4: the long form in windows). */
export function choiceWords(choice: Choice, spec: QuestionSpec): { label: string; detail?: string; group?: string; swatch?: GroupSwatch } {
  const { filter, value } = choice;
  switch (filter) {
    case "dataset": { const [label, detail] = DATASET_ROWS[String(value ?? "all")] ?? DATASET_ROWS.all!; return { label, detail }; }
    // Kit item 8: the procedures under "Ce fel de achiziții?", in their own group.
    case "procedure": {
      const words = PROCEDURE_WORDS[String(value) as Procedure];
      return words ? { label: words.label, ...(words.detail ? { detail: words.detail } : {}), group: PROCEDURE_GROUP } : { label: "Orice procedură" };
    }
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
    // The evolution's (F3, final timeseries §3.7–§3.9): the same months, the split, the pace.
    case "timeseriesMonths": return value === undefined
      ? { label: "Ani întregi", detail: "Toate lunile fiecărui an." }
      : { label: "Aceleași luni, automat", detail: "Fiecare an, până la ultima lună completă din ultimul an." };
    case "timeseriesSplit": return { label: value === "channel" ? "Directe / proceduri" : value === "domain" ? "Domenii" : "Total" };
    case "timeseriesGrain": return { label: value === "month" ? "Lună de lună" : "An de an" };
    // F4, the network (final network §3.1–§3.5, kit §4): each group with its rule against the year, the year, the order.
    case "networkPartners": {
      const since = spec.network?.since ?? lastNetworkYear(filterContext(spec as FilterSpec));
      return value === undefined ? { label: "Toți partenerii", detail: "În perioada aleasă." }
        : { label: NETWORK_LIST_LABELS[value as NetworkGroup], detail: networkGroupRule(value as NetworkGroup, since), swatch: value === "new" ? "new" : value === "gone" ? "gone" : "up" };
    }
    case "networkSince": return { label: String(value) };
    case "networkOrder": return { label: capital(NETWORK_ORDER_WORDS[(value ?? "value") as NetworkOrder].phrase) };
    case "networkShow": return { label: `Primii ${value}` };
    case "networkSignals": return value ? { label: "Doar cei cu semnale", detail: "Un semnal oficial pe această relație." } : { label: "Toți partenerii" };
    case "sankeyShown": return { label: `Primii ${value}` };
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
  // F3 (stat final §3.1, §3.3, §3.6): what the kind, the procedure and the size are made of.
  if (win.slot.id === "purchaseValue")
    return { title: "Mărimea achiziției", text: "Valoarea întregului contract sau a achiziției directe, nu cota fiecărui câștigător. Limita de jos intră în plajă, cea de sus nu. Plajele nu sunt praguri legale." };
  if (windowOf(win.slot).includes("purchaseKind")) return { title: "Tipul", text: "Tipul vine din codul CPV." };
  if (win.slot.id === "dataset" && windowOf(win.slot).includes("procedure")) return { title: PROCEDURE_GROUP, text: "Procedura declarată în SEAP, doar la contractele din proceduri." };
  // F4: where the seat comes from (owner-seat-switch), one text with the column's (?) and /harta's.
  if (windowKind(win) === "seat") return { id: "sediul-firmei" };
  // F4, the network: the groups are of the whole relation; the year cannot be one the archive has not completed.
  if (win.slot.id === "networkPartners") return { title: "Ce parteneri?", text: "Grupele privesc toate achizițiile dintre cei doi, din toată arhiva. Canalul, domeniul și condițiile partenerilor aleg doar cine apare." };
  if (win.slot.id === "networkSince") return { title: "Anul de referință", text: `${lastNetworkYear(filterContext(spec as FilterSpec)) + 1} nu se poate alege: nu s-a încheiat. Înainte de 2021 arhiva are mai puține contracte, deci „Noi” ar fi umflat.` };
  if (win.slot.id === "networkSignals") return { title: "Cu semnale", text: NETWORK_SIGNALS_RULE };
  return undefined;
}

/** The current value a list window shows checked. */
function currentOf(filter: Choice["filter"], spec: QuestionSpec): unknown {
  switch (filter) {
    case "dataset": return spec.dataset ?? "all";
    case "procedure": return spec.filters.procedure;
    case "measure": return spec.measure ?? "value";
    case "topN": return spec.topN;
    case "rankBy": return leaderAxis(spec);
    case "authorityKind": return spec.filters.authorityKind;
    case "dim": return spec.dim === "authority" ? { dim: "authority", ...(spec.filters.authorityKind ? { kind: spec.filters.authorityKind } : {}) } : { dim: spec.dim };
    // A trend without the key is every change (an old link); an order in percent without its base ranks from 1 mil. lei.
    case "trendChange": return spec.trend?.change ?? "all";
    case "trendOrder": return spec.trend?.order ?? "lei";
    case "trendMinBase": return spec.trend?.minBase ?? DEFAULT_TREND_MIN_BASE;
    // F4: a network without its keys is every partner, by value, 14 rows (an old link), counted from the last complete year.
    case "networkPartners": return spec.network?.partners;
    case "networkSince": return spec.network?.since ?? lastNetworkYear(filterContext(spec as FilterSpec));
    case "networkOrder": return spec.network?.order ?? "value";
    case "networkShow": return spec.network?.show ?? 14;
    case "networkSignals": return spec.network?.signals;
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
/** The seat's window (R10, kit §4 "Sediul firmei"). */
export const SEAT_WINDOW = "Unde au sediul firmele?";

/**
 * The rows of "Unde au sediul firmele?" (F4; kit §4 Sediul firmei, §6 table 1
 * and entity_card 1): "Oriunde" first, which clears the seat; on a ranking of
 * firms the seat against the buyer's county of each record ("În județul
 * instituției", or the county's own name when the question fixes it, "În alt
 * județ"), and "În străinătate" wherever the question runs on the records; a
 * county of the seat is searched under the list (seatCounty). Each row with
 * its choices (pickers.ts) and its state (abroad beside a size: disabled, with
 * the reason). `value` is the checked row, null when a county is chosen
 * (seatCurrentRow says it). `centre`: around an institution (the network,
 * the flow), its county, which names "În județul Buzău" (kit §6 network 5).
 */
export function seatOptions(win: BuilderWindowSpec, spec: QuestionSpec, ctx: FilterCtx = filterContext(spec as FilterSpec), centre: string | null = null): { options: ChoiceOption[]; value: string | null } {
  const f = spec.filters;
  const offered = choicesOf(win.slot, spec as FilterSpec, ctx).filter((c) => c.filter === "firmSeat" && c.value !== undefined);
  // On a firm profile a link's county is the seat too: "Oriunde" clears it as well.
  const linkCounty = Boolean(f.county) && isFirmProfile(spec);
  const anywhere: ChoiceOption = {
    value: "none", label: "Oriunde",
    choice: { filter: "firmSeat", value: undefined },
  };
  const rows: ChoiceOption[] = [anywhere];
  for (const choice of offered) {
    const seat = choice.value as FirmSeat;
    const state = choiceState(win.slot, choice, spec as FilterSpec, ctx);
    if (state.state === "hidden") continue;
    // „În județul Buzău”: the draft's county, else the county of the institution in the centre (its seat counts' `centreCounty`).
    const words = firmSeatWords(seat, seat === "same" ? (f.county ? String(f.county) : centre) : null);
    rows.push({ value: seat, label: `${words.charAt(0).toLocaleUpperCase("ro-RO")}${words.slice(1)}`, ...(state.state === "disabled" ? { disabled: state.reason } : {}), choice });
  }
  const chosen = typeof f.firmSeat === "string" ? f.firmSeat : null;
  const value = chosen ?? (f.seatCounty || linkCounty ? null : "none");
  return { options: rows, value };
}

/** "Oriunde" removes every seat key, a link's county on a firm profile with them (seatOptions). */
export function seatClearChoices(spec: QuestionSpec): Choice[] {
  return [
    { filter: "firmSeat", value: undefined }, { filter: "seatCounty", value: undefined },
    ...(spec.filters.county && isFirmProfile(spec) ? [{ filter: "county" as const, value: undefined }] : []),
  ];
}

/** The county of the seat as the checked row on top (currentRow): seatCounty, or a firm profile's county. */
export function seatCurrentRow(spec: QuestionSpec): ChoiceOption | null {
  const f = spec.filters;
  const county = f.seatCounty ? String(f.seatCounty) : f.county && isFirmProfile(spec) ? String(f.county) : null;
  if (!county) return null;
  const words = seatCountyWords(county);
  return { value: CURRENT_ROW, label: `${words.charAt(0).toLocaleUpperCase("ro-RO")}${words.slice(1)}`, choice: { filter: "seatCounty", value: county } };
}
const isFirmProfile = (spec: QuestionSpec) => countyIsFirmSeat(spec, spec.dim === "supplier" ? "supplier" : "authority");

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
 * complete one first, the one after it on the same months; its free range
 * starts in 2019 (MIN_TREND_YEAR). Its complete year is the default years'
 * (defaultTrendYears, trend final §3.2: every channel's "complet până la" on
 * or after 31 Dec), when the periods are read: in January–March the year just
 * ended stays provisional until December's contracts are complete. The year
 * chart has intervals only (plan §4.3): one year is one bar, so "Toți anii ·
 * Ultimii 5 ani compleți · Ultimii 3 ani compleți".
 */
export function periodPresets(spec: QuestionSpec, span: CoverageSpan | null, year: number, periods: CoveragePeriods | null = null): { presets: PeriodPreset[]; value: string | null } {
  const last = span?.to ? Number(span.to.slice(0, 4)) : year;
  const partial = span?.to && !span.to.endsWith("-12-31") ? span.to : null;
  const settled = spec.block === "trend" ? defaultTrendYears(periods, (spec.dataset ?? "all") as "all" | "da" | "contracts")?.yearTo ?? null : null;
  const complete = settled !== null && settled < last ? settled : partial ? last - 1 : last;
  const until = partial ? dayWords(partial).replace(/ \d{4}$/, "") : null;
  const all: PeriodPreset = { value: "all", label: "Toți anii", ...(span?.from && span.to ? { detail: `${monthWords(span.from)} – ${dayWords(span.to)}` } : {}), period: undefined };
  const years = (value: string, label: string, n: number): PeriodPreset => {
    const from = Math.max(SERIES_FIRST_YEAR, complete - n + 1);
    return { value, label, detail: `${from}–${complete}`, period: { yearFrom: from, yearTo: complete } };
  };
  const presets: PeriodPreset[] = spec.block === "trend"
    ? [
      { value: "pair-1", label: `${complete - 1} și ${complete}`, detail: "ultimii doi ani compleți", period: { yearFrom: complete - 1, yearTo: complete } },
      // The year after the complete one (running, or ended but provisional) is compared on the same months
      // (trend-rules.ts trendFollows puts "Aceleași luni" back); a running year says how far its data go.
      ...(complete < last ? [{ value: "pair-0", label: `${complete} și ${complete + 1}`,
        detail: `pe aceleași luni${complete + 1 === last && until ? ` · ${last}: până la ${until}` : ""}`, period: { yearFrom: complete, yearTo: complete + 1 } }] : []),
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

/**
 * „Lună de lună” in the evolution's „Când?” (final timeseries §3.7; F3): the
 * last year of data (how far it goes), the one before, the last 12 months to
 * the month of the last data, and the last two years, each at most 36 months.
 */
export function seriesMonthPresets(spec: QuestionSpec, span: CoverageSpan | null, year: number): { presets: PeriodPreset[]; value: string | null } {
  const to = span?.to ?? `${year}-12-31`;
  const last = Number(to.slice(0, 4)), lastMonth = Number(to.slice(5, 7));
  const until = to.endsWith("-12-31") ? null : dayWords(to).replace(/ \d{4}$/, "");
  const from = lastMonth === 12 ? { y: last, m: 1 } : { y: last - 1, m: lastMonth + 1 };
  const presets: PeriodPreset[] = [
    { value: "m-current", label: String(last), ...(until ? { detail: `până la ${until}` } : {}), period: { yearFrom: last, yearTo: last } },
    { value: "m-previous", label: String(last - 1), period: { yearFrom: last - 1, yearTo: last - 1 } },
    { value: "m-12", label: "Ultimele 12 luni", detail: `${MONTH_SHORT[from.m - 1]} ${from.y} – ${MONTH_SHORT[lastMonth - 1]} ${last}`,
      period: { yearFrom: from.y, monthFrom: from.m, yearTo: last, monthTo: lastMonth } },
    { value: "m-two", label: `${last - 1}–${last}`, period: { yearFrom: last - 1, yearTo: last } },
  ];
  const f = spec.filters, same = (p: PeriodChoice | undefined) => p !== undefined && Number(f.yearFrom) === p.yearFrom && Number(f.yearTo) === p.yearTo
    && Number(f.monthFrom ?? 0) === (p.monthFrom ?? 0) && Number(f.monthTo ?? 0) === (p.monthTo ?? 0);
  return { presets, value: spec.timeseries?.grain === "month" ? presets.find((p) => same(p.period))?.value ?? null : null };
}
/** „Lună de lună” shows at most this many months (TIMESERIES_RULES.grain): a range typed in says so before it is used. */
export function seriesMonthsError(range: { yearFrom: string; yearTo: string; monthFrom: string; monthTo: string }): string | null {
  if (!range.yearFrom || !range.yearTo) return "Alege anul de început și anul de sfârșit.";
  const span = (Number(range.yearTo) - Number(range.yearFrom)) * 12 + Number(range.monthTo || 12) - Number(range.monthFrom || 1) + 1;
  return span > MAX_SERIES_MONTHS ? `„Lună de lună” arată cel mult ${MAX_SERIES_MONTHS} de luni. Alege o perioadă mai scurtă.` : null;
}

// --- The windows' counts (kit R5, plan §2.5; use-facet.ts asks for them)

/** Why an option the counts find empty cannot be chosen (R1: choosing it would answer nothing). */
const EMPTY_REASON: Record<FacetUnit, string> = {
  records: "Nicio înregistrare în selecția de acum.",
  institutions: "Nicio instituție în selecția de acum.",
  firms: "Nicio firmă în selecția de acum.",
  profiles: "Niciun profil în selecția de acum.",
};

/** The count of one value of a part, its share recomputed on `over` (a larger whole: the procedures among every purchase). */
function countOf(counts: FacetCounts, value: string, over?: number): { n: number; share: number } | null {
  const found = counts.options.find((o) => o.value === value);
  if (!found) return counts.part === "county" || counts.part === "seat" || counts.part === "years" ? { n: 0, share: 0 } : null;
  return over ? { n: found.n, share: over ? found.value_ron / over : 0 } : found;
}

/**
 * A window's options with their counts (kit R5): the pending mark while they
 * load; once read, „32,0% · 88” and the share bar, the first row (`valueOf`
 * gives undefined: the whole draft) its total alone. An option the counts find
 * empty is disabled with the reason (R1), unless it is the checked one or
 * `disable` is false (an empty year stays choosable, kit §3 item 12).
 * `valueOf` null: an option without a count (another key's row).
 */
export function countedOptions<T extends KitOption>(
  options: readonly T[], view: FacetView, valueOf: (option: T) => string | null | undefined,
  opts: { checked?: string | null; disable?: boolean; over?: number } = {},
): T[] {
  if (view.status === "none") return [...options];
  return options.map((option) => {
    const value = valueOf(option);
    if (value === null) return option;
    if (view.status === "loading") return { ...option, count: FACET_PENDING };
    const { counts } = view;
    if (value === undefined) return { ...option, count: facetTotalText(counts) };
    const count = countOf(counts, value, opts.over);
    if (!count) return option;
    const empty = count.n === 0 && opts.disable !== false && option.value !== opts.checked && !option.disabled;
    return { ...option, count: facetCountText(count), share: count.share, ...(empty ? { disabled: EMPTY_REASON[counts.unit] } : {}) };
  });
}

/** A window's rest row with its count („Alte instituții 4,1% · 34”): the counts' own rest. */
export function countedRest(rest: readonly KitRestRow[] | undefined, view: FacetView): KitRestRow[] | undefined {
  if (!rest) return rest;
  return rest.map((row) => {
    if (view.status === "loading") return { ...row, count: FACET_PENDING };
    const counted = view.status === "ready" && view.counts.rest?.label === row.label ? view.counts.rest : null;
    return counted ? { ...row, count: facetCountText(counted) } : row;
  });
}

/** A county's count beside its name in a place window's search („3,2% · 412”; a county the draft has no record in, 0). */
export function countySide(view: FacetView, county: string): string | undefined {
  if (view.status === "loading") return FACET_PENDING;
  if (view.status !== "ready") return undefined;
  return facetCountText(view.counts.options.find((o) => o.value === county) ?? { n: 0, share: 0 });
}

/** One value's count as a short share („45,3%”), for the segmented and the pills, pending while it loads. */
export function shareText(view: FacetView, value: string): string | undefined {
  if (view.status === "loading") return FACET_PENDING;
  if (view.status !== "ready") return undefined;
  const found = view.counts.options.find((o) => o.value === value);
  return found ? formatShare(found.share) : undefined;
}

/** Whether a value's count is 0 (R1: disabled with the reason), and that reason. */
export function emptyReason(view: FacetView, value: string): string | null {
  if (view.status !== "ready") return null;
  const found = view.counts.options.find((o) => o.value === value);
  return found && found.n === 0 ? EMPTY_REASON[view.counts.unit] : null;
}

/** The firms of each band of employees (kit §3 item 10: the number under each band), pending while they load. */
export function bandCount(view: FacetView, value: string): string | undefined {
  if (view.status === "loading") return FACET_PENDING;
  if (view.status !== "ready") return undefined;
  const found = view.counts.options.find((o) => o.value === value);
  return found ? formatInt(found.n) : undefined;
}

/** The period presets with the records of the years each holds (the whole draft for "Toți anii"). */
export function presetCounts(presets: readonly PeriodPreset[], view: FacetView): PeriodPreset[] {
  if (view.status === "loading") return presets.map((preset) => ({ ...preset, count: FACET_PENDING }));
  if (view.status === "none") return [...presets];
  const { counts } = view;
  return presets.map((preset) => {
    const p = preset.period;
    if (p === undefined) return { ...preset, count: facetTotalText(counts) };
    const from = p.yearFrom ?? -Infinity, to = p.yearTo ?? Infinity;
    const held = counts.options.filter((o) => Number(o.value) >= from && Number(o.value) <= to);
    const n = held.reduce((a, o) => a + o.n, 0), v = held.reduce((a, o) => a + o.value_ron, 0);
    const share = counts.total.value_ron ? v / counts.total.value_ron : 0;
    return { ...preset, count: facetCountText({ n, share }), share };
  });
}
