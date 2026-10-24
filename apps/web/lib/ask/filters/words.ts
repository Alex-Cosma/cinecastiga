import { countWords } from "../answer-text";
import { formatInt } from "../../format";
import type { QueryPopulation } from "../population";
import { exclusionWords, splitExcluded } from "./origin";

/*
 * Word fragments shared by the answer title (question-ui.ts describeQuestion),
 * the interpreter's sentence (lib/intent/to-spec.ts sentenceFor), the
 * conditions of describe.ts and the builder's sentence (sentence.ts), in the
 * kit's vocabulary (kit §4). Kept apart from describe.ts because question-ui
 * imports them and the registry imports question-ui. Every number with a noun
 * goes through countWords (plan G10).
 */

type Spec = {
  dataset?: string | undefined;
  filters: { singleBidder?: unknown; minEmployees?: unknown; maxEmployees?: unknown };
  population?: QueryPopulation | undefined;
};

/** "4 angajați", "49 de angajați", "1 angajat". */
export const employeesCount = (n: number): string => countWords(n, "angajat", "angajați");

/** The employees after the firms they describe: "cu 1–49 de angajați", "fără angajați" (the sentence glues it to "firme"). */
export function employeesWords(minRaw: unknown, maxRaw: unknown): string | null {
  const min = minRaw === undefined ? undefined : Number(minRaw);
  const max = maxRaw === undefined ? undefined : Number(maxRaw);
  if (max === 0) return "fără angajați";
  if (min !== undefined && max !== undefined) return `cu ${formatInt(min)}–${employeesCount(max)}`;
  if (max !== undefined) return `cu cel mult ${employeesCount(max)}`;
  if (min !== undefined) return `cu cel puțin ${employeesCount(min)}`;
  return null;
}

/** The employees of the firms, as the title says it: "firme cu 1–49 de angajați", "firme fără angajați". */
export function employeesPhrase(minRaw: unknown, maxRaw: unknown): string | null {
  const words = employeesWords(minRaw, maxRaw);
  return words ? `firme ${words}` : null;
}

/** The firms a person leads today (ONRC, kit §4): the register says who leads now, not at the contract's date. */
export const adminLead = (one = false): string => one ? "condusă azi de" : "conduse azi de";
export const adminPhrase = (name: unknown): string => `firmele ${adminLead()} ${name ? String(name) : "persoana aleasă"}`;

/**
 * The data stream in the sentence (kit §4): the noun with its article
 * ("Cât valorează [achizițiile]"), without it ("Câte [achiziții]"), in the
 * genitive ("valoarea [tuturor achizițiilor]"), every stream named ("la
 * [toate achizițiile]"), after "prin"; then the verbs the noun takes.
 */
export const STREAM_WORDS = {
  all: { the: "achizițiile", bare: "achiziții", of: "tuturor achizițiilor", every: "toate achizițiile", via: "toate achizițiile", made: "făcute de", from: "de la" },
  da: { the: "achizițiile directe", bare: "achiziții directe", of: "achizițiilor directe", every: "achizițiile directe", via: "achiziții directe", made: "făcute de", from: "de la" },
  contracts: { the: "contractele din proceduri", bare: "contracte din proceduri", of: "contractelor din proceduri", every: "contractele din proceduri", via: "contracte din proceduri", made: "încheiate de", from: "câștigate de" },
} as const;
export type StreamWords = (typeof STREAM_WORDS)[keyof typeof STREAM_WORDS];
export const streamWords = (dataset: unknown): StreamWords =>
  dataset === "da" || dataset === "contracts" ? STREAM_WORDS[dataset] : STREAM_WORDS.all;

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/**
 * A town hall's place as the sentence names it, "primăria [Cluj-Napoca]"
 * (kit §4, never "primăria [Municipiului …]"): the stored label without its
 * kind of unit, with the county only when it adds information. A sector keeps
 * its genitive ("primăria Sectorului 1").
 */
