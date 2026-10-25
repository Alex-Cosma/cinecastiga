import type { BlockData, TrendRow } from "../../lib/ask/compile";
import type { EvidenceScope } from "../../lib/ask/evidence";
import { countWords, formatChange } from "../../lib/ask/answer-text";
import { TREND_CHANGE_LABELS, trendGroupLabel } from "../../lib/ask/filters/defs/trend";
import { isWholeYear, monthsLabel } from "../../lib/ask/months-window";
import { DEFAULT_TREND_MIN_BASE, type AskSpec, type TrendChange } from "../../lib/ask/spec";
import type { TrendMemberPart, TrendNoun, TrendPartTotals } from "../../lib/ask/trend-partition";
import { specTrendList, trendGroupOfRow, trendRowLabels, type TrendList, type TrendRowFacts, type TrendRowLabel } from "../../lib/ask/trend-shared";
import { cleanName, formatInt, formatRon } from "../../lib/format";
import { MONITORING_MEMBERS_MAX, membersTooManyWords } from "../../lib/monitoring-shared";
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
type Gender = "f" | "m" | "n";
/** The rows' noun (trend final §1): one, many, many with the article, and its gender ("Nicio firmă nouă", "Niciun furnizor nou"). */
export interface TrendNounWords { one: string; many: string; the: string; gender: Gender }
const NOUNS: Record<TrendNoun, TrendNounWords> = {
  firme: { one: "firmă", many: "firme", the: "firmele", gender: "f" },
  furnizori: { one: "furnizor", many: "furnizori", the: "furnizorii", gender: "m" },
  instituții: { one: "instituție", many: "instituții", the: "instituțiile", gender: "f" },
  clienți: { one: "client", many: "clienți", the: "clienții", gender: "m" },
  județe: { one: "județ", many: "județe", the: "județele", gender: "n" },
};
/** The answer's noun; an answer stored before trend-2 has none: its dimension's. */
export function trendNounWords(data: Pick<TrendData, "noun">, spec: Pick<AskSpec, "dim">): TrendNounWords {
  return NOUNS[data.noun ?? (spec.dim === "county" ? "județe" : spec.dim === "supplier" ? "firme" : "instituții")];
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

/** An amount without its unit, for the rows' columns ("481,7 mil.", "1,1 mld."); the total line says "lei". */
export const bareRon = (value: number): string => formatRon(value).replace(/ lei$/, "");
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

/** A group's totals as a button counts them: with the order in percent, the growths are those from the base (composition.eligible). */
function buttonTotals(data: TrendData, list: TrendList): TrendPartTotals | null {
  const c = data.composition ?? {};
  return (list === "up" ? c.eligible ?? c.up : c[list]) ?? null;
}

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
      count: `${formatInt(t.count)} · ${signedRon(t.valueB - t.valueA)}`,
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
    { value: "new", label: "Toate", count: formatInt(c.new.count) },
    { value: "first", label: `Prima dată în ${data.yearB}`, count: formatInt(c.first.count),
      ...(c.first.count === 0 ? { disabled: emptyTitle("first", trendNounWords(data, spec), data) } : {}) },
  ];
}

/** "Firme în 2024 sau 2025: 96.929 (?)" above the buttons, with what the groups mean. */
export function compositionHead(data: TrendData, spec: Pick<AskSpec, "dim">): { text: string; total: string; tip: KitTip } | null {
  const c = data.composition;
  if (!c?.all) return null;
  const noun = trendNounWords(data, spec);
  const months = data.months && !isWholeYear(data.months) ? `${monthsLabel(data.months)} ` : "";
  const equal = c.equal?.count ?? 0;
  const firms = noun.one === "firmă" || noun.one === "furnizor";
  return {
    text: `${cap(noun.many)} în ${months}${data.yearA} sau ${data.yearB}:`,
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
  const all = { label: "Vezi toate schimbările", list: "all" as const };
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
    case "firstYear": return { text: `prima dată în ${label.year}` };
    case "activeSince": return { text: `activă din ${label.year}` };
    case "activeIn": return { text: `activă în ${label.year}` };
    case "oneRecord": return { text: `${label.src === "da" ? "1 achiziție directă" : "1 contract"}: ${Math.round(label.share * 100)}%`, tone: "caveat" };
    case "joint": return { text: "în asociere" };
  }
}

