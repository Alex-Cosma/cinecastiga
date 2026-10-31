import type { BlockData, PartialYear, TrendRow } from "../../lib/ask/compile";
import type { EvidenceScope } from "../../lib/ask/evidence";
import { countWords, fileSlug, formatChange } from "../../lib/ask/answer-text";
import {
  TREND_ALL_CHANGES, TREND_CHANGE_LABELS, TREND_CHANGE_PHRASE, TREND_EQUAL_LABEL, TREND_FIRST_LABEL, TREND_LIST_LABELS, TREND_NOUN_WORDS, TREND_NO_RECORDS,
  firstTimeTip, firstTimeWords, trendBaseWords, trendGap, trendGroupLabel, trendNarrowed, trendNoun, type TrendNounWords,
} from "../../lib/ask/filters/defs/trend";
import { GLOSSARY } from "../../lib/glossary";
import { isWholeYear, monthsLabel } from "../../lib/ask/months-window";
import { DEFAULT_TREND_MIN_BASE, type AskSpec, type TrendChange } from "../../lib/ask/spec";
import type { TrendMemberPart, TrendPartTotals } from "../../lib/ask/trend-partition";
import {
  TREND_LISTS, foreignCountry, specTrendList, specTrendPart, trendGroupOfRow, trendPartLabel, trendRowLabels, type TrendList, type TrendRowFacts, type TrendRowLabel,
} from "../../lib/ask/trend-shared";
import { countyName } from "../../lib/counties";
import { cleanName, formatInt, formatRon } from "../../lib/format";
import { MONITORING_MEMBERS_MAX, membersTooManyWords, type MonitoringMembers } from "../../lib/monitoring-shared";
import type { RowFact } from "./answer/RowFacts";
import type { CountGroup } from "./builder/CountGroups";
import type { KitTip } from "./builder/kit-types";

/*
 * The trend's answer as words (plan §4.7 P6, P8; trend final §3.1, §3.4,
 * §4.4): the group buttons from the composition, the composition's head, the
 * rows of the list the applied question asks for, their labels and partner
 * line, a group's empty state and its total line. Pure: TrendAnswer.tsx draws
 * it, answer-csv.ts exports the same rows. Every list comes with the answer
 * (owner-R-facts-all-lists), so the applied spec alone chooses what is shown.
 */

export type TrendData = Extract<BlockData, { block: "trend" }>;
type Gender = TrendNounWords["gender"];
export type { TrendNounWords };
/** The rows' noun (trend final §1, defs/trend.ts); an answer stored before trend-2 has none: its dimension's. */
export function trendNounWords(data: Pick<TrendData, "noun">, spec: Pick<AskSpec, "dim">): TrendNounWords {
  return TREND_NOUN_WORDS[data.noun ?? (spec.dim === "county" ? "județe" : spec.dim === "supplier" ? "firme" : "instituții")];
}
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const none = (g: Gender) => g === "f" ? "Nicio" : "Niciun";
const novel = (g: Gender) => g === "f" ? "nouă" : "nou";
const every = (g: Gender) => g === "m" ? "Toți" : "Toate";

/** A year as the answer counted it: "2025", or "ian.–mai 2025" on the same months. */
export function periodWords(data: Pick<TrendData, "months">, year: number): string {
  const months = data.months;
  return months && !isWholeYear(months) ? `${monthsLabel(months)} ${year}` : String(year);
}

/**
 * An amount for the rows' columns: "481,7 mil.", "1,1 mld." without "lei"
 * (the total line says it once); under a million with its unit ("4.180 lei"),
 * so it never reads as millions beside "170,5 mil.".
 */
export const bareRon = (value: number): string => value >= 1e6 ? formatRon(value).replace(/ lei$/, "") : formatRon(value);

