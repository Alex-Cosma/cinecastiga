import { countWords, formatShare } from "./answer-text";
import { DOMINANT_LABEL, employeesWords } from "./filters/words";
import { JOINT_TAG_FROM } from "./entity-card-shared";
import type { FirmFacts, InstitutionFacts, WinnerFacts } from "./winners";
import type { NewScope } from "./spec";

/*
 * F5, the ranked winners in the answer's words (plan §4.2 P6, P8; final table
 * §4; kit §4, P8): the line of the list's sum against the selection's, and the
 * facts that say why a row is on the list. Plain TypeScript for the page (the
 * facts come lazily from POST /api/ask/facets, part `rows`) and its tests.
 */

/** A question as the engine and the builder hold it (AskSpec, QuestionSpec). */
type Spec = { block: string; dim?: string | undefined; dataset?: string | undefined; filters: { [key: string]: unknown } };
/** One fact tag (app/intreaba/answer/RowFacts.tsx RowFact): neutral, accent (what the question picked out), caveat (amber). */
export interface WinnerTag { text: string; tone?: "accent" | "caveat" }

const newOf = (spec: Pick<Spec, "filters">): { scope: NewScope; since: number } | null =>
  spec.filters.newSince !== undefined && typeof spec.filters.newScope === "string" ? { scope: spec.filters.newScope as NewScope, since: Number(spec.filters.newSince) } : null;
const banded = (spec: Spec) => spec.filters.minEmployees !== undefined || spec.filters.maxEmployees !== undefined;

/**
 * The rankings whose rows have facts to read: institutions (their largest firm, always), firms with a chip of their
 * row, and any ranking of firms with contracts („în asociere”, S6; direct acquisitions have no consortium).
 */
export function rowFactsWanted(spec: Spec): boolean {
  if (spec.block !== "table") return false;
  if (spec.dim === "authority") return true;
  return spec.dim === "supplier" && (newOf(spec) !== null || spec.filters.mainClient === true || banded(spec) || spec.dataset !== "da");
}

/** "02.10.2024" from "2024-10-02". */
const day = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/**
 * The tag of „Firme noi” on a firm, in the sense the question chose (kit P8): "prima dată aici: 02.10.2024", "prima
 * dată în 2025", "înmatriculată în 2024"; null without the chip or the fact. Shared by "Cine câștigă?" and the
 * podium of "Cine conduce?" (app/intreaba/entity-card-answer.ts placeFacts).
 */
export function newFirmTag(spec: Pick<Spec, "filters">, f: Pick<FirmFacts, "first" | "registered" | "firstHere">): WinnerTag | null {
  const chosen = newOf(spec);
  if (chosen?.scope === "buyer" && f.firstHere) return { text: `prima dată aici: ${day(f.firstHere)}` };
  if (chosen?.scope === "archive" && f.first) return { text: `prima dată în ${f.first.slice(0, 4)}` };
  if (chosen?.scope === "registry" && f.registered !== null) return { text: `înmatriculată în ${f.registered}` };
  return null;
}

/**
 * A row's facts (kit P8, at most three, why it is there): on firms the chips the question set, "prima dată aici:
 * 02.10.2024", "prima dată în 2025", "înmatriculată în 2024", "0 angajați · bilanț 2024" (a filing more than two years
 * old in amber), "principalul client public", then "în asociere" from a quarter of the row's `value` (S6; the total
 * line's „în asociere: cote egale (?)” explains the share) and "din străinătate"; on institutions their largest firm
 * in the selection, "cel mai mare furnizor: X · 17%", in accent where it takes half from three records or more.
 */
export function winnerFactTags(spec: Spec, facts: WinnerFacts | undefined, year = new Date().getFullYear(), value: number | null = null): WinnerTag[] {
  if (!facts) return [];
  if ("top" in facts) return institutionTags(facts);
  const f = facts as FirmFacts, tags: WinnerTag[] = [];
  const chosen = newFirmTag(spec, f);
  if (chosen) tags.push(chosen);
  if (banded(spec) && f.employees !== null)
    tags.push({ text: `${countWords(f.employees, "angajat", "angajați")}${f.filed !== null ? ` · bilanț ${f.filed}` : ""}`, ...(f.filed !== null && f.filed < year - 2 ? { tone: "caveat" as const } : {}) });
  if (spec.filters.mainClient && f.main) tags.push({ text: "principalul client public", tone: "accent" });
  if (f.joint && value !== null && value > 0 && f.joint / value >= JOINT_TAG_FROM) tags.push({ text: "în asociere" });
  if (f.foreign) tags.push({ text: "din străinătate" });
  return tags;
}
function institutionTags(facts: InstitutionFacts): WinnerTag[] {
  const top = facts.top;
  if (!top) return [];
  const half = top.share >= 0.5 && top.count >= 3;
  return [{ text: `cel mai mare furnizor: ${top.name} · ${formatShare(top.share)}`, ...(half ? { tone: "accent" as const } : {}) }];
}

/**
 * The list's own words before its sum (final table §4 "Linia de total"): "177 de furnizori noi din 2024",
 * "3.658 de firme înmatriculate din 2024, cu 1–9 angajați", "1.027 de instituții la care o firmă ia peste
 * jumătate"; null without a chip of the row (the band alone keeps its words of F3).
 */
export function rankedGroupLead(spec: Spec, n: number): string | null {
  const chosen = newOf(spec);
  if (spec.dim === "authority") return spec.filters.dominantSupplier ? `${countWords(n, "instituție", "instituții")} la care ${DOMINANT_LABEL.charAt(0).toLocaleLowerCase("ro-RO")}${DOMINANT_LABEL.slice(1)}` : null;
  if (!chosen && !spec.filters.mainClient) return null;
  const parts: string[] = [];
  let noun = countWords(n, "firmă", "firme");
  if (chosen?.scope === "buyer") noun = `${countWords(n, "furnizor nou", "furnizori noi")} din ${chosen.since}`;
  else if (chosen?.scope === "archive") parts.push(`cu prima înregistrare din ${chosen.since}`);
  else if (chosen?.scope === "registry") parts.push(`${n === 1 ? "înmatriculată" : "înmatriculate"} din ${chosen.since}`);
  const size = employeesWords(spec.filters.minEmployees, spec.filters.maxEmployees);
  if (size) parts.push(size);
  if (spec.filters.mainClient) parts.push("cu instituția drept principal client public");
  if (!parts.length) return noun;
  // "177 de furnizori noi din 2024, cu 1–9 angajați"; "27 de firme cu prima înregistrare din 2024, fără angajați".
  return chosen?.scope === "buyer" ? `${noun}, ${parts.join(", ")}` : `${noun} ${parts.join(", ")}`;
}

/** A ranking page (compile.ts TABLE_PAGE_SIZE; winner-words.test.ts keeps them equal): "Unde e o firmă?" opens the page of a place. */
export const RANKING_PAGE_SIZE = 10;
