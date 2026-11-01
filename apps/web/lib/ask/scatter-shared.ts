import { flagLabel } from "../flags";
import { formatInt } from "../format";
import { countWords, formatShare } from "./answer-text";
import { KIND_ONE } from "./question-ui";
import { SCATTER_FLAGS, SCATTER_FLAGS_BY_ROLE, SCATTER_RETIRED_FLAGS, type AskSpec, type RankBy } from "./spec";

/*
 * The risk cloud (scatter-3, plan §4.12, final scatter; rf-2026.18): "Ce
 * instituții / firme ies din tipar după risc și valoarea achizițiilor
 * directe?". Plain TypeScript for the answer, the builder's strip and the
 * server (lib/ask/scatter.ts computes the numbers). The group is the
 * sentence's (who, where); the chart puts each profile at its risk score
 * (0–100%) and its value; the strip beside it chooses who is named: the order
 * of the list ("Primele după" Risc | Valoare) and a signal ("Semnal", the
 * score's criteria), which colours the points that have it and narrows the
 * list, never the cloud. The score is not a probability of corruption;
 * signals are leads, not proof; the values are recorded, not payments.
 * scatter-2 (one band per number of criteria, the index 0–1) stays readable:
 * a watch's or a capture's stored answer renders as it did.
 */

export type ScatterRole = "authority" | "supplier";
export type ScatterFlag = (typeof SCATTER_FLAGS)[number];
export type RetiredScatterFlag = (typeof SCATTER_RETIRED_FLAGS)[number];

/*
 * The two floors are predicates.ts's RISK_MIN_DAS and ENTITY_CARD_MIN_DAS, written here because this module is the
 * screen's and predicates.ts brings the database package; scatter-shared.test.ts holds them equal.
 */
/** The cloud: profiles with at least this many accepted direct acquisitions (RISK_MIN_DAS, as the distribution). */
export const SCATTER_CLOUD_MIN_DAS = 10;
/** A group of fewer profiles than this is no cloud: the whole group is listed, from SCATTER_CLOUD_MIN_DAS acquisitions (final §4.4). */
export const SCATTER_CLOUD_MIN_PROFILES = 10;
/** The list: at least this many (ENTITY_CARD_MIN_DAS), so its first row is the answer of "Cine conduce?" on risk. */
export const SCATTER_LIST_MIN_DAS = 20;
/** The list holds at most this many profiles; the rest is on /semnale. */
export const SCATTER_LIST_MAX = 50;
/** Rows shown at first, and added by „Arată încă 10”. */
export const SCATTER_LIST_PAGE = 10;
/** Up to this many profiles the cloud is every point; above, density cells (by tenths of the score) with the named points exact (final §3.6). */
export const SCATTER_POINTS_MAX = 2000;
/** The profile basis in the pill (R0-pill-profile). */
export const SCATTER_PROFILE_PILL = "profil istoric: achiziții directe acceptate";

/** A signal in the order the strip lists it: the risk score's criteria (RISK_CRITERIA); the role keeps the ones it can meet. */
export const SCATTER_FLAG_ORDER: readonly ScatterFlag[] = SCATTER_FLAGS;
export const scatterFlagsOf = (role: ScatterRole): ScatterFlag[] => SCATTER_FLAG_ORDER.filter((flag) => SCATTER_FLAGS_BY_ROLE[role].includes(flag));
export const isScatterFlag = (value: unknown): value is ScatterFlag => (SCATTER_FLAGS as readonly unknown[]).includes(value);

/**
 * A retired signal's label (rf-2026.18: "Finalizare rapidă" no longer counts): only for the note that drops it from an
 * older link and for an answer stored before, which shows its chips as it did. Not a signal of today.
 */
export const RETIRED_SCATTER_LABELS: Readonly<Record<RetiredScatterFlag, string>> = { da_rapid: "Finalizare rapidă" };
export const isRetiredScatterFlag = (value: unknown): value is RetiredScatterFlag => (SCATTER_RETIRED_FLAGS as readonly unknown[]).includes(value);
/** A signal's short label, a retired one's too (flagLabel no longer knows it; an unknown code is itself). */
export const scatterFlagLabel = (code: string): string => (isRetiredScatterFlag(code) ? RETIRED_SCATTER_LABELS[code] : flagLabel(code));
/** The signal a question applies: a retired one (an older link, a watch) is none, and the answer says it dropped it. */
export const activeScatterFlag = (spec: Pick<AskSpec, "scatter">): ScatterFlag | null => {
  const flag: unknown = spec.scatter?.flag;
  return isScatterFlag(flag) ? flag : null;
};

/** scatter-2's signals per role, in its order: the bits of a stored answer's points (and the chips it showed). */
const SCATTER_V2_FLAGS: Readonly<Record<ScatterRole, readonly string[]>> = {
  authority: ["da_split", "da_year_end", "da_rapid", "da_round", "da_concentration"],
  supplier: ["da_split", "da_rapid", "da_round", "da_dependence"],
};
/** The signals of an answer, in the order its points' bits and its chips follow: today's, or a stored scatter-2's. */
export const scatterCodes = (data: { version: 2 | 3; role: ScatterRole }): readonly string[] =>
  data.version === 2 ? SCATTER_V2_FLAGS[data.role] : scatterFlagsOf(data.role);
/** The bit of a signal among `codes` (scatterCodes). */
export const codeBit = (codes: readonly string[], code: string): number => 1 << Math.max(0, codes.indexOf(code));
/** The bit of a signal on today's points (scatter-3). */
export const flagBit = (role: ScatterRole, flag: ScatterFlag): number => codeBit(scatterFlagsOf(role), flag);

