import { countWords } from "./answer-text";
import { criteriaOf } from "./peer-groups-shared";

/*
 * "Cine conduce?" (entity_card-2, plan §4.13, final entity_card §3.9–§3.10):
 * the shape of the answer and its words, shared by the engine (compile.ts,
 * entity-card.ts), the answer (app/intreaba/EntityCardAnswer.tsx), its CSV and
 * a watch's core. Plain TypeScript, no SQL and no React.
 *
 * By value the question is the ranking "Cine câștigă?" stopped at place 1: the
 * podium holds places 1–3 with the whole selection's total, from which the
 * answer says the share of each, the distance from place 2 and the rest. On the
 * index it is the group at the top: every profile at the maximum level, never
 * one name crowned by chance, in the order of value (the index does not tell
 * them apart).
 */

export const ENTITY_CARD_VERSION = 2;
/** The podium: places 1–3. */
export const PODIUM_PLACES = 3;
/** The tied profiles listed at most (the answer's "Arată toate cele 14", final §3.10). */
export const TIES_LISTED = 50;
/** Tied profiles shown before „Arată toate” (final frame E). */
export const TIES_SHOWN = 5;

export interface PodiumPlace {
  entityId: string;
  name: string;
  /** An institution's county, a firm's seat (owner-seat-switch); null for a foreign firm or an unknown one. */
  county: string | null;
  value: number;
  count: number;
}
export interface PodiumTotals { value: number; count: number; entities: number }
export interface Podium {
  version: typeof ENTITY_CARD_VERSION;
  /** Places 1–3 by value (fewer when the selection has fewer). */
  places: PodiumPlace[];
  /**
   * The denominator of „% din total”: the whole selection's; under a band of CÂȘTIGĂTORII the band's own (owner decision
   * entity_card 4: „din valoarea celor 23 de firme fără angajați”); null where nothing gives it.
   */
  total: PodiumTotals | null;
  /** The whole selection under a band, when `total` is the band's. */
  selection?: PodiumTotals;
}

/** A profile at the top of the index. */
export interface TiePlace {
  entityId: string;
  name: string;
  county: string | null;
  /** Direct acquisitions in the profile. */
  count: number;
  value: number;
  nFlags: number;
  flags: string[];
}
export interface Ties {
  version: typeof ENTITY_CARD_VERSION;
  /** The top level (cri) and the signals it stands for. */
  level: number;
  maxFlags: number;
  /** The signals a profile of this role can meet (5 for an institution, 4 for a firm). */
  criteria: number;
  /** Profiles at the top level. */
  count: number;
  /** Profiles ranked (the group's pool). */
  pool: number;
  /** The level below and how many are on it; null when the top is the only level. */
  nextLevel: number | null;
  nextCount: number;
  /** The first TIES_LISTED at the top level, by value. */
  rows: TiePlace[];
}

/** The facts of the podium's places, asked once the answer is on screen (POST /api/ask/facets, part `podium`). */
export interface PodiumFact {
  entityId: string;
  /** Of the place's value, the contract shares with more than one winner (n_winners > 1, divided equally). */
  joint: number;
  /** Its largest record in the selection, and the channel. */
  largest: { value: number; src: "da" | "contracts" } | null;
  /** The firm's latest filing: employees and the year of the balance sheet (marts.entity_profile). */
  employees: number | null;
  employeesYear: number | null;
  firstActivity: string | null;
  /**
   * S5 (F5-table builds the engine side): the year of the ONRC registration, for the „Firme noi” row's tag
   * „înmatriculată în 2024”. Not read before the column is on this base (see PRECOMPUTE.md, F6c).
   */
  registeredYear?: number | null;
}

/** The share of a place in the total; null without one. */
export function placeShare(place: Pick<PodiumPlace, "value">, total: PodiumTotals | null): number | null {
  return total && total.value > 0 ? place.value / total.value : null;
}

