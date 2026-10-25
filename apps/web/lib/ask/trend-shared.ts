import { TREND_CHANGE_LABELS, firstTimeWords, trendBaseWords, trendGroupLabel } from "./filters/defs/trend";
import { DEFAULT_TREND_MIN_BASE, type AskSpec, type TrendChange, type TrendOptions } from "./spec";

/*
 * The trend's answer as the screen reads it (plan §4.7, trend final §3.1,
 * §3.4), without SQL: the lists, the facts of a shown row and its labels, and
 * the spec of each list. Plain TypeScript for the client and the server;
 * trend-partition.ts (the engine) re-exports what it shares with it.
 */

/** The lists of the answer: every change, each group, and the new ones whose first record is in year B (entities only). */
export const TREND_LISTS = ["all", "up", "new", "first", "down", "gone"] as const;
export type TrendList = (typeof TREND_LISTS)[number];

/** The list a spec shows (data.rowsTrend): its change, the first-year new ones with `firstOnly`; no key is every change. */
export function specTrendList(spec: Pick<AskSpec, "trend">): TrendList {
  const t = spec.trend ?? {};
  return t.change === "new" && t.firstOnly ? "first" : t.change ?? "all";
}

/** The part of the answer a spec's list fixes and its drawer lists: with the order in percent, the growths from the base. */
export function specTrendPart(spec: Pick<AskSpec, "trend">): TrendList | "eligible" {
  const list = specTrendList(spec);
  return list === "up" && spec.trend?.order === "percent" ? "eligible" : list;
}

/**
 * A part's name with its years, for the notes of a watch and the header of a
 * group's drawer: „Noi față de 2024”, „Noi față de 2024 · prima dată în 2025”,
 * „Creșteri de la cel puțin 1 mil. lei în 2024” (in percent the base decides
 * who is in it, so the name says it).
 */
export function trendPartLabel(part: TrendList | "eligible", spec: Pick<AskSpec, "filters" | "trend">): string {
  const { yearFrom: a, yearTo: b } = spec.filters;
  if (part === "eligible") return `${TREND_CHANGE_LABELS.up} ${trendBaseWords(spec.trend?.minBase ?? DEFAULT_TREND_MIN_BASE, a)}`;
  if (part === "first") return `${trendGroupLabel("new", a, b)} · ${firstTimeWords(b)}`;
  return trendGroupLabel(part, a, b);
}

/** The part a spec's list fixes, by its name (trendPartLabel): the drawer header, the watch, the shown CSV's `grupa`. */
export const specTrendPartLabel = (spec: Pick<AskSpec, "filters" | "trend">): string => trendPartLabel(specTrendPart(spec), spec);

/**
 * The spec of another list of the same answer (the group buttons and „Toate ·
 * Prima dată”, owner-R-facts-all-lists): only `trend` changes. The answer's
 * own list gives back the answered spec as it was (an old link without the
 * key stays without it), and the growths keep the answer's order and base,
 * the order its list was computed in; any other group drops them, as the
 * builder's write does (trend final §4.3). The months stay as asked (`auto`).
 */
export function trendListSpec<S extends Pick<AskSpec, "trend">>(answered: S, list: TrendList): S {
  if (specTrendList(answered) === list) return answered;
  const trend: TrendOptions = { ...answered.trend, change: (list === "first" ? "new" : list) as TrendChange };
  if (list === "first") trend.firstOnly = true;
  else delete trend.firstOnly;
  // Another list than the answer's: the order and the base belong to the growths it answered.
  delete trend.order;
  delete trend.minBase;
  return { ...answered, trend };
}

/**
 * The facts of a shown row (trend final §3.4), read for the shown entities
 * only, in the answer's selection and months: they explain a row, they do not
 * filter it. `year` is the year that makes the change (B for a growth or a new
 * one, A for a decrease or a gone one); the record, the joint share and the
 * partner are of that year.
 */