/** The partial-year mark of year A and of year B ("*" or ""): the note under the list says why. */
export type TrendStars = readonly [string, string];
const NO_STARS: TrendStars = ["", ""];
/** A partly covered endpoint year carries its "*" wherever it labels a sum (audit F19, trend final §4.3: also after `whole`). */
export function partialStars(data: Pick<TrendData, "yearA" | "yearB">, partial: readonly Pick<PartialYear, "year">[]): TrendStars {
  const star = (year: number) => partial.some((p) => p.year === year) ? "*" : "";
  return [star(data.yearA), star(data.yearB)];
}
/** A change: "+652,8 mil.", "−1,1 mld.", "0". */
export function signedRon(delta: number): string {
  if (delta === 0) return "0";
  return `${delta > 0 ? "+" : "−"}${bareRon(Math.abs(delta))}`;
}

/** The list the applied question shows, and its rows (an old answer: its only list). */
export function shownTrendList(data: TrendData, spec: Pick<AskSpec, "trend">): { list: TrendList; rows: TrendRow[] } {
  const asked = specTrendList(spec);
  const rows = data.groups?.[asked];
  if (rows) return { list: asked, rows };
  return { list: data.list ?? "all", rows: data.rowsTrend };
}

/** The buttons, in the kit's order: „Toate” first (a whole row on phones). */
const BUTTONS: readonly (TrendChange & TrendList)[] = ["all", "up", "new", "down", "gone"];

/**
 * A group's totals as a button counts them: the partition, in every order
 * (trend final §3.9 „Compoziția nu se schimbă”), so the five add up to
 * „Toate”. In percent the list holds the growths from the base; the total line
 * says how many of all the growths they are (trendTotal).
 */
function buttonTotals(data: TrendData, list: TrendList): TrendPartTotals | null {
  return data.composition?.[list] ?? null;
}
/** The totals of the part the list shows: in percent the growths from the base (composition.eligible). */
function listTotals(data: TrendData, list: TrendList): TrendPartTotals | undefined {
  const c = data.composition;
  return list === "up" ? c?.eligible ?? c?.up : c?.[list];
}

/** Non-breaking spaces: „28.670 · +45,3 mld.” breaks only after „· ”, never inside the count or the sum (trend final §4.8). */
const whole = (text: string) => text.replace(/ /g, "\u00a0");

/**
 * The five group buttons (CountGroups), from the composition the answer
 * already holds: the count and the change in lei, a group of 0 disabled with
 * why. Null for an answer without a composition (stored before trend-2, or a
 * watch's fixed members): it shows its one list.
 */
export function trendButtons(data: TrendData, spec: Pick<AskSpec, "dim">): CountGroup[] | null {
  if (!data.composition?.all) return null;
  const noun = trendNounWords(data, spec);
  return BUTTONS.map((list) => {
    const t = buttonTotals(data, list) ?? { count: 0, valueA: 0, valueB: 0 };
    return {
      value: list, name: TREND_CHANGE_LABELS[list], swatch: list,
      count: `${formatInt(t.count)}\u00a0· ${whole(signedRon(t.valueB - t.valueA))}`,
      ...(t.count === 0 ? { disabled: emptyTitle(list, noun, data) } : {}),
      ...(list === "all" ? { all: true } : {}),
    };
  });
}

/** „Toate · Prima dată în 2025” under „Noi” (trend final §3.8), when the answer counted the first-year ones. */
export function firstOptions(data: TrendData, list: TrendList, spec: Pick<AskSpec, "dim">): { value: TrendList; label: string; count: string; disabled?: string }[] | null {
  const c = data.composition;
  if ((list !== "new" && list !== "first") || !c?.new || !c.first || !data.groups?.first) return null;
  return [
    { value: "new", label: TREND_CHANGE_LABELS.all, count: formatInt(c.new.count) },
    { value: "first", label: `${TREND_FIRST_LABEL} în ${data.yearB}`, count: formatInt(c.first.count),
      ...(c.first.count === 0 ? { disabled: emptyTitle("first", trendNounWords(data, spec), data) } : {}) },
  ];
}

/**
 * „Firme noi față de 2024:” beside „Toate · Prima dată în 2025” (kit §4: „Noi” always with its year, but on
 * the short buttons); across other years „Firme fără înregistrări în 2023:” (trendGap).
 */
