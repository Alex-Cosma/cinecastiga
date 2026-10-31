import { countyName } from "../../lib/counties";
import { countWords, fileSlug, formatShare } from "../../lib/ask/answer-text";
import type { EvidenceScope } from "../../lib/ask/evidence";
import {
  FIRM_SHARE_MIN, JOINT_SHARE, NETWORK_CHART, NETWORK_LISTS, NETWORK_LIST_LABELS, NETWORK_ORDER_WORDS, NETWORK_SIGNALS_RULE, RELATION_SIGNAL_LABELS,
  networkGroupRule, networkList, networkOrder, networkShow,
  type NetworkData, type NetworkGroup, type NetworkList, type NetworkListData, type NetworkOrder, type NetworkPartner, type NetworkRow,
} from "../../lib/ask/network-shared";
import type { AskSpec } from "../../lib/ask/spec";
import { cleanName, formatInt, formatRon, formatRonFull } from "../../lib/format";
import { networkGroupLabel } from "../../lib/ask/filters/defs/network";
import { groupWatchBlocked } from "./trend-answer";
import type { RowFact } from "./answer/RowFacts";
import type { CountGroup } from "./builder/CountGroups";
import type { KitTip } from "./builder/kit-types";

/*
 * The network's answer as words (plan §4.8 P6–P8; final network §3, §4; kit
 * §6 network): the four group buttons with their count and sum, the summary
 * under them, the rows of the list the applied question asks for in its order
 * and length, each with its place, facts, share and band of years, the rest of
 * the list and a group's empty state. Pure: NetworkAnswer.tsx draws it,
 * answer-csv.ts exports the same rows. Every list and order came with the
 * answer, so the applied spec alone chooses what shows.
 */

/** The partners' noun by the centre's role: firms around an institution, institutions around a firm. */
export function partnerNoun(data: Pick<NetworkData, "focal">): { one: string; many: string; the: string; gender: "f" | "m" } {
  return data.focal.role === "authority"
    ? { one: "firmă", many: "firme", the: "firmele", gender: "f" }
    : { one: "instituție", many: "instituții", the: "instituțiile", gender: "f" };
}
const partners = (n: number) => countWords(n, "partener", "parteneri");
/** An amount on a button or a summary: "1.570,6 mil." without "lei" (the rows say it in full). */
export const bareRon = (value: number): string => value >= 1e6 ? formatRon(value).replace(/ lei$/, "") : formatRon(value);

/** The swatch of each group (kit component 8): the shape tells them apart, never the colour alone. */
const SWATCH = { all: "all", new: "new", continuing: "up", gone: "gone" } as const;

/** The list the applied question shows: its group, „Toți” without one. */
export const shownList = (spec: Pick<AskSpec, "network">): NetworkList => networkList(spec);

/**
 * A bounded answer's whole relation (relations.ts boundedNetwork, part=network): still asked, or not read
 * (a limit, an error). The groups, the years' order and band wait on it; „Toți” is the answer's own.
 */
export type NetworkRelation = "loading" | "failed";
export const relationWaits = (relation: NetworkRelation): string =>
  relation === "loading" ? "Se calculează pe toată relația." : "Nu au putut fi calculate acum.";

/**
 * The four buttons (final §3.1, kit §6 network 2): „Toți” first (a whole row on phones), each with its
 * partners and value; an empty group stays, disabled with its reason. A bounded answer's groups wait on
 * its whole relation (`relation`): „…” while it is asked.
 */
export function networkButtons(data: NetworkData, relation?: NetworkRelation): CountGroup[] {
  return NETWORK_LISTS.map((list) => {
    const own = data.lists[list];
    if (relation && list !== "all") return {
      value: list, name: NETWORK_LIST_LABELS[list], swatch: SWATCH[list], count: relation === "loading" ? "…" : "—", disabled: relationWaits(relation),
    };
    const empty = own.partners === 0 ? emptyWords(data, list) : null;
    return {
      value: list, name: NETWORK_LIST_LABELS[list], swatch: SWATCH[list],
      count: `${formatInt(own.partners)} · ${bareRon(own.value)}`,
      ...(list === "all" ? { all: true } : {}),
      ...(empty ? { disabled: empty } : {}),
    };
  });
}

