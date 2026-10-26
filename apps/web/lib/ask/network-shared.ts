import { defaultTrendYears, type CoveragePeriods } from "./months-window";
import type { AskSpec, NetworkOptions } from "./spec";

/*
 * "Cu cine lucrează X?" (network-2, plan §4.8, F4; final network §3, kit §6
 * network) as the screen and the engine both read it, without SQL: the
 * groups of partners against a reference year, the answer's shape, the year
 * the groups are counted from, the orders and how many rows show. Plain
 * TypeScript for client and server; lib/ask/relations.ts holds the SQL.
 *
 * - A group is of the whole relation (every channel, domain and year of the
 *   records between X and the partner): Noi = its first record is in the
 *   reference year R or after; Continuă = before R and in R or after; Nu mai
 *   apar = its last record is before R. The three partition the partners.
 * - The selection (channel, domain, the partners' conditions) only picks who
 *   is listed and the values: a partner is listed with at least one record in
 *   it, at any time. The period applies to „Toți” only.
 */

export const NETWORK_LISTS = ["all", "new", "continuing", "gone"] as const;
export type NetworkList = (typeof NETWORK_LISTS)[number];
export type NetworkGroup = Exclude<NetworkList, "all">;
export const NETWORK_ORDERS = ["value", "count", "years"] as const;
export type NetworkOrder = (typeof NETWORK_ORDERS)[number];
export const NETWORK_SHOW = [10, 15, 25, 50] as const;

/** The reference year starts here: before 2021 the archive has fewer contracts, so „Noi” would be swollen (final §3.2). */
export const MIN_NETWORK_SINCE = 2021;
/** A link without `network.show` lists 14 partners, as before network-2; a new question writes 15 (final §3.5). */
export const LEGACY_NETWORK_SHOW = 14;
export const NEW_NETWORK_SHOW = 15;
/** The rows of each list and each order the answer holds: „Arată încă 15” and the order switch need no request. */
export const NETWORK_ROWS = 50;
/** The radial chart draws at most this many partners (final §3.5). */
export const NETWORK_CHART = 15;

/** The groups in the kit's words (§4): the answer's buttons, the window, the chips. */
export const NETWORK_LIST_LABELS: Readonly<Record<NetworkList, string>> = {
  all: "Toți", new: "Noi", continuing: "Continuă", gone: "Nu mai apar",
};
/** The verb of the sentence per group (final §1, kit §6 network 1). */
export const NETWORK_VERBS: Readonly<Record<NetworkList, string>> = {
  all: "lucrează", new: "a început să lucreze", continuing: "a continuat să lucreze", gone: "nu mai lucrează",
};
/** The orders (P5, the answer's „Ordonează”): the presentation line's words and the strip's short ones. */
export const NETWORK_ORDER_WORDS: Readonly<Record<NetworkOrder, { phrase: string; short: string }>> = {
  value: { phrase: "valoarea înregistrată", short: "Valoare" },
  count: { phrase: "numărul de înregistrări", short: "Înregistrări" },
  years: { phrase: "anii cu înregistrări", short: "Ani" },
};

/** The list a question shows: its group, „Toți” without one. */
export const networkList = (spec: Pick<AskSpec, "network">): NetworkList => spec.network?.partners ?? "all";
export const networkOrder = (spec: Pick<AskSpec, "network">): NetworkOrder => spec.network?.order ?? "value";
/** How many partners show: the key, 14 on an old link without the network's options (final §3.5, decision 7). */
export const networkShow = (spec: Pick<AskSpec, "network">): number => spec.network?.show ?? LEGACY_NETWORK_SHOW;

/**
 * The last year a group can be counted from: the latest year every channel has
 * complete (the trend's rule, months-window.ts defaultTrendYears), else the
 * year before `fallback` (the calendar year in the builder, the archive's last
 * year on the server). Never before MIN_NETWORK_SINCE.
 */
export function networkLastYear(periods: CoveragePeriods | null | undefined, fallback: number): number {
  const complete = periods ? defaultTrendYears(periods, "all")?.yearTo ?? null : null;
  return Math.max(MIN_NETWORK_SINCE, complete ?? fallback - 1);
}

/**
 * The reference year R of an answer (final §3.2): the key; on „Toți” with a
 * period, its first year brought into 2021…last; else the last complete year.
 */
export function networkSince(spec: Pick<AskSpec, "network" | "filters">, last: number): number {
  if (spec.network?.since !== undefined) return spec.network.since;
  const from = spec.network?.partners ? undefined : spec.filters.yearFrom ?? spec.filters.yearTo;
  return from === undefined ? last : Math.min(last, Math.max(MIN_NETWORK_SINCE, from));
}

/** The years a reference can be chosen from, newest first (the window „Față de ce an?”, the answer's „Grupele, față de”). */
export function networkSinceChoices(last: number): number[] {
  const years: number[] = [];
  for (let year = last; year >= MIN_NETWORK_SINCE; year--) years.push(year);
  return years;
}

/** The group of a relation whose first and last records are in these years (final §3.1). */
export function networkGroupOf(first: number, last: number, since: number): NetworkGroup {
  return first >= since ? "new" : last >= since ? "continuing" : "gone";
}