export function newSubLabel(data: Pick<TrendData, "noun" | "yearA" | "yearB">, spec: Pick<AskSpec, "dim">): string {
  const group = trendGap(data.yearA, data.yearB) ? trendGroupLabel("new", data.yearA, data.yearB).toLocaleLowerCase("ro-RO") : `noi față de ${data.yearA}`;
  return `${cap(trendNounWords(data, spec).many)} ${group}:`;
}

/**
 * The groups shown but empty, in one visible line under the buttons, their
 * reasons in its (?) (kit R1 „dezactivat, cu motivul în (?)”, trend final
 * §3.1): „Grupuri goale: Noi, Nu mai apar (?)”. A screen reader also hears each
 * reason with its button (aria-describedby).
 */
export function emptyGroupsLine(groups: readonly { name: string; disabled?: boolean | string }[]): { text: string; tip: KitTip } | null {
  const empty = groups.filter((g): g is { name: string; disabled: string } => typeof g.disabled === "string");
  if (!empty.length) return null;
  return {
    text: `${empty.length === 1 ? "Grup gol" : "Grupuri goale"}: ${empty.map((g) => g.name).join(", ")}`,
    tip: { title: empty.length === 1 ? "Grup gol" : "Grupuri goale", text: empty.map((g) => g.disabled).join(" ") },
  };
}

/**
 * "Firme în 2024 sau 2025: 96.929 (?)" above the buttons, with what the groups mean; on the same
 * months each year says them ("în ian.–mai 2024 sau ian.–mai 2025"), a partly covered one its "*".
 */
export function compositionHead(data: TrendData, spec: Pick<AskSpec, "dim">, stars: TrendStars = NO_STARS): { text: string; total: string; tip: KitTip } | null {
  const c = data.composition;
  if (!c?.all) return null;
  const noun = trendNounWords(data, spec);
  const [starA, starB] = stars;
  const equal = c.equal?.count ?? 0;
  const firms = noun.one === "firmă" || noun.one === "furnizor";
  return {
    text: `${cap(noun.many)} în ${periodWords(data, data.yearA)}${starA} sau ${periodWords(data, data.yearB)}${starB}:`,
    total: formatInt(c.all.count),
    tip: { title: "Grupuri", text: [
      `Fiecare ${noun.one} intră într-un singur grup.`,
      equal > 0 ? `${formatInt(equal)} ${equal === 1 ? "are" : "au"} aceeași valoare în ambii ani; ${equal === 1 ? "apare" : "apar"} doar la „Toate”.` : null,
      "Un contract intră întreg în anul atribuirii, chiar dacă durează ani: un salt vine des dintr-un singur contract.",
      firms ? "Firmele străine și cele fără CUI valid pot apărea sub mai multe nume." : null,
    ].filter(Boolean).join(" ") },
  };
}

/** The first sentence of a group's empty state; also why its button is disabled. */
function emptyTitle(list: TrendList, noun: TrendNounWords, data: Pick<TrendData, "yearA" | "yearB">): string {
  const g = noun.gender;
  switch (list) {
    case "new": return `${none(g)} ${noun.one} ${novel(g)} în această selecție.`;
    case "first": return `${none(g)} ${noun.one} ${g === "f" ? "aflată" : "aflat"} prima dată în date în ${data.yearB}.`;
    case "gone": return `${none(g)} ${noun.one} care să nu mai apară.`;
    case "up": return `${none(g)} ${noun.one} în creștere în această selecție.`;
    case "down": return `${none(g)} ${noun.one} în scădere în această selecție.`;
    case "all": return `${none(g)} ${noun.one} în această selecție.`;
  }
}

