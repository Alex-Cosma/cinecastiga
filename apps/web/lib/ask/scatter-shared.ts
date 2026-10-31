import { flagLabel } from "../flags";
import { formatInt } from "../format";
import { countWords, formatShare } from "./answer-text";
import { KIND_ONE } from "./question-ui";
import { SCATTER_FLAGS, SCATTER_FLAGS_BY_ROLE, type AskSpec, type RankBy } from "./spec";

/*
 * The risk cloud (scatter-2, plan §4.12, final scatter): "Ce instituții / firme
 * ies din tipar după risc și valoarea achizițiilor directe?". Plain TypeScript
 * for the answer, the builder's strip and the server (lib/ask/scatter.ts
 * computes the numbers). The group is the sentence's (who, where); the strip
 * beside the chart chooses who is named: the order of the list ("Primele
 * după" Semnale | Valoare) and a signal ("Semnal"), which colours the points
 * that have it and narrows the list, never the cloud. Signals are leads, not
 * proof; the values are recorded, not payments.
 */

export type ScatterRole = "authority" | "supplier";
export type ScatterFlag = (typeof SCATTER_FLAGS)[number];

/*
 * The two floors are predicates.ts's RISK_MIN_DAS and ENTITY_CARD_MIN_DAS, written here because this module is the
 * screen's and predicates.ts brings the database package; scatter-shared.test.ts holds them equal.
 */
/** The cloud: profiles with at least this many accepted direct acquisitions (RISK_MIN_DAS, as the distribution). */
export const SCATTER_CLOUD_MIN_DAS = 10;
/** A group of fewer profiles than this is no cloud: the whole group is listed, from SCATTER_CLOUD_MIN_DAS acquisitions (final §4.4). */
export const SCATTER_CLOUD_MIN_PROFILES = 10;
/** The list: at least this many (ENTITY_CARD_MIN_DAS), so its first row is the answer of "Cine conduce?" on the index. */
export const SCATTER_LIST_MIN_DAS = 20;
/** The list holds at most this many profiles; the rest is on /semnale. */
export const SCATTER_LIST_MAX = 50;
/** Rows shown at first, and added by „Arată încă 10”. */
export const SCATTER_LIST_PAGE = 10;
/** Up to this many profiles the cloud is every point; above, density cells with the named points exact (final §3.6). */
export const SCATTER_POINTS_MAX = 2000;
/** The profile basis in the pill (R0-pill-profile). */
export const SCATTER_PROFILE_PILL = "profil istoric: achiziții directe acceptate";

/** A signal in the order the strip lists it (final §3.4); the role keeps the ones it can meet. */
export const SCATTER_FLAG_ORDER: readonly ScatterFlag[] = ["da_split", "da_year_end", "da_rapid", "da_round", "da_concentration", "da_dependence"];
export const scatterFlagsOf = (role: ScatterRole): ScatterFlag[] => SCATTER_FLAG_ORDER.filter((flag) => SCATTER_FLAGS_BY_ROLE[role].includes(flag));
export const isScatterFlag = (value: unknown): value is ScatterFlag => (SCATTER_FLAGS as readonly unknown[]).includes(value);

/** The criteria a role can meet: the chart's bands are 0…this. */
export const scatterLevels = (role: ScatterRole): number => SCATTER_FLAGS_BY_ROLE[role].length;

/**
 * A point of the cloud: its signals as bits of scatterFlagsOf(role), so the chart marks the chosen one with no request.
 * `county`: every point of a cloud drawn point by point (up to 2,000), for the sheet of a point past the list's 50.
 */
export interface ScatterCloudPoint { id: string; name: string; value: number; nFlags: number; flags: number; nDas: number; county?: string | null }
export const flagBit = (role: ScatterRole, flag: ScatterFlag): number => 1 << Math.max(0, scatterFlagsOf(role).indexOf(flag));

/** Cells of the grey layer: [x bucket (1-based), criteria met (the band), profiles]. */
export interface ScatterBands { minLog: number; maxLog: number; nx: number; total: number; cells: [number, number, number][] }

/** What a signal says of a profile: its years (fracționare, decembrie) or its share (the others), and the records behind it. */
export interface ScatterFlagFact {
  code: ScatterFlag;
  /** da_split, da_year_end: the years of its instances (marts.flag_instances.period). */
  years?: number[];
  /** da_rapid, da_round: the share of the direct acquisitions; da_concentration, da_dependence: the main partner's share of the value. */
  share?: number;
  /** da_concentration, da_dependence: the only partner (a firm's only client is automatic). */
  single?: true;
  /** The records behind the signal (the sources of the criterion are exactly these). */
  rows?: number;
}

export interface ScatterListRow {
  entityId: string;
  name: string;
  county: string | null;
  value: number;
  nDas: number;
  cri: number;
  nFlags: number;
  flags: ScatterFlagFact[];
  /** An institution's kind (authority-kind.ts), where the group mixes kinds. */
  kind?: string | null;
  /** A firm's employees and the year of the balance sheet; null: no filing. */
  employees?: number | null;
  employeesYear?: number | null;
}

