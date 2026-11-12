/**
 * The welcome tour (owner, 12 November 2026: the map variant; it opens by itself on the home page at a first visit,
 * anywhere else a first visitor gets a small invitation; one tap skips it and it never comes back by itself).
 * The parts that need no document: the subjects a visitor chooses from, how a county's figures are read, the
 * question the tour leaves in the home page's search field, and what marks the tour as seen.
 */
export interface TourTopic {
  key: string;
  /** On the choice. */
  label: string;
  /** Inside a sentence: „la drumuri și construcții”. */
  inText: string;
  /** The word the search understands, used in the closing question (checked against the rules interpreter). */
  query: string;
  /** CPV divisions counted for this subject. */
  cpv2: readonly string[];
}

export const TOUR_TOPICS: readonly TourTopic[] = [
  { key: "drumuri", label: "Drumuri și construcții", inText: "drumuri și construcții", query: "drumuri", cpv2: ["45"] },
  { key: "sanatate", label: "Sănătate", inText: "sănătate", query: "medicamente", cpv2: ["33", "85"] },
  { key: "alimente", label: "Alimente", inText: "alimente", query: "alimente", cpv2: ["15"] },
  { key: "it", label: "IT și calculatoare", inText: "IT și calculatoare", query: "calculatoare", cpv2: ["30", "48", "72"] },
  { key: "energie", label: "Combustibil și energie", inText: "combustibil și energie", query: "combustibil", cpv2: ["09"] },
  { key: "masini", label: "Mașini și transport", inText: "mașini și transport", query: "mașini", cpv2: ["34", "60"] },
  { key: "proiectare", label: "Proiectare și consultanță", inText: "proiectare și consultanță", query: "proiectare", cpv2: ["71", "79"] },
  { key: "salubritate", label: "Salubritate și mediu", inText: "salubritate și mediu", query: "deșeuri", cpv2: ["90"] },
];

/** The steps: the choice, then five ideas; the last one (the search) hands over to the home page. */
export const TOUR_LAST_STEP = 5;

/** One county and subject in the tour's year: direct awards (count, lei), contracts (count, lei), institutions. */
export type TourFigures = readonly [daCount: number, daValue: number, contractCount: number, contractValue: number, authorities: number];
export interface TourData {
  year: number;
  /** County key (lib/map.ts foldCounty) → subject key → figures. */
  rows: Record<string, Record<string, TourFigures>>;
}

export interface TourReading {
  count: number;
  value: number;
  authorities: number;
  daCount: number;
  daValue: number;
  contractCount: number;
  contractValue: number;
  /** Direct awards' share of the count and of the value, 0–1. */
  shareByCount: number;
  shareByValue: number;
}

export function readFigures(figures: TourFigures | undefined): TourReading | null {
  if (!figures) return null;
  const [daCount, daValue, contractCount, contractValue, authorities] = figures;
  const count = daCount + contractCount, value = daValue + contractValue;
  if (count <= 0) return null;
  return { count, value, authorities, daCount, daValue, contractCount, contractValue, shareByCount: daCount / count, shareByValue: value > 0 ? daValue / value : 0 };
}

/** „județul Cluj”, but „București” alone. */
export function tourPlace(countyKey: string, countyLabel: string): string {
  return countyKey === "bucuresti" ? "București" : `județul ${countyLabel}`;
}

/** A share as people say it: whole percents, never „0%” or „100%” for a share that is not exactly that. */
export function tourPercent(share: number): string {
  const percent = share * 100;
  if (percent > 0 && percent < 1) return "sub 1%";
  if (percent > 99 && percent < 100) return "peste 99%";
  return `${Math.round(percent)}%`;
}

/** Of the 200 dots, how many stand for contracts (the rest are direct awards); both kinds stay visible. */
export const TOUR_DOTS = 200;
export function contractDots(directShare: number): number {
  return Math.min(TOUR_DOTS - 1, Math.max(1, Math.round((1 - directShare) * TOUR_DOTS)));
}

/**
 * The guessing game on the second idea (owner, 12 November 2026): before the figure, the visitor says how many of
 * 100 acquisitions they think are direct. While they move the slider the dots show their own answer, so here a
 * guess of 0 or 100 leaves one kind of dot only; the answer then moves the dots to the real split.
 */