/** What an empty group says and the way out (trend final §4.4): a list of the same answer, or a lower base (a new question). */
export interface TrendEmpty { message: string; to?: { label: string; list: TrendList }; base?: { label: string; minBase: number } }
const BASES = [100_000, 1_000_000, 10_000_000] as const;
export function trendEmpty(data: TrendData, list: TrendList, spec: Pick<AskSpec, "dim" | "trend">): TrendEmpty {
  const noun = trendNounWords(data, spec);
  const all = { label: `Vezi ${TREND_ALL_CHANGES.toLocaleLowerCase("ro-RO")}`, list: "all" as const };
  const minBase = spec.trend?.order === "percent" ? spec.trend.minBase ?? DEFAULT_TREND_MIN_BASE : null;
  if (list === "up" && minBase !== null) {
    const lower = [...BASES].reverse().find((base) => base < minBase);
    return {
      message: `${none(noun.gender)} ${noun.one} cu cel puțin ${formatRon(minBase)} în ${periodWords(data, data.yearA)}.`,
      ...(lower ? { base: { label: `Coboară pragul la ${formatRon(lower)}`, minBase: lower } } : {}),
    };
  }
  if (list === "gone") return {
    message: `${emptyTitle(list, noun, data)} ${every(noun.gender)} ${noun.the} din ${periodWords(data, data.yearA)} au înregistrări și în ${periodWords(data, data.yearB)}, în această selecție.`,
    to: all,
  };
  if (list === "first") return { message: emptyTitle(list, noun, data), to: { label: `Arată ${every(noun.gender).toLowerCase()} ${noun.the} noi`, list: "new" } };
  return { message: emptyTitle(list, noun, data), ...(list === "all" ? {} : { to: all }) };
}

/** A row label in words (kit §4 v2: „1 contract: 66%”), amber when it asks for care. */
export function labelFact(label: TrendRowLabel): RowFact {
  switch (label.kind) {
    case "noValidCui": return { text: "fără CUI valid", tone: "caveat" };
    case "firstYear": return { text: firstTimeWords(label.year) };
    case "activeSince": return { text: `activă din ${label.year}` };
    case "activeIn": return { text: `activă în ${label.year}` };
    case "oneRecord": return { text: `${label.src === "da" ? "1 achiziție directă" : "1 contract"}: ${Math.round(label.share * 100)}%`, tone: "caveat" };
    case "joint": return { text: "în asociere" };
  }
}

/**
 * The (?) of „Prima dată” (kit §5 decision 7: one glossary text): the strip's „Toate · Prima dată”
 * and the rows' label under the list, as the sentence's fixed phrase; a narrower selection adds that
 * the first record is the archive's (trend final §3.8).
 */
export function firstTimeKitTip(spec: Pick<AskSpec, "dim" | "filters">): KitTip {
  return trendNarrowed(spec) ? { title: TREND_FIRST_LABEL, text: firstTimeTip(true) } : { id: "trend-prima-data" };
}

/** Each label kind once under the list, with its (?), so ten rows do not carry thirty tips (kit mock „mk-legend”). */
export function labelLegend(kinds: ReadonlySet<TrendRowLabel["kind"]>, data: Pick<TrendData, "yearA" | "yearB" | "months">,
  spec: Pick<AskSpec, "dim" | "filters"> = { filters: {} }): { fact: RowFact; tip: KitTip }[] {
  const a = periodWords(data, data.yearA), b = periodWords(data, data.yearB);
  const legend: [TrendRowLabel["kind"], RowFact, KitTip][] = [
    ["noValidCui", { text: "fără CUI valid", tone: "caveat" }, { title: "Fără CUI valid",
      text: "Sursa nu dă un cod fiscal valid. Aceeași firmă poate avea mai multe intrări, deci „nouă” sau „nu mai apare” poate fi doar o altă intrare a ei." }],
    ["firstYear", { text: firstTimeWords(data.yearB) }, firstTimeKitTip(spec)],
    ["activeSince", { text: "activă din …" }, { title: "Activă din …",
      text: `Prima înregistrare din datele noastre e mai veche; în ${a} nu are niciuna, în această selecție.` }],
    ["activeIn", { text: "activă în …" }, { title: "Activă în …",
      text: `Are înregistrări după ${data.yearB}, oriunde în datele noastre (nu neapărat în această selecție).` }],
    ["oneRecord", { text: "1 contract: N%", tone: "caveat" }, { title: "1 contract: N%",
      text: `Cea mai mare înregistrare a anului care produce schimbarea face N% din ea: ${b} la creșteri și noi, ${a} la scăderi. Indiciu de verificat, nu concluzie.` }],
    ["joint", { text: "în asociere" }, { title: "În asociere",
      text: "Peste jumătate din valoarea anului vine din contracte cu mai mulți câștigători; valoarea e împărțită egal." }],
  ];
  return legend.filter(([kind]) => kinds.has(kind)).map(([, fact, tip]) => ({ fact, tip }));
}