/** „Grupele, față de [2025]” (final §3.2): the years to count from, and what each group holds there. */
export function sinceTip(data: Pick<NetworkData, "since" | "complete">): KitTip {
  return {
    title: "Anul de referință",
    text: `Noi: ${networkGroupRule("new", data.since).toLocaleLowerCase("ro-RO")} Continuă: ${networkGroupRule("continuing", data.since).toLocaleLowerCase("ro-RO")} Nu mai apar: ${networkGroupRule("gone", data.since).toLocaleLowerCase("ro-RO")} Grupele privesc toate achizițiile dintre cei doi. ${data.complete + 1} nu se poate alege: nu s-a încheiat; înainte de 2021 arhiva are mai puține contracte.`,
  };
}

/** A group's empty state (final §4 „Stări goale”): precise, with the latest year a partner was new. */
function emptyWords(data: NetworkData, list: NetworkList): string {
  const noun = data.focal.role === "authority" ? "furnizor" : "client";
  switch (list) {
    case "new": return `Niciun ${noun} nou din ${data.since}.${data.lastNew !== null && data.lastNew < data.since ? ` Cel mai recent nou: ${data.lastNew}.` : ""}`;
    case "continuing": return `Niciun ${noun} cu înregistrări și înainte de ${data.since}, și de atunci.`;
    case "gone": return `Toți partenerii au înregistrări și din ${data.since}.`;
    default: return "Niciun partener în selecția aleasă.";
  }
}
export const networkEmpty = (data: NetworkData, list: NetworkList): string | null => data.lists[list].partners === 0 ? emptyWords(data, list) : null;

/** The rows a list shows in an order (its first `count`), the order's ties by value, then by id. */
export function orderedRows(data: NetworkData, list: NetworkList, order: NetworkOrder): NetworkRow[] {
  const rows = [...data.lists[list].rows];
  const years = (row: NetworkRow) => data.partners[row.entityId]?.years.length ?? 0;
  const byValue = (a: NetworkRow, b: NetworkRow) => b.value - a.value || (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0);
  return rows.sort(order === "count" ? (a, b) => b.count - a.count || byValue(a, b) : order === "years" ? (a, b) => years(b) - years(a) || byValue(a, b) : byValue);
}

/**
 * The summary under the groups (final §3.7): "282 de parteneri · primii 15 au 75% din valoare ·
 * 150 cu o singură înregistrare (?)", and "95% în asociere (?)" when more than half the value is.
 */
export function networkSummary(own: NetworkListData, shownValue: number, shown: number): { parts: string[]; oneOff: string | null; joint: string | null } {
  const parts = [partners(own.partners)];
  if (own.partners > shown && own.value > 0) parts.push(`primii ${formatInt(shown)} au ${formatShare(shownValue / own.value)} din valoare`);
  return {
    parts,
    oneOff: own.oneOff > 0 ? `${formatInt(own.oneOff)} cu o singură înregistrare` : null,
    joint: own.value > 0 && own.joint / own.value > JOINT_SHARE ? `${formatShare(own.joint / own.value)} în asociere` : null,
  };
}
export const ONE_OFF_TIP: KitTip = { title: "O singură înregistrare", text: "Parteneri cu o singură achiziție sau un singur contract în selecție. Ordonarea după valoare îi coboară în listă." };
export const JOINT_TIP: KitTip = { title: "În asociere", text: "Contracte cu mai mulți câștigători: valoarea fiecăruia e împărțită egal între ei." };

/** The band of years of a row (final §3.7): ≤2018 … the archive's last year, a gap before the reference year, partial years hatched. */
export interface YearCell { year: number; label: string; on: boolean; partial: boolean; gap: boolean }
export function yearBand(partner: Pick<NetworkPartner, "years">, data: Pick<NetworkData, "since" | "complete">, last: number): YearCell[] {
  const on = new Set(partner.years);
  const cells: YearCell[] = [];
  const early = partner.years.some((y) => y <= 2018);
  cells.push({ year: 2018, label: "≤2018", on: early, partial: false, gap: false });
  for (let year = 2019; year <= last; year++) cells.push({ year, label: String(year), on: on.has(year), partial: year > data.complete, gap: year === data.since });
  return cells;
}
/** "2019–2025 · 7 ani", "2025 · nou" (one year since the reference), "ultima: 2024" (gone). */
export function yearsWords(partner: Pick<NetworkPartner, "first" | "last" | "years">, group: NetworkGroup | null): string {
  const n = partner.years.length;
  if (group === "gone") return `ultima: ${partner.last}`;
  const span = partner.first === partner.last ? String(partner.first) : `${partner.first <= 2018 ? "≤2018" : partner.first}–${partner.last}`;
  return group === "new" && n === 1 ? `${span} · nou` : `${span} · ${countWords(n, "an", "ani")}`;
}