export function guessContractDots(guess: number): number {
  return TOUR_DOTS - Math.round(Math.min(100, Math.max(0, guess)) / 100 * TOUR_DOTS);
}
export function guessVerdict(guess: number, directShare: number): string {
  const real = Math.round(directShare * 100), off = Math.abs(real - guess);
  const lead = off <= 5 ? "Aproape exact:" : off <= 20 ? "Pe aproape:" : real > guess ? "Sunt mai multe:" : "Sunt mai puține:";
  return `Ai spus ${guess} din 100. ${lead} ${tourPercent(directShare)} sunt directe.`;
}

/** The dots that stand out on the signal step. Spread out, so a finger can reach each. */
export const TOUR_SIGNAL_DOTS: readonly number[] = [23, 47, 68, 112, 131, 155, 178];

/**
 * Example signals for those dots. Illustrative on purpose: a tour must not pin a pattern on a named institution
 * (signals are leads, not proof). The names are the site's own pattern names.
 */
export const TOUR_SIGNAL_EXAMPLES: readonly (readonly [name: string, text: string])[] = [
  ["Adunate, trec de plafon", "24 de achiziții mici la aceeași firmă, pentru același fel de lucru, în același an. Fiecare e sub plafon; împreună îl depășesc."],
  ["O firmă are mare parte din valoare", "O singură firmă are 71% din valoarea achizițiilor directe ale unei instituții."],
  ["Chiar sub plafon", "Patru achiziții de câte 268.000 lei, la 2.120 lei sub plafonul de 270.120 lei."],
  ["Un singur ofertant", "O licitație la care s-a depus o singură ofertă."],
  ["Apropiate în timp", "Trei achiziții pentru același lucru, la aceeași firmă, în aceeași săptămână."],
];

/** The question the tour types and leaves in the home page's search field. */
export function tourQuery(topic: TourTopic, countyLabel: string): string {
  return `cine câștigă cei mai mulți bani din ${topic.query} în ${countyLabel}`;
}

/** Other ways to ask, offered on the search step; each is read by the rules interpreter. */
export function tourQueryAlternatives(topic: TourTopic, countyLabel: string, year: number): string[] {
  return [`${topic.query} în ${countyLabel} în ${year}`, `${topic.query} peste 1 milion de lei`];
}

/** What the two bars say together, in one line. */
export function splitLine(reading: TourReading): string {
  if (reading.shareByCount - reading.shareByValue > 0.2) return "Cele mai multe achiziții sunt directe, dar cei mai mulți bani trec prin licitații.";
  if (reading.shareByValue > 0.5) return "Aici și cea mai mare parte din bani trece prin achiziții directe.";
  return "Împărțirea după număr și cea după bani arată diferit. Merită privite amândouă.";
}

/** Seen, skipped or finished: kept in this browser, in localStorage and in a cookie (either may be blocked). */
export const TOUR_SEEN_KEY = "cc-tour";
export const TOUR_SEEN_COOKIE = "cc_tour";
/** The question handed to the home page's search field when the tour ends on another page. */
export const TOUR_QUERY_KEY = "cc-tour-query";
export const TOUR_QUERY_EVENT = "cc-tour-query";
/** `/?tur=1` opens the tour again (the footer's link). */
export const TOUR_PARAM = "tur";

/** Pages where a first visitor gets neither the tour nor its invitation: the private space, the admin and sign-in. */
const QUIET_PREFIXES = ["/login", "/admin", "/cont", "/anchete", "/urmariri", "/l"];
export function tourQuietPath(pathname: string): boolean {
  return QUIET_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * What a first page load shows: the tour itself on the home page, an invitation elsewhere, nothing for a signed-in
 * visitor, one who has seen it, an automated browser, or a quiet page. `/?tur=1` always opens it.
 */
export function tourEntry(input: { pathname: string; forced: boolean; seen: boolean; signedIn: boolean; automated: boolean }): "tour" | "invite" | "none" {
  if (input.forced) return "tour";
  if (input.seen || input.signedIn || input.automated || tourQuietPath(input.pathname)) return "none";
  return input.pathname === "/" ? "tour" : "invite";
}