/**
 * The growths in percent, under their list (trend final §3.9): who the
 * percent is counted for, and that a jump of tens of times is a lead to check
 * in the sources, not a conclusion. Null on any other list or order.
 */
export function percentTerm(data: TrendData, list: TrendList, spec: Pick<AskSpec, "dim" | "trend">): { text: string; tip: KitTip } | null {
  if (list !== "up" || spec.trend?.order !== "percent" || !data.composition?.eligible) return null;
  const noun = trendNounWords(data, spec);
  const base = formatRon(spec.trend.minBase ?? DEFAULT_TREND_MIN_BASE);
  return { text: "Creșterea în procente", tip: { title: "Creșterea în procente", text:
    `Procentul se calculează doar pentru ${noun.the} ${noun.gender === "m" ? "prezenți" : "prezente"} în ambii ani, de la pragul ales (${base} în ${periodWords(data, data.yearA)}). `
    + "Un salt de zeci de ori vine de obicei dintr-un singur contract sau dintr-o asociere: e un indiciu de verificat în surse, nu o concluzie." } };
}

/**
 * What „Noi” and „Nu mai apar” mean (the glossary's words), beside the labels under their list: new to
 * the selection, not founded; gone, not closed. A partly covered year keeps its "*"; with a domain, the
 * new ones are new to its CPV codes, as the institution chose them (trend final §3.5).
 */
export function groupTerm(list: TrendList, data: Pick<TrendData, "yearA" | "yearB" | "noun">, spec: Pick<AskSpec, "dim" | "filters"> = { filters: {} },
  stars: TrendStars = NO_STARS): { text: string; tip: KitTip } | null {
  const a = `${data.yearA}${stars[0]}`, b = `${data.yearB}${stars[1]}`;
  if (list === "gone") return { text: trendGroupLabel("gone", a, b), tip: { id: "nu-mai-apare" } };
  if (list !== "new" && list !== "first") return null;
  const text = trendGroupLabel("new", a, b);
  const cpv = spec.filters.cpvTerm;
  if (cpv === undefined || cpv === null || cpv === "") return { text, tip: { id: "firma-noua" } };
  const noun = trendNounWords(data, spec);
  const did = noun.one === "firmă" || noun.one === "furnizor" ? "lucrat" : "cumpărat";
  return { text, tip: { title: GLOSSARY["firma-noua"].title, text:
    `${GLOSSARY["firma-noua"].text} ${cap(novel(noun.gender))} în acest domeniu, după codul CPV ales de instituție. Poate să fi ${did} înainte sub alt cod.` } };
}

let regions: Intl.DisplayNames | null | undefined;
/** A foreign firm's country in Romanian ("Franța"), else its code. */
function countryWords(code: string): string {
  if (regions === undefined) {
    try { regions = new Intl.DisplayNames(["ro"], { type: "region" }); } catch { regions = null; }
  }
  try { return regions?.of(code) ?? code; } catch { return code; }
}

/** One row as the screen draws it (trend final §3.4, §4.8). */
export interface TrendRowView {
  key: string;
  name: string;
  href: string | null;
  /** An institution's county, a firm's seat (F4, owner-seat-switch), a foreign firm's country. */
  place: string | null;
  /** Its group, for the swatch on „Toate”, and in words for a screen reader. */
  group: ReturnType<typeof trendGroupOfRow>;
  groupWords: string;
  facts: RowFact[];
  kinds: TrendRowLabel["kind"][];
  /** "în 2024: 46% de la …" / "39% de la …". */
  partner: string | null;
  /** The two years (lists with both values) or the one value of a new or gone row in its own list. */
  years: { label: string; value: string }[];
  single: { value: string; when: string } | null;
  delta: string;
  /** "+136%", "×67" (from ten times), "<−99%" (a fall that leaves money), "nouă", "nu mai apare"; with its words for a screen reader. */
  pct: { text: string; words: string } | null;
  /** The growths ordered in percent: the percent is the main figure, the change in lei under it (trend final §3.9 Afișare). */
  pctFirst: boolean;
  up: boolean;
  scope: EvidenceScope;
  scopeLabel: string;
}