/** One partner of an answer: the facts of its row (P8), the same in every list. */
export interface NetworkPartner {
  entityId: string;
  name: string;
  /** An institution's county; a firm's seat (owner-seat-switch), "Străinătate" for a foreign one; null when unknown. */
  county: string | null;
  /** A firm's employees from its latest MF filing; null without one, or for an institution. */
  employees: number | null;
  /** The relation's first and last year and its years, over the whole relation (final §3.7, the band of years). */
  first: number;
  last: number;
  years: number[];
  /** The official signals on this relation (flag codes, RELATION_SIGNALS). */
  signals: string[];
  /**
   * The relation's share of everything the firm won on SEAP (an institution in the centre), shown from 50% and
   * 50.000 lei of the firm's total, without a dependence signal (final §3.7); null otherwise.
   */
  firmShare: number | null;
}

/** A partner's row in one list: the value and the records of the list's selection, and the value from contracts with several winners. */
export interface NetworkRow { entityId: string; value: number; count: number; joint: number }

export interface NetworkListData {
  /** Partners in the list, every one (not only the rows held). */
  partners: number;
  value: number;
  count: number;
  /** Partners with a single record in the list's selection (final §3.7, the summary). */
  oneOff: number;
  /** Value from contracts with several winners (shared equally). */
  joint: number;
  /** The first NETWORK_ROWS of every order, by value. */
  rows: NetworkRow[];
}

/** A network-2 answer (plan §4.8). */
export interface NetworkData {
  block: "network";
  focal: { entityId: string; name: string; role: string };
  /** The reference year the groups are counted from. */
  since: number;
  /** The list the question asked for (its group): what a watch compares (answer-core.ts); the screen shows the applied question's. */
  list: NetworkList;
  /** The last year every channel has complete: later years are partial (the band of years hatches them), and no group counts from them. */
  complete: number;
  lists: Record<NetworkList, NetworkListData>;
  /** The facts of every partner held in a list, by id. */
  partners: Record<string, NetworkPartner>;
  /** The latest first year of a partner in the selection: „Cel mai recent nou: 2023” when „Noi” is empty. */
  lastNew: number | null;
  /** Each channel in the same selection on every channel (the strip's shares); absent with a procedure or a single bidder. */
  streams?: Record<"da" | "contracts", { value: number; count: number }>;
}

/** The official signals that can sit on a relation (final §3.4): the pair's, and the dependence of a firm on the institution. */
export const RELATION_SIGNALS = ["da_split", "net_shared_admin", "da_dependence", "award_dependence"] as const;
/** Their short words on a row (P8, orange; kit §5.35 until F6b's FLAG_META.label). */
export const RELATION_SIGNAL_LABELS: Readonly<Record<string, string>> = {
  da_split: "posibilă fracționare", net_shared_admin: "reprezentant comun", da_dependence: "dependență de instituție", award_dependence: "contracte concentrate",
};
/** A dependence counts on this relation when the pair holds at least this share of the signal's total (final §3.4). */
export const DEPENDENCE_PAIR_SHARE = 0.85;
/** The firm-share label: from this share of the firm's total and this total (final §3.7, decision network-4). */
export const FIRM_SHARE_MIN = 0.5;
export const FIRM_SHARE_TOTAL = 50_000;
/** „în asociere” on a row from this share of its value from contracts with several winners (final §3.7). */
export const JOINT_SHARE = 0.5;

/** What each group holds, for its (?) and the window's rows (final §3.1, kit §4). */
export function networkGroupRule(group: NetworkGroup, since: number | string): string {
  switch (group) {
    case "new": return `Prima înregistrare a relației e din ${since} încoace.`;
    case "continuing": return `Înregistrări și înainte de ${since}, și de atunci.`;
    case "gone": return `Nicio înregistrare din ${since} încoace.`;
  }
}

/** „Cu semnale” in a list: which signals, and that they are leads (final §3.4). */
export const NETWORK_SIGNALS_RULE = "Doar partenerii cu un semnal oficial pe această relație: posibilă fracționare, reprezentant comun, dependență de instituție, contracte concentrate. Semnalele sunt piste, nu dovezi.";

/** The sources' note of a group or of „Cu semnale” (runRows): who the partners are, and that their records are the whole relation's selection. */
export function networkSourcesNote(group: NetworkList, since: number, signals: boolean): string {
  const parts: string[] = [];
  if (group !== "all") parts.push(`Grupa „${NETWORK_LIST_LABELS[group]}” față de ${since}: ${networkGroupRule(group, since).toLocaleLowerCase("ro-RO").replace(/\.$/, "")}, în toate achizițiile dintre cei doi. Sursele sunt înregistrările lor din selecție, din toți anii.`);
  if (signals) parts.push(NETWORK_SIGNALS_RULE);
  return parts.join(" ");
}

/** The network's options of a question after its group is chosen in the answer: the period goes on a group (R is written). */
export function networkListSpec<S extends Pick<AskSpec, "network" | "filters">>(answered: S, list: NetworkList, since: number): S {
  const options: NetworkOptions = { ...answered.network };
  if (list === "all") delete options.partners;
  else options.partners = list;
  const filters = { ...answered.filters };
  if (list !== "all") {
    options.since = since;
    delete filters.yearFrom; delete filters.yearTo; delete filters.monthFrom; delete filters.monthTo;
  }
  return { ...answered, filters, network: options };
}