interface CloudPointBase { id: string; name: string; value: number; nFlags: number; flags: number; nDas: number; county?: string | null }
/**
 * A point of the cloud: its risk score (displayed, 0–100) and the unrounded one (the list's order), the number of
 * criteria it meets, its signals as bits of scatterFlagsOf(role), so the chart marks the chosen one with no request.
 * `county`: every point of a cloud drawn point by point (up to 2,000), for the sheet of a point past the list's 50.
 */
export interface ScatterCloudPoint extends CloudPointBase { score: number; scoreRaw: number }
/** A point of a stored scatter-2 answer: its band is the number of criteria met. */
export type ScatterCloudPointV2 = CloudPointBase;

/**
 * Cells of the grey layer: [x bucket (1-based), y, profiles]. y is the tenth of the score (0 for 0–9 … 9 for 90–100) on
 * scatter-3, the number of criteria met (the band) on a stored scatter-2.
 */
export interface ScatterBands { minLog: number; maxLog: number; nx: number; total: number; cells: [number, number, number][] }

/** What a signal says of a profile: its years (repetate, decembrie) or its share (the others), and the records behind it. */
export interface ScatterFlagFact<C extends string = ScatterFlag> {
  code: C;
  /** da_split, da_year_end: the years of its instances (marts.flag_instances.period). */
  years?: number[];
  /** da_round, da_above_ceiling: the share of the direct acquisitions; da_concentration, da_dependence: the main partner's share of the value. */
  share?: number;
  /** da_concentration, da_dependence: the only partner (a firm's only client is automatic). */
  single?: true;
  /** The records behind the signal (the sources of the criterion are exactly these). */
  rows?: number;
}

interface ListRowBase {
  entityId: string;
  name: string;
  county: string | null;
  value: number;
  nDas: number;
  /** The criteria met. */
  nFlags: number;
  /** An institution's kind (authority-kind.ts), where the group mixes kinds. */
  kind?: string | null;
  /** A firm's employees and the year of the balance sheet; null: no filing. */
  employees?: number | null;
  employeesYear?: number | null;
}
export interface ScatterListRow extends ListRowBase {
  /** The risk score as displayed (0–100) and unrounded (the order). */
  score: number;
  scoreRaw: number;
  flags: ScatterFlagFact[];
}
/** A row of a stored scatter-2 answer: the index (criteria met / levels) and the signals of then. */
export interface ScatterListRowV2 extends ListRowBase { cri: number; flags: ScatterFlagFact<string>[] }

interface ScatterDataBase<P, R, F extends string> {
  role: ScatterRole;
  rankBy: RankBy;
  flag: F | null;
  group: {
    /** The cloud's profiles (at least 10 acquisitions), and the list's (at least 20). */
    n: number;
    nList: number;
    /** Fewer than 10 profiles: no chart, the whole group is the list. */
    small?: true;
  };
  /** Profiles of the cloud that have each signal. */
  criteria: Partial<Record<F, number>>;
  /** With the chosen signal: how many of the cloud and of the list have it. */
  chosen?: { n: number; nList: number };
  /** The value of the top 10% line of the cloud, in lei. */
  p90: number;
  /** Every profile (up to SCATTER_POINTS_MAX), or the cells of the cloud with the named points exact. */
  cloud: { points: P[] } | { bands: ScatterBands; flagged?: ScatterBands; named: P[] };
  /** The first 50 of the list in the order chosen, with the chosen signal only. */
  list: R[];
  /** A group under 10 with a place: the profiles of the same kind in the whole country (the way out's number). */
  wider?: number;
}
/** scatter-3 (rf-2026.18): the cloud on the risk score. */
export interface ScatterDataV3 extends ScatterDataBase<ScatterCloudPoint, ScatterListRow, ScatterFlag> { version: 3 }
/** scatter-2, stored by a watch or a capture before rf-2026.18: one band per number of criteria met (0…levels). */
export interface ScatterDataV2 extends ScatterDataBase<ScatterCloudPointV2, ScatterListRowV2, string> { version: 2; levels: number }
export type ScatterData = ScatterDataV3 | ScatterDataV2;

/** The order the list is in, as the strip's two words (scatter-3), and as a stored scatter-2 said them. */
export const RANK_WORDS: Readonly<Record<RankBy, string>> = { risk: "risc", value: "valoare" };
export const RANK_WORDS_V2: Readonly<Record<RankBy, string>> = { risk: "semnale", value: "valoare" };

/** A flag's chip: the short label with the number of profiles that have it. */
export function flagChipLabel(code: string, n: number): string {
  return `${scatterFlagLabel(code)} · ${formatInt(n)}`;
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
export function flagDetail(fact: ScatterFlagFact<string>): string | null {
  if (fact.years?.length) return yearsWords(fact.years);
  if (fact.single) return "un singur client";
  if (fact.share !== undefined) return formatShare(fact.share).replace(/,0%$/, "%");
  return null;
}

/** The pill's words for the chosen signal (none for a retired one, which the answer drops). */
export function scatterSignalWords(flag: string | undefined | null): string | null {
  return flag && isScatterFlag(flag) ? `semnal: ${flagLabel(flag).toLocaleLowerCase("ro-RO")}` : null;
}

/** A missing order is risk (final §4.2: a new question writes it explicitly). */
export const scatterRank = (spec: Pick<AskSpec, "scatter">): RankBy => spec.scatter?.rankBy ?? "risk";

/** "locul 20 din 82, după risc": the search's and the card's place (a stored scatter-2 says "după semnale"). */
export const listPlace = (rank: number, total: number, by: RankBy, words: Readonly<Record<RankBy, string>> = RANK_WORDS): string =>
  `locul ${formatInt(rank)} din ${formatInt(total)}, după ${words[by]}`;
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