/** A row's group for a screen reader, in the singular of the vocabulary's words. */
const GROUP_WORDS: Record<ReturnType<typeof trendGroupOfRow>, string> = {
  up: TREND_CHANGE_PHRASE.up, new: "nouă", down: TREND_CHANGE_PHRASE.down, gone: "nu mai apare", equal: TREND_EQUAL_LABEL.toLocaleLowerCase("ro-RO"),
};
export const rowGroupWords = (group: ReturnType<typeof trendGroupOfRow>) => GROUP_WORDS[group];

/** A change in percent: rounded to the unit, but a fall that leaves money is never „−100%” (−99,998% rounds to it). */
function percentChange(row: Pick<TrendRow, "valueA" | "valueB">, ratio: number): { text: string; words: string } {
  const change = (ratio - 1) * 100;
  if (row.valueB > 0 && Math.round(change) <= -100) return { text: "<−99%", words: "scădere de peste 99%" };
  return { text: formatChange(change), words: formatChange(change) };
}

/** The part of a row's drawer label that names the answer's years: „ALFA · ian.–mai 2025 și ian.–mai 2026”. */
const scopeYears = (data: Pick<TrendData, "yearA" | "yearB" | "months">) => ` · ${periodWords(data, data.yearA)} și ${periodWords(data, data.yearB)}`;
/**
 * A row's drawer label after its answer was reloaded on other months (409):
 * the years in the new answer's words, so the drawer never names the months it
 * no longer lists. Any other label stays as it was.
 */
export function retimeScopeLabel(label: string, before: Pick<TrendData, "yearA" | "yearB" | "months">, after: Pick<TrendData, "yearA" | "yearB" | "months">): string {
  const old = scopeYears(before);
  return label.endsWith(old) ? `${label.slice(0, -old.length)}${scopeYears(after)}` : label;
}

export function trendRowView(row: TrendRow, list: TrendList, data: TrendData, spec: Pick<AskSpec, "dim" | "trend">, stars: TrendStars = NO_STARS): TrendRowView {
  const facts: TrendRowFacts | undefined = row.entityId ? data.rowFacts?.[row.entityId] : undefined;
  const noun = trendNounWords(data, spec);
  const labels = facts ? trendRowLabels(row, facts, data) : [];
  const delta = row.valueB - row.valueA;
  const group = trendGroupOfRow(row);
  const a = periodWords(data, data.yearA), b = periodWords(data, data.yearB);
  const [starA, starB] = stars;
  const ratio = row.valueA > 0 ? row.valueB / row.valueA : null;
  // Across other years (trendGap) a row without records in one year is neither new nor gone: its years' line says the 0.
  const gap = trendGap(data.yearA, data.yearB);
  const groupWords = gap && (group === "new" || group === "gone") ? `${TREND_NO_RECORDS.toLocaleLowerCase("ro-RO")} în ${group === "new" ? a : b}` : rowGroupWords(group);
  const pct: TrendRowView["pct"] = gap && (group === "new" || group === "gone") ? null
    : group === "new" ? { text: novel(noun.gender), words: novel(noun.gender) }
    : group === "gone" ? { text: "nu mai apare", words: "nu mai apare" }
      : ratio !== null && ratio >= 10 ? { text: `×${formatInt(Math.floor(ratio))}`, words: `de ${countWords(Math.floor(ratio), "dată", "ori")} mai mult` }
        : ratio !== null ? percentChange(row, ratio) : null;
  // The partner of the year that makes the change; its year is said where it is not the one the list is about.
  const partnerYear = facts ? (facts.year === data.yearB ? b : a) : null;
  const sayYear = list === "all" || (facts !== undefined && facts.year !== data.yearB);
  const partner = facts?.partner && facts.value > 0
    ? `${sayYear ? `în ${partnerYear}: ` : ""}${Math.round((facts.partner.value / facts.value) * 100)}% de la ${cleanName(facts.partner.name)}` : null;
  const single = (list === "new" || list === "first") && group === "new" ? { value: bareRon(row.valueB), when: `în ${b}${starB}` }
    : list === "gone" && group === "gone" ? { value: bareRon(row.valueA), when: `în ${a}${starA}` } : null;
  const country = facts ? foreignCountry(facts) : null;
  // A firm's county is its seat since F4 (owner-seat-switch, decision TB-county-firm flipped): beside it as an institution's.
  const place = spec.dim === "county" ? null : country ? countryWords(country) : countyName(row.county);
  // A county is named as the pages spell it (lib/counties.ts); its scope below keeps the data's spelling.
  const name = row.entityId ? cleanName(row.name) : countyName(row.name);
  return {
    key: row.entityId ?? row.name, name, href: row.entityId ? `/entitati/${row.entityId}` : null, place, group, groupWords,
    facts: labels.map(labelFact), kinds: labels.map((l) => l.kind), partner,
    years: single ? [] : [{ label: `${a}${starA}`, value: bareRon(row.valueA) }, { label: `${b}${starB}`, value: bareRon(row.valueB) }],
    single, delta: single ? single.value : signedRon(delta), pct: single ? null : pct,
    pctFirst: !single && list === "up" && spec.trend?.order === "percent", up: delta >= 0,
    scope: spec.dim === "county" || !row.entityId ? { county: row.name } : { entityIds: [row.entityId], role: spec.dim === "supplier" ? "supplier" : "authority" },
    scopeLabel: `${name}${scopeYears(data)}`,
  };
}