export function localityName(label: string): string {
  const m = /^(.*?) \(([^)]+)\)$/.exec(label.trim());
  const name = (m ? m[1]! : label.trim());
  const county = m ? m[2]! : null;
  if (/^Sectorul /.test(name)) return name.replace(/^Sectorul /, "Sectorului ");
  const bare = name.replace(/^(?:Municipiul|Orașul|Comuna|mun\.|or\.|com\.)\s+/i, "");
  return county && !fold(bare).startsWith(fold(county)) ? `${bare} (${county})` : bare;
}

/** Month abbreviations, as the kit writes a window of months ("ian.–mai", "apr. 2018 – 25 sept. 2026"). */
export const MONTH_SHORT = ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sept.", "oct.", "nov.", "dec."] as const;

/**
 * The period as the sentence says it (kit §4 "Perioada"): "în [toți anii]",
 * "în [2025]", "în [2024–2025]", "în [mar.–iun. 2025]". An open end carries
 * its own preposition ("[din 2024 încoace]", "[până în 2025]"), so `lead` is
 * null. A month without its year is the builder's error, left out here.
 */
export function periodPhrase(f: { yearFrom?: unknown; yearTo?: unknown; monthFrom?: unknown; monthTo?: unknown }): { lead: "în" | null; value: string } {
  const y0 = f.yearFrom ? Number(f.yearFrom) : null, y1 = f.yearTo ? Number(f.yearTo) : null;
  const m0 = y0 && f.monthFrom ? Number(f.monthFrom) : null, m1 = y1 && f.monthTo ? Number(f.monthTo) : null;
  const bound = (y: number, m: number | null) => m ? `${MONTH_SHORT[m - 1] ?? m} ${y}` : String(y);
  if (y0 === null && y1 === null) return { lead: "în", value: "toți anii" };
  if (y0 === null) return { lead: null, value: `până în ${bound(y1!, m1)}` };
  if (y1 === null) return { lead: null, value: `din ${bound(y0, m0)} încoace` };
  if (y0 === y1 && m0 === null && m1 === null) return { lead: "în", value: String(y0) };
  if (m0 === null && m1 === null) return { lead: "în", value: `${y0}–${y1}` };
  if (y0 === y1 && m0 !== null && m1 !== null)
    return { lead: "în", value: m0 === m1 ? bound(y0, m0) : `${MONTH_SHORT[m0 - 1]}–${MONTH_SHORT[m1 - 1]} ${y0}` };
  return { lead: "în", value: `${bound(y0, m0)} – ${bound(y1, m1)}` };
}
/** The period with its preposition: "în 2025", "din 2024 încoace", or `all` when the question has none. */
export function periodWordsWith(f: Parameters<typeof periodPhrase>[0], all = "în toți anii"): string {
  const { lead, value } = periodPhrase(f);
  if (!f.yearFrom && !f.yearTo) return all;
  return lead ? `${lead} ${value}` : value;
}

/** The data stream after the period ("doar achiziții directe"); a single bidder says the stream itself. */
export function streamPhrase(spec: Spec, channelSaid = false): string | null {
  if (spec.filters.singleBidder) return "doar contracte cu un singur ofertant";
  if (spec.dataset === "da" && !channelSaid) return "doar achiziții directe";
  if (spec.dataset === "contracts") return "doar contracte din proceduri";
  return null;
}

/**
 * The tail of a title, after the period (plan G7): the stream, the employees
 * and what was left out of the calculation ("…, fără SYSTRA"). `channelSaid`:
 * the sentence already names direct acquisitions.
 */
export function titleTailParts(spec: Spec, channelSaid = false): string[] {
  const parts: string[] = [];
  const stream = streamPhrase(spec, channelSaid);
  if (stream) parts.push(stream);
  const employees = employeesPhrase(spec.filters.minEmployees, spec.filters.maxEmployees);
  if (employees) parts.push(employees);
  parts.push(...exclusionWords(splitExcluded(spec.population).excluded));
  return parts;
}

/** The tail as the title appends it: ", doar achiziții directe, fără SYSTRA" or nothing. */
export const titleTail = (spec: Spec, channelSaid = false): string => {
  const parts = titleTailParts(spec, channelSaid);
  return parts.length ? `, ${parts.join(", ")}` : "";
};