/** Each label kind once under the list, with its (?), so ten rows do not carry thirty tips (kit mock „mk-legend”). */
export function labelLegend(kinds: ReadonlySet<TrendRowLabel["kind"]>, data: Pick<TrendData, "yearA" | "yearB" | "months">): { fact: RowFact; tip: KitTip }[] {
  const a = periodWords(data, data.yearA), b = periodWords(data, data.yearB);
  const legend: [TrendRowLabel["kind"], RowFact, KitTip][] = [
    ["noValidCui", { text: "fără CUI valid", tone: "caveat" }, { title: "Fără CUI valid",
      text: "Sursa nu dă un cod fiscal valid. Aceeași firmă poate avea mai multe intrări, deci „nouă” sau „nu mai apare” poate fi doar o altă intrare a ei." }],
    ["firstYear", { text: `prima dată în ${data.yearB}` }, { title: "Prima dată",
      text: `Prima înregistrare din datele noastre e în ${data.yearB}. Nu e data înființării.` }],
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
  /** An institution's county, a foreign firm's country; never a county beside a firm (owner-seat-switch, until F4). */
  place: string | null;
  /** Its group, for the swatch on „Toate”. */
  group: ReturnType<typeof trendGroupOfRow>;
  facts: RowFact[];
  kinds: TrendRowLabel["kind"][];
  /** "în 2024: 46% de la …" / "39% de la …". */
  partner: string | null;
  /** The two years (lists with both values) or the one value of a new or gone row in its own list. */
  years: { label: string; value: string }[];
  single: { value: string; when: string } | null;
  delta: string;
  /** "+136%", "×67" (from ten times), "nouă", "nu mai apare"; with its words for a screen reader. */
  pct: { text: string; words: string } | null;
  up: boolean;
  scope: EvidenceScope;
  scopeLabel: string;
}

const GROUP_WORDS: Record<ReturnType<typeof trendGroupOfRow>, string> = { up: "creștere", new: "nouă", down: "scădere", gone: "nu mai apare", equal: "aceeași valoare" };
export const rowGroupWords = (group: ReturnType<typeof trendGroupOfRow>) => GROUP_WORDS[group];

export function trendRowView(row: TrendRow, list: TrendList, data: TrendData, spec: Pick<AskSpec, "dim">): TrendRowView {
  const facts: TrendRowFacts | undefined = row.entityId ? data.rowFacts?.[row.entityId] : undefined;
  const noun = trendNounWords(data, spec);
  const labels = facts ? trendRowLabels(row, facts, data) : [];
  const delta = row.valueB - row.valueA;
  const group = trendGroupOfRow(row);
  const a = periodWords(data, data.yearA), b = periodWords(data, data.yearB);
  const ratio = row.valueA > 0 ? row.valueB / row.valueA : null;
  const pct: TrendRowView["pct"] = group === "new" ? { text: novel(noun.gender), words: novel(noun.gender) }
    : group === "gone" ? { text: "nu mai apare", words: "nu mai apare" }
      : ratio !== null && ratio >= 10 ? { text: `×${formatInt(Math.floor(ratio))}`, words: `de ${countWords(Math.floor(ratio), "dată", "ori")} mai mult` }
        : ratio !== null ? { text: formatChange((ratio - 1) * 100), words: formatChange((ratio - 1) * 100) } : null;
  // The partner of the year that makes the change; its year is said where it is not the one the list is about.
  const partnerYear = facts ? (facts.year === data.yearB ? b : a) : null;
  const sayYear = list === "all" || (facts !== undefined && facts.year !== data.yearB);
  const partner = facts?.partner && facts.value > 0
    ? `${sayYear ? `în ${partnerYear}: ` : ""}${Math.round((facts.partner.value / facts.value) * 100)}% de la ${cleanName(facts.partner.name)}` : null;
  const single = (list === "new" || list === "first") && group === "new" ? { value: bareRon(row.valueB), when: `în ${b}` }
    : list === "gone" && group === "gone" ? { value: bareRon(row.valueA), when: `în ${a}` } : null;
  const place = spec.dim === "county" ? null : facts?.country ? countryWords(facts.country) : spec.dim === "supplier" ? null : row.county;
  const name = row.entityId ? cleanName(row.name) : row.name;
  return {
    key: row.entityId ?? row.name, name, href: row.entityId ? `/entitati/${row.entityId}` : null, place, group,
    facts: labels.map(labelFact), kinds: labels.map((l) => l.kind), partner,
    years: single ? [] : [{ label: a, value: bareRon(row.valueA) }, { label: b, value: bareRon(row.valueB) }],
    single, delta: single ? single.value : signedRon(delta), pct: single ? null : pct, up: delta >= 0,
    scope: spec.dim === "county" || !row.entityId ? { county: row.name } : { entityIds: [row.entityId], role: spec.dim === "supplier" ? "supplier" : "authority" },
    scopeLabel: `${name} · ${a} și ${b}`,
  };
}

/** The group's total line (G8): who is in it and their sums, in the answer's months. */
export interface TrendTotal { lead: string; values: { label: string | null; value: string }[] }
export function trendTotal(data: TrendData, list: TrendList, spec: Pick<AskSpec, "dim" | "trend">): TrendTotal | null {
  const c = data.composition;
  const t = c ? (list === "up" ? c.eligible ?? c.up : c[list]) : undefined;
  if (!t) return null;
  const noun = trendNounWords(data, spec);
  const a = periodWords(data, data.yearA), b = periodWords(data, data.yearB);
  const change: TrendChange = list === "first" ? "new" : list;
  const minBase = spec.trend?.order === "percent" ? spec.trend.minBase ?? DEFAULT_TREND_MIN_BASE : null;
  const base = list === "up" && c?.eligible && minBase ? ` de la cel puțin ${formatRon(minBase)} în ${a}` : "";
  const label = `${trendGroupLabel(change, data.yearA, data.yearB)}${list === "first" ? ` · prima dată în ${data.yearB}` : ""}${base}`;
  const of = base && c?.up ? `, din ${formatInt(c.up.count)}` : "";
  const values = list === "new" || list === "first" ? [{ label: null, value: `${formatRon(t.valueB)} în ${b}` }]
    : list === "gone" ? [{ label: null, value: `${formatRon(t.valueA)} în ${a}` }]
      : [{ label: a, value: bareRon(t.valueA) }, { label: `→ ${b}`, value: bareRon(t.valueB) }];
  return { lead: `${label}: ${countWords(t.count, noun.one, noun.many)}${of}`, values };
}

/** The rows left out of the shown list: "alte 96.919 de firme". */
export function trendRest(data: TrendData, list: TrendList, shown: number, spec: Pick<AskSpec, "dim">): string | null {
  const total = (list === "up" ? data.composition?.eligible ?? data.composition?.up : data.composition?.[list])?.count;
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
  const list = specTrendList(spec);
  if (list === "all" || !data.composition) return null;
  const count = (list === "up" && spec.trend?.order === "percent" ? data.composition.eligible : data.composition[list])?.count;
  const role = spec.dim === "county" ? "county" : spec.dim === "supplier" ? "supplier" : "authority";
  const blocked = count === undefined ? null : count > MONITORING_MEMBERS_MAX ? membersTooManyWords(role, count)
    : count === 0 ? "Grupa nu are niciun membru în această selecție." : null;
  return { label: "Urmărește grupa", blocked };
}

/** The setup of a watch on a group (plan §2.8): what activation fixes, before it does. Null on any other question. */
export function trendWatchNote(spec: Pick<AskSpec, "block" | "dim" | "filters" | "trend">): string | null {
  const list = spec.block === "trend" ? specTrendList(spec) : "all";
  if (list === "all") return null;
  const who = spec.dim === "county" ? "Județele" : spec.dim === "supplier" ? "Firmele" : "Instituțiile";
  const { yearFrom: a, yearTo: b } = spec.filters;
  const label = `${trendGroupLabel(list === "first" ? "new" : list, a, b)}${list === "first" && b ? ` · prima dată în ${b}` : ""}`;
  return `${who} grupei „${label}” se fixează la activare; cele care intră sau ies din grupă apar doar ca notă.`;
}

/**
 * The header of a group's source drawer (plan §4.7, F1b-t-not-yet): which
 * group, how many members, its records' value and the selection's
 * („Grupa „Noi față de 2024”: 17.633 de firme · 11 mld. lei din 141,9 mld. lei”).
 */
export function trendGroupHeader(spec: Pick<AskSpec, "dim" | "filters" | "trend">,
  group: { part: TrendMemberPart; members: number; selection: { value: string } | null }, value: string): string {
  const [one, many] = spec.dim === "county" ? ["județ", "județe"] : spec.dim === "supplier" ? ["firmă", "firme"] : ["instituție", "instituții"];
  const { yearFrom: a, yearTo: b } = spec.filters;
  const label = group.part === "eligible"
    ? `${TREND_CHANGE_LABELS.up} de la cel puțin ${formatRon(spec.trend?.minBase ?? DEFAULT_TREND_MIN_BASE)}${a ? ` în ${a}` : ""}`
    : group.part === "first" ? `${trendGroupLabel("new", a, b)} · prima dată${b ? ` în ${b}` : ""}` : trendGroupLabel(group.part, a, b);
  const of = group.selection ? ` din ${formatRon(Number(group.selection.value))}` : "";
  return `Grupa „${label}”: ${countWords(group.members, one!, many!)} · ${formatRon(Number(value))}${of}`;
}

/** The group in words for the shown result's CSV and its file name: „noi”, „prima-data”, „nu-mai-apar”. */
export const TREND_LIST_CSV: Record<TrendList, string> = { all: "toate", up: "cresteri", new: "noi", first: "prima-data", down: "scaderi", gone: "nu-mai-apar" };