/**
 * The group's total line (G8): who is in it and their sums, in the answer's
 * months; a partly covered year with its "*". `unit` closes a line of two
 * values ("lei"), unless its last value already says it.
 */
export interface TrendTotal { lead: string; values: { label: string | null; value: string }[]; unit: string }
export function trendTotal(data: TrendData, list: TrendList, spec: Pick<AskSpec, "dim" | "trend">, stars: TrendStars = NO_STARS): TrendTotal | null {
  const c = data.composition;
  const t = listTotals(data, list);
  if (!t) return null;
  const noun = trendNounWords(data, spec);
  const [starA, starB] = stars;
  const a = `${periodWords(data, data.yearA)}${starA}`, b = `${periodWords(data, data.yearB)}${starB}`;
  const change: TrendChange = list === "first" ? "new" : list;
  const minBase = spec.trend?.order === "percent" ? spec.trend.minBase ?? DEFAULT_TREND_MIN_BASE : null;
  // trendPartLabel's words, with the answer's months and stars.
  const base = list === "up" && c?.eligible && minBase ? ` ${trendBaseWords(minBase, a)}` : "";
  const label = `${trendGroupLabel(change, `${data.yearA}${starA}`, `${data.yearB}${starB}`)}${list === "first" ? ` · ${firstTimeWords(data.yearB)}` : ""}${base}`;
  const of = base && c?.up ? `, din ${formatInt(c.up.count)}` : "";
  const values = list === "new" || list === "first" ? [{ label: null, value: `${formatRon(t.valueB)} în ${b}` }]
    : list === "gone" ? [{ label: null, value: `${formatRon(t.valueA)} în ${a}` }]
      : [{ label: a, value: bareRon(t.valueA) }, { label: `→ ${b}`, value: bareRon(t.valueB) }];
  return { lead: `${label}: ${countWords(t.count, noun.one, noun.many)}${of}`, values, unit: values.length === 2 && !values[1]!.value.endsWith(" lei") ? " lei" : "" };
}

/** The rows left out of the shown list: "alte 96.919 de firme". */
export function trendRest(data: TrendData, list: TrendList, shown: number, spec: Pick<AskSpec, "dim">): string | null {
  const total = listTotals(data, list)?.count;
  if (total === undefined || total <= shown) return null;
  const noun = trendNounWords(data, spec);
  const rest = total - shown;
  const other = noun.gender === "m" ? ["un alt", "alți"] : noun.gender === "f" ? ["o altă", "alte"] : ["un alt", "alte"];
  return rest === 1 ? `${other[0]} ${noun.one}` : `${other[1]} ${countWords(rest, noun.one, noun.many)}`;
}