/** Place 1's lead over place 2, in lei; null with a single place. */
export function leadOverSecond(podium: Pick<Podium, "places">): number | null {
  const [first, second] = podium.places;
  return first && second ? first.value - second.value : null;
}

/**
 * What the three places leave of the total: the other firms or institutions and their value. Null when the total is
 * unknown or the three places are all of it.
 */
export function podiumRest(podium: Pick<Podium, "places" | "total">): { entities: number; value: number; share: number } | null {
  const { total, places } = podium;
  if (!total || total.entities <= places.length) return null;
  const value = Math.max(0, total.value - places.reduce((sum, place) => sum + place.value, 0));
  return { entities: total.entities - places.length, value, share: total.value > 0 ? value / total.value : 0 };
}

/** The tag tone thresholds (final §3.9): the joint share from a quarter, one record from half. */
export const JOINT_TAG_FROM = 0.25;
export const ONE_RECORD_FROM = 0.5;

/** The share of a place's value that comes from contracts with several winners; null below the tag's bar or without value. */
export function jointShare(value: number, fact: Pick<PodiumFact, "joint"> | undefined): number | null {
  if (!fact || value <= 0 || fact.joint <= 0) return null;
  const share = fact.joint / value;
  return share >= JOINT_TAG_FROM ? Math.min(1, share) : null;
}
/** The share of the largest record in the place's value, from half of it and with more than one record behind it. */
export function oneRecordShare(place: Pick<PodiumPlace, "value" | "count">, fact: Pick<PodiumFact, "largest"> | undefined): { share: number; src: "da" | "contracts" } | null {
  if (!fact?.largest || place.value <= 0 || place.count < 1) return null;
  const share = fact.largest.value / place.value;
  return share >= ONE_RECORD_FROM ? { share: Math.min(1, share), src: fact.largest.src } : null;
}

/**
 * The legal form a buyer's name shows, which makes it look like no institution (final §3.10): a company or an
 * association. A hint with a (?), not a classification: SEAP buyers include companies of institutions and
 * intercommunity associations. Matched on the name without diacritics, as whole words.
 */
export type BuyerForm = "societate" | "asociație";
const COMPANY = /(^|[^a-z0-9])(s\.?\s?r\.?\s?l\.?(\s?-?\s?d)?|p\.?\s?f\.?\s?a\.?|i\.?\s?i\.?|i\.?\s?f\.?|s\.?\s?n\.?\s?c\.?|s\.?\s?c\.?\s?s\.?)([^a-z0-9]|$)/;
const ASSOCIATION = /(^|[^a-z0-9])(asocia\w*|fundati\w*|club\s+sportiv)([^a-z0-9]|$)/;
export function buyerForm(name: string): BuyerForm | null {
  const plain = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (ASSOCIATION.test(plain)) return "asociație";
  if (COMPANY.test(plain)) return "societate";
  return null;
}

/** "1,00" / "0,20": a level of the index as the answer writes it. */
export const levelWords = (level: number): string => level.toFixed(2).replace(".", ",");

/**
 * Whether the index tells the group apart from the pool (final §3.10): over half of the pool at the top, or a single
 * signal as the top level — then the answer says „Indicele nu le deosebește”.
 */
export function tiesNotDistinct(ties: Pick<Ties, "count" | "pool" | "maxFlags">): boolean {
  return ties.count > 1 && (ties.maxFlags <= 1 || ties.count * 2 > ties.pool);
}

/** The signals out of those a role can meet, from the top level: „1 semnal din 5”. */
export const signalsWords = (ties: Pick<Ties, "maxFlags" | "criteria">): string =>
  `${countWords(ties.maxFlags, "semnal", "semnale")} din ${ties.criteria}`;

/** The criteria of a role (5 for an institution, 4 for a firm). */
export const criteriaCount = (role: "authority" | "supplier"): number => criteriaOf(role).length;