export interface NetworkRowView {
  key: string;
  entityId: string;
  name: string;
  /** "Buzău · 388 angajați", "Străinătate", "București". */
  place: string | null;
  facts: RowFact[];
  value: string;
  /** "21% din total" of the list's value. */
  share: string;
  count: number;
  records: string;
  band: YearCell[];
  yearsText: string;
  bandLabel: string;
  /** The row's sources: the partner, in the applied question's selection (a group has no period: the whole relation). */
  scope: EvidenceScope;
  scopeLabel: string;
}

/**
 * The facts of a row (final §3.7, kit P8), at most two, in order: the official signal (orange, the
 * short label), „în asociere” from half the row's value, „65% din ce a câștigat firma” (an institution
 * in the centre, from 50% and 50.000 lei, without a dependence signal: relations.ts).
 */
export function rowFacts(row: NetworkRow, partner: NetworkPartner): RowFact[] {
  const facts: RowFact[] = [];
  const signal = partner.signals[0];
  if (signal) facts.push({
    text: `${RELATION_SIGNAL_LABELS[signal] ?? signal}${partner.signals.length > 1 ? ` +${partner.signals.length - 1}` : ""}`, tone: "signal",
    tip: { title: "Semnal pe relație", text: `${partner.signals.map((code) => RELATION_SIGNAL_LABELS[code] ?? code).join(", ")}. Semnal oficial pe această relație; e o pistă, nu o dovadă.` },
  });
  if (row.value > 0 && row.joint / row.value >= JOINT_SHARE) facts.push({ text: "în asociere", tip: JOINT_TIP });
  if (partner.firmShare !== null && partner.firmShare >= FIRM_SHARE_MIN) facts.push({
    text: `${formatShare(partner.firmShare)} din ce a câștigat firma`,
    tip: { title: "Pondere în ce a câștigat firma", text: "Din tot ce a câștigat firma pe SEAP (toată arhiva, toate achizițiile). Firma poate avea și clienți privați." },
  });
  return facts.slice(0, 2);
}

/** One row as drawn (final §4 „Telefon”: name; seat and employees; facts; value and share; years; records and ⋯). */
export function networkRowView(row: NetworkRow, data: NetworkData, list: NetworkList, last: number): NetworkRowView {
  const partner = data.partners[row.entityId] ?? { entityId: row.entityId, name: "?", county: null, employees: null, first: 0, last: 0, years: [], signals: [], firmShare: null };
  const name = cleanName(partner.name);
  const firm = data.focal.role === "authority";
  const place = [countyName(partner.county), firm && partner.employees !== null ? countWords(partner.employees, "angajat", "angajați") : null].filter(Boolean).join(" · ") || null;
  const own = data.lists[list];
  const group = list === "all" ? null : list;
  // A bounded answer has no relation's years yet (part=network brings them): no band until then.
  const years = data.relation !== "pending";
  return {
    key: row.entityId, entityId: row.entityId, name, place,
    facts: rowFacts(row, partner),
    value: formatRonFull(row.value), share: `${own.value > 0 ? formatShare(row.value / own.value) : "—"} din total`,
    count: row.count, records: countWords(row.count, "înregistrare", "înregistrări"),
    band: years ? yearBand(partner, data, last) : [], yearsText: years ? yearsWords(partner, group) : "",
    bandLabel: years ? `Ani cu înregistrări: ${partner.years.join(", ") || "—"}` : "",
    scope: { role: firm ? "supplier" : "authority", entityIds: [row.entityId] },
    scopeLabel: `${name} · relația cu ${cleanName(data.focal.name)}`,
  };
}

/** The last year any row's band shows: the archive's last year with a partner, never before the reference year. */
export const bandLast = (data: NetworkData): number => Math.max(data.since, ...Object.values(data.partners).map((p) => p.last));

