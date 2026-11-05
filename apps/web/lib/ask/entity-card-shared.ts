import { countWords } from "./answer-text";
import { RISK_BAND_WORD, riskBand } from "../risk-score";

/*
 * "Cine conduce?" (entity_card-3; entity_card-2: plan §4.13, final entity_card
 * §3.9–§3.10): the shape of the answer and its words, shared by the engine
 * (compile.ts, entity-card.ts), the answer (app/intreaba/EntityCardAnswer.tsx),
 * its CSV and a watch's core. Plain TypeScript, no SQL and no React.
 *
 * By value the question is the ranking "Cine câștigă?" stopped at place 1: the
 * podium holds places 1–3 with the whole selection's total, from which the
 * answer says the share of each, the distance from place 2 and the rest. On the
 * risk axis (entity_card-3, rf-2026.18, owner decision of 1 November 2026) it
 * is the first profiles of the question's group by the risk score: the
 * unrounded score, then the value, then the id; the profiles that share the
 * best displayed score are said to be tied. An answer stored as entity_card-2
 * holds the group at the top of the old index instead (LegacyTies), drawn as it
 * was.
 */

export const ENTITY_CARD_VERSION = 3;
/** The podium's shape, unchanged since entity_card-2 (entity_card-3 changed the risk axis only). */
export const PODIUM_VERSION = 2;
/** The direct acquisitions a profile needs to be ranked on the risk axis (predicates.ts ENTITY_CARD_MIN_DAS keeps them equal, entity-card-shared.test.ts). */
export const LEADER_MIN_DAS = 20;
/** The podium: places 1–3. */
export const PODIUM_PLACES = 3;
/** The profiles listed at most on the risk axis (the answer's „Arată primele 50”; entity_card-2: the tied ones). */
export const RISK_LISTED = 50;
/** Profiles shown before „Arată toate” (final frame E). */
export const RISK_SHOWN = 5;

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
  version: typeof PODIUM_VERSION;
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

/** A profile of the ranking by the risk score (entity_card-3). */
export interface RiskPlace {
  entityId: string;
  name: string;
  /** An institution's county, a firm's seat (the profile row's own). */
  county: string | null;
  /** Direct acquisitions in the profile. */
  count: number;
  value: number;
  /** The risk score over 100, as displayed (marts.entity_flags.score). */
  score: number;
  /** The criteria met (x ≥ 1) and their codes. */
  nFlags: number;
  flags: string[];
}
/** The risk axis of "Cine conduce?" (entity_card-3): the first profiles of the question's group by the risk score. */
export interface RiskRanking {
  version: typeof ENTITY_CARD_VERSION;
  /** Profiles ranked (the question's group). */
  pool: number;
  /** Of them, the profiles with a score above 0 (at least one criterion met). */
  scored: number;
  /** The best displayed score in the group, and how many profiles of the whole group have it. */
  top: number;
  topCount: number;
  /**
   * The first RISK_LISTED by the unrounded score, then the value, then the id: the profiles with a score above 0; when
   * nobody has one, the first by value (the sources of „Nu are semnale în profil”).
   */
  rows: RiskPlace[];
  /**
   * rf-2026.22 (S8): the profiles of the group with a score left out as historic (no record in the last 24 months);
   * absent when they are listed (filters.includeHistoric) and in answers stored before.
   */
  historic?: number;
}

/** A profile at the top of the old index, in an answer stored as entity_card-2. */
export interface LegacyTiePlace {
  entityId: string;
  name: string;
  county: string | null;
  /** Direct acquisitions in the profile. */
  count: number;
  value: number;
  nFlags: number;
  flags: string[];
}
/** The group at the top of the old index (entity_card-2): only in answers stored before entity_card-3. */
export interface LegacyTies {
  version: 2;
  /** The top level (cri) and the signals it stood for. */
  level: number;
  maxFlags: number;
  /** The signals a profile of this role could meet (5 for an institution, 4 for a firm). */
  criteria: number;
  /** Profiles at the top level. */
  count: number;
  /** Profiles ranked (the group's pool). */
  pool: number;
  /** The level below and how many were on it; null when the top was the only level. */
  nextLevel: number | null;
  nextCount: number;
  /** The first 50 at the top level, by value. */
  rows: LegacyTiePlace[];
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
   * With „Firme noi” (F5's newSince/newScope, S6): the year of the ONRC registration („înmatriculată în 2024”) and,
   * beside a named buyer, the firm's first record with it („prima dată aici: 02.10.2024”); read only with the chip.
   */
  registeredYear?: number | null;
  firstHere?: string | null;
}

/** The card of an answer with no entity (`empty`): nothing to show, never read. */
export const blankCard = (role: "authority" | "supplier") => ({
  entityId: "", name: "", county: null, role, value: 0, count: 0, cri: null, nFlags: 0, flags: [] as string[], population: null,
});

/**
 * The places of the ranking by the risk score as the answer numbers them: the same place for the same displayed score
 * („3 la egalitate pe primul loc” are all 1), the next one after them (1, 1, 1, 4).
 */
export function riskPlaces(rows: readonly Pick<RiskPlace, "score">[]): number[] {
  const places: number[] = [];
  rows.forEach((row, i) => places.push(i > 0 && rows[i - 1]!.score === row.score ? places[i - 1]! : i + 1));
  return places;
}

/** The band's word of a score, as beside its pill: „puternic”, „slab”, „fără semnal în scor”. */
export const riskBandWord = (score: number): string => RISK_BAND_WORD[riskBand(score)];

/** The ids of the podium's places (place 1 alone for an answer stored before entity_card-2): what a records drawer may narrow to. */
export function podiumPlaceIds(data: { card: { entityId: string }; podium?: Pick<Podium, "places"> | undefined }): string[] {
  return data.podium?.places.length ? data.podium.places.map((place) => place.entityId) : [data.card.entityId];
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
/** The share of the largest record in the place's value, from half of it (a place of one record: 100%, final §3.9). */
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

/* ── an answer stored as entity_card-2 (the old index) ───────────────────── */

/** "1,00" / "0,20": a level of the old index as the answer wrote it. */
export const levelWords = (level: number): string => level.toFixed(2).replace(".", ",");

/**
 * Whether the old index told the group apart from the pool (final §3.10): over half of the pool at the top, or a single
 * signal as the top level — then the answer said „Indicele nu le deosebește”.
 */
export function tiesNotDistinct(ties: Pick<LegacyTies, "count" | "pool" | "maxFlags">): boolean {
  return ties.count > 1 && (ties.maxFlags <= 1 || ties.count * 2 > ties.pool);
}

/** The signals out of those a role could meet, from the old top level: „1 semnal din 5”. */
export const signalsWords = (ties: Pick<LegacyTies, "maxFlags" | "criteria">): string =>
  `${countWords(ties.maxFlags, "semnal", "semnale")} din ${ties.criteria}`;