/** The firms an employees band leaves out of this list for want of a filing (trend final §3.10). */
export function withoutFilingWords(data: TrendData, list: TrendList): string | null {
  const n = data.withoutFiling?.[list];
  return n ? `Fără bilanț, nu intră: ${countWords(n, "firmă", "firme")}` : null;
}

/**
 * „Urmărește” on a group (plan §2.8, §4.7): the watch fixes the group's members
 * when it is activated (the server, from the same partition), at most
 * MONITORING_MEMBERS_MAX; the answer already knows the group's size, so a
 * group too large (or empty) says why before the setup page. Null on „Toate”,
 * which stays a live answer.
 */
export function trendWatch(data: TrendData, spec: Pick<AskSpec, "dim" | "trend">): { label: string; blocked: string | null } | null {
  const part = specTrendPart(spec);
  if (part === "all" || !data.composition) return null;
  const count = data.composition[part]?.count;
  return { label: "Urmărește grupa", blocked: count === undefined ? null : groupWatchBlocked(watchRole(spec), count) };
}

const watchRole = (spec: Pick<AskSpec, "dim">): MonitoringMembers["role"] => spec.dim === "county" ? "county" : spec.dim === "supplier" ? "supplier" : "authority";
/** Why a group of this size cannot be followed (before the setup page, which would answer 422): over MONITORING_MEMBERS_MAX, or empty. */
export function groupWatchBlocked(role: MonitoringMembers["role"], members: number): string | null {
  return members > MONITORING_MEMBERS_MAX ? membersTooManyWords(role, members) : members === 0 ? "Grupa nu are niciun membru în această selecție." : null;
}
/** The drawer's „Urmărește această selecție” on a group's own records (DrillResult.group): the same limit as „Urmărește grupa”. */
export function drawerWatchBlocked(spec: Pick<AskSpec, "dim">, group: { members: number } | undefined): string | null {
  return group ? groupWatchBlocked(watchRole(spec), group.members) : null;
}

/** The setup of a watch on a group (plan §2.8): what activation fixes, before it does. Null on any other question. */
export function trendWatchNote(spec: Pick<AskSpec, "block" | "dim" | "filters" | "trend">): string | null {
  const part = spec.block === "trend" ? specTrendPart(spec) : "all";
  if (part === "all") return null;
  const who = spec.dim === "county" ? "Județele" : spec.dim === "supplier" ? "Firmele" : "Instituțiile";
  return `${who} grupei „${trendPartLabel(part, spec)}” se fixează la activare; cele care intră sau ies din grupă apar doar ca notă.`;
}

/**
 * The header of a group's source drawer (plan §4.7, F1b-t-not-yet; DECISIONS TB-header-words): which
 * group by the name its chip, watch and notes say, how many members in the selection's noun (furnizori
 * of a chosen buyer, clienți of a chosen firm), its records' value and the selection's
 * („Grupa „Noi față de 2024”: 17.633 de firme · 11 mld. lei din 141,9 mld. lei”).
 */
export function trendGroupHeader(spec: Pick<AskSpec, "dim" | "filters" | "trend">,
  group: { part: TrendMemberPart; members: number; selection: { value: string } | null }, value: string): string {
  const noun = TREND_NOUN_WORDS[trendNoun(spec)];
  const of = group.selection ? ` din ${formatRon(Number(group.selection.value))}` : "";
  return `Grupa „${trendPartLabel(group.part, spec)}”: ${countWords(group.members, noun.one, noun.many)} · ${formatRon(Number(value))}${of}`;
}

/** A list's short name in the shown result's file name: „noi”, „prima-data”, „nu-mai-apar” (its `grupa` column says the part's name). */
export const TREND_LIST_CSV = Object.fromEntries(TREND_LISTS.map((list) => [list, fileSlug(TREND_LIST_LABELS[list])])) as Record<TrendList, string>;