export interface TrendRowFacts {
  year: number;
  /** The entity's value in that year (the row's valueA or valueB). */
  value: number;
  /** Its largest record that year, and the channel ("1 contract" / "1 achiziție directă"). */
  largest: { value: number; src: "da" | "contracts" } | null;
  /** Of that year's value, the contract shares with more than one winner (n_winners > 1, divided equally). */
  joint: number;
  /** The main partner that year: the buyer of a firm, the firm of an institution. */
  partner: { entityId: string; name: string; value: number } | null;
  /** First and last record of the entity anywhere in the archive (marts.entity_profile), not only in this selection. */
  firstActivity: string | null;
  lastActivity: string | null;
  /** core.entities.cui_valid; null when the identity has no record of it. */
  cuiValid: boolean | null;
  /** A foreign firm's country code (its row shows the country, not a county); read it through foreignCountry. */
  country: string | null;
}

/**
 * The country a row shows instead of a county: a foreign identity's, except
 * "RO". Some identities flagged foreign carry RO (FCC CONSTRUCCION S.A.,
 * SYNEVO ROMANIA; none with a valid CUI): they are domestic entries without a
 * valid CUI, and say so.
 */
export function foreignCountry(facts: Pick<TrendRowFacts, "country">): string | null {
  const code = facts.country?.trim().toUpperCase();
  return code && code !== "RO" ? facts.country : null;
}

/** The year whose records make a row's change: B when it grew (or is new, or equal), A when it fell (or is gone). */
export const changeYear = (row: { valueA: number; valueB: number }, yearA: number, yearB: number): number =>
  row.valueB >= row.valueA ? yearB : yearA;

/** A label of a shown row (trend final §3.4), at most three, in this order. */
export type TrendRowLabel =
  | { kind: "noValidCui" }
  | { kind: "firstYear"; year: number }
  | { kind: "activeSince"; year: number }
  | { kind: "activeIn"; year: number }
  | { kind: "oneRecord"; share: number; src: "da" | "contracts" }
  | { kind: "joint"; share: number };

/**
 * The labels of a row from its facts: "fără CUI valid" (a domestic identity
 * without a valid CUI), "prima dată în B" / "activă din …" on the new ones,
 * "activă în …" on the gone ones that have records after B, "o înregistrare:
 * N%" when the largest record of the change year is at least half of the
 * change (the share capped at 100%), "în asociere" when at least half of
 * that year's value is in contracts with several winners. At most three.
 */
export function trendRowLabels(row: { valueA: number; valueB: number }, facts: TrendRowFacts, years: { yearA: number; yearB: number }): TrendRowLabel[] {
  const out: TrendRowLabel[] = [];
  // Only an identity known to lack a valid CUI: an unknown status (null) claims nothing.
  if (facts.cuiValid === false && foreignCountry(facts) === null) out.push({ kind: "noValidCui" });
  const first = facts.firstActivity ? Number(facts.firstActivity.slice(0, 4)) : null;
  const last = facts.lastActivity ? Number(facts.lastActivity.slice(0, 4)) : null;
  if (row.valueA === 0 && row.valueB > 0 && first !== null)
    out.push(first === years.yearB ? { kind: "firstYear", year: first } : { kind: "activeSince", year: first });
  if (row.valueB === 0 && row.valueA > 0 && last !== null && last > years.yearB) out.push({ kind: "activeIn", year: last });
  const change = Math.abs(row.valueB - row.valueA);
  if (facts.largest && change > 0 && facts.largest.value >= change / 2)
    out.push({ kind: "oneRecord", share: Math.min(1, facts.largest.value / change), src: facts.largest.src });
  if (facts.value > 0 && facts.joint >= facts.value / 2) out.push({ kind: "joint", share: facts.joint / facts.value });
  return out.slice(0, 3);
}

/** The group a row is in by its two values, as trendGroupSql's HAVINGs select it (the group of each row of „Toate”). */
export function trendGroupOfRow(row: { valueA: number; valueB: number }): Exclude<TrendChange, "all"> | "equal" {
  const { valueA: a, valueB: b } = row;
  if (a > 0 && b > a) return "up";
  if (a === 0 && b > 0) return "new";
  if (b > 0 && b < a) return "down";
  if (a > 0 && b === 0) return "gone";
  return "equal";
}