/** What a list shows now: its rows in the order, the first `shown`, and the rest (final §3.5: „alți 267 de parteneri · 25% din valoare”). */
export function networkPage(data: NetworkData, spec: Pick<AskSpec, "network">, list: NetworkList, extra = 0): {
  rows: NetworkRow[]; shown: number; held: number; rest: string | null; more: string | null; step: number; shownValue: number;
} {
  const own = data.lists[list];
  const ordered = orderedRows(data, list, networkOrder(spec));
  const shown = Math.min(ordered.length, networkShow(spec) + extra);
  const rows = ordered.slice(0, shown);
  const shownValue = rows.reduce((t, r) => t + r.value, 0);
  const left = own.partners - shown;
  const rest = left > 0 ? `${left === 1 ? "un alt partener" : `alți ${partners(left)}`} · ${own.value > 0 ? formatShare(Math.max(0, own.value - shownValue) / own.value) : "—"} din valoare` : null;
  const step = Math.min(networkShow(spec), ordered.length - shown);
  return { rows, shown, held: ordered.length, rest, more: step > 0 ? `Arată încă ${formatInt(step)}` : null, step, shownValue };
}

/** The chart's partners (final §3.5): at most 15 of the rows shown, never on an empty list. */
export const chartRows = (rows: readonly NetworkRow[]): NetworkRow[] => rows.slice(0, NETWORK_CHART);

/** „Ordonează” (final §3.5): the three orders, short. */
export const ORDER_OPTIONS = (["value", "count", "years"] as const).map((value) => ({ value, label: NETWORK_ORDER_WORDS[value].short }));

/** The (?) of „Cu semnale” and of a group's word (the glossary's, kit §5.35). */
export const SIGNALS_TIP: KitTip = { title: "Cu semnale", text: NETWORK_SIGNALS_RULE };

/** The group in the shown CSV's header and file name. */
export const NETWORK_LIST_CSV = Object.fromEntries(NETWORK_LISTS.map((list) => [list, fileSlug(NETWORK_LIST_LABELS[list])])) as Record<NetworkList, string>;

/**
 * The shown CSV's rows (final §Surse, export): the rows on screen in their order, with the group, the
 * first and last year, the years, the share of the total, the value in association, the share of the
 * firm's winnings and the signals.
 */
export function networkCsvRows(data: NetworkData, spec: Pick<AskSpec, "network">, csvQ: (value: unknown) => string): string[] {
  const list = shownList(spec), { rows } = networkPage(data, spec, list);
  const own = data.lists[list];
  const head = "partener,judet,valoare_lei,inregistrari,grupa,primul_an,ultimul_an,ani,procent_din_total,valoare_in_asociere_lei,pondere_in_castigurile_firmei,semnale";
  // A group is named with its reference year, as the strip and the file name say it („Noi din 2025”).
  const group = list === "all" ? NETWORK_LIST_LABELS[list] : `${NETWORK_LIST_LABELS[list]} din ${data.since}`;
  return [head, ...rows.map((row) => {
    const p = data.partners[row.entityId];
    return [
      csvQ(cleanName(p?.name)), csvQ(countyName(p?.county) ?? ""), row.value, row.count, csvQ(group), p?.first ?? "", p?.last ?? "", csvQ(p?.years.join(" ") ?? ""),
      own.value > 0 ? (row.value / own.value * 100).toFixed(2) : "", row.joint, p?.firmShare !== null && p?.firmShare !== undefined ? (p.firmShare * 100).toFixed(1) : "",
      csvQ((p?.signals ?? []).map((code) => RELATION_SIGNAL_LABELS[code] ?? code).join("; ")),
    ].join(",");
  })];
}

/**
 * „Urmărește grupa” on a network's group (options.members network-group, F4n-members-watch): activation fixes its
 * partners, the watch follows them; „Toți” stays the plain live watch. Disabled with the reason over the members'
 * limit or on an empty group, as a trend's (groupWatchBlocked); none until the whole relation is read.
 */
export function networkWatch(data: NetworkData, spec: Pick<AskSpec, "network">): { label: string; blocked: string | null } | null {
  const list = networkList(spec);
  if (list === "all" || data.relation === "pending") return null;
  return { label: "Urmărește grupa", blocked: groupWatchBlocked(data.focal.role === "authority" ? "supplier" : "authority", data.lists[list].partners) };
}

/** The setup of a watch on a network's group (FollowSetup): what activation fixes, before it does. Null on any other question. */
export function networkWatchNote(spec: Pick<AskSpec, "block" | "filters" | "network">): string | null {
  const list = spec.block === "network" ? networkList(spec) : "all";
  if (list === "all") return null;
  const who = spec.filters.authorityId || spec.filters.authorityName ? "Firmele" : "Instituțiile";
  return `${who} grupei „${networkGroupLabel(list, spec.network?.since)}” se fixează la activare; cele care intră sau ies din grupă apar doar ca notă.`;
}