export interface ScatterData {
  version: 2;
  role: ScatterRole;
  /** The chart's bands: 0…levels criteria met. */
  levels: number;
  rankBy: RankBy;
  flag: ScatterFlag | null;
  group: {
    /** The cloud's profiles (at least 10 acquisitions), and the list's (at least 20). */
    n: number;
    nList: number;
    /** Fewer than 10 profiles: no chart, the whole group is the list. */
    small?: true;
  };
  /** Profiles of the cloud that have each signal. */
  criteria: Partial<Record<ScatterFlag, number>>;
  /** With the chosen signal: how many of the cloud and of the list have it. */
  chosen?: { n: number; nList: number };
  /** The value of the top 10% line of the cloud, in lei. */
  p90: number;
  /** Every profile (up to SCATTER_POINTS_MAX), or the cells of the cloud with the named points exact. */
  cloud: { points: ScatterCloudPoint[] } | { bands: ScatterBands; flagged?: ScatterBands; named: ScatterCloudPoint[] };
  /** The first 50 of the list in the order chosen, with the chosen signal only. */
  list: ScatterListRow[];
  /** A group under 10 with a place: the profiles of the same kind in the whole country (the way out's number). */
  wider?: number;
}

/** The order the list is in, as the strip's two words. */
export const RANK_WORDS: Readonly<Record<RankBy, string>> = { risk: "semnale", value: "valoare" };

/** A flag's chip: the short label with the number of profiles that have it. */
export function flagChipLabel(code: string, n: number): string {
  return `${flagLabel(code)} · ${formatInt(n)}`;
}

/** The years of a signal as runs and lists: 2018–2019, 2022, "2019, 2021–2023". */
export function yearsWords(years: readonly number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    runs.push(j - i >= 1 ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }
  return runs.join(", ");
}

/** What follows a signal's label in the list: the years or the share ("2018–2019", "25%", "91%", "un singur client"). */
export function flagDetail(fact: ScatterFlagFact): string | null {
  if (fact.years?.length) return yearsWords(fact.years);
  if (fact.single) return "un singur client";
  if (fact.share !== undefined) return formatShare(fact.share).replace(/,0%$/, "%");
  return null;
}

/** The pill's words for the chosen signal. */
export function scatterSignalWords(flag: ScatterFlag | undefined | null): string | null {
  return flag ? `semnal: ${flagLabel(flag).toLocaleLowerCase("ro-RO")}` : null;
}

/** A missing order is the signals (final §4.2: a new question writes it explicitly). */
export const scatterRank = (spec: Pick<AskSpec, "scatter">): RankBy => spec.scatter?.rankBy ?? "risk";

/** "locul 20 din 82, după semnale": the search's and the card's place. */
export const listPlace = (rank: number, total: number, by: RankBy): string => `locul ${formatInt(rank)} din ${formatInt(total)}, după ${RANK_WORDS[by]}`;
export const belowListWords = (nDas: number): string => `nu intră în listă: ${countWords(nDas, "achiziție directă", "achiziții directe")}, sub ${SCATTER_LIST_MIN_DAS}`;

/**
 * The question after the strip's choice (answer-state appliedAfterStrip, the builder's patchDraft): "rankBy:value",
 * "rankBy:risk", "flag:da_split", "flag:" (every profile). Only that key changes; an emptied `scatter` leaves.
 */
export function withScatterChoice<T extends { scatter?: AskSpec["scatter"] | undefined }>(spec: T, value: string): T {
  const [key, option = ""] = value.split(":") as ["rankBy" | "flag", string];
  const options: NonNullable<AskSpec["scatter"]> = { ...spec.scatter };
  if (key === "rankBy" && (option === "risk" || option === "value")) options.rankBy = option;
  if (key === "flag") { if (isScatterFlag(option)) options.flag = option; else delete options.flag; }
  const next = { ...spec };
  if (Object.keys(options).length) next.scatter = options; else delete next.scatter;
  return next;
}

/** The group in plural, with its article: "spitalele", "primăriile de comună", "firmele" (the way out, the empty search). */
export function groupPlural(role: ScatterRole, kind: string | null | undefined): string {
  if (role === "supplier") return "firmele";
  if (!kind) return "instituțiile publice";
  return ({ comuna: "primăriile de comună", oras_municipiu: "primăriile de oraș și municipiu", consiliu_judetean: "consiliile județene", spital: "spitalele", scoala: "școlile" } as Record<string, string>)[kind]
    ?? "instituțiile de acest tip";
}

/** The pill's noun: "82 de primării de comună", "72.655 de firme". */
export function groupNoun(n: number, role: ScatterRole, kind: string | null | undefined): string {
  if (role === "supplier") return countWords(n, "firmă", "firme");
  const word = kind ? { one: KIND_ONE[kind] ?? "instituție publică", many: ({ comuna: "primării de comună", oras_municipiu: "primării de oraș și municipiu", consiliu_judetean: "consilii județene", spital: "spitale", scoala: "școli" } as Record<string, string>)[kind] ?? "instituții publice" }
    : { one: "instituție publică", many: "instituții publice" };
  return countWords(n, word.one, word.many);
}

