import { countWords } from "../answer-text";
import { formatInt } from "../../format";
import type { QueryPopulation } from "../population";
import { exclusionWords, splitExcluded } from "./origin";

/*
 * Word fragments shared by the answer title (question-ui.ts describeQuestion),
 * the interpreter's sentence (lib/intent/to-spec.ts sentenceFor) and the
 * conditions of describe.ts. Kept apart from describe.ts because question-ui
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

/** The employees of the firms, as the title says it: "firme cu 1–49 de angajați", "firme fără angajați". */
export function employeesPhrase(minRaw: unknown, maxRaw: unknown): string | null {
  const min = minRaw === undefined ? undefined : Number(minRaw);
  const max = maxRaw === undefined ? undefined : Number(maxRaw);
  if (max === 0) return "firme fără angajați";
  if (min !== undefined && max !== undefined) return `firme cu ${formatInt(min)}–${employeesCount(max)}`;
  if (max !== undefined) return `firme cu cel mult ${employeesCount(max)}`;
  if (min !== undefined) return `firme cu cel puțin ${employeesCount(min)}`;
  return null;
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
