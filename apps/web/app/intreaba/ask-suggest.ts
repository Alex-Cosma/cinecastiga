import type { IntentResult } from "../../lib/intent/types";
import type { IntentChoice } from "./intent-line";

/*
 * Suggestions while a question is typed (UX audit Z2-08, owner 16 November 2026): the word before the name says what
 * is being named („firma” → firms, „spitalul”/„instituția” → institutions, „primăria” → localities, „în”/„din” →
 * places), the words after it up to the caret are the name being typed. A pick puts the exact name into the question;
 * Enter still asks the words as written. The interpreter is not touched: it reads the exact name as any typed one.
 */

export type SuggestKind = "supplier" | "authority" | "townhall" | "place" | "county";

/** What is being named at the end of the text: its kind, the typed fragment and where the replaced part starts. */
export interface SuggestCue {
  kind: SuggestKind;
  /** The text searched for (the cue word joins it when it is part of the institution's name: „spitalul județean buz”). */
  query: string;
  /** The typed fragment after the cue, as written. */
  fragment: string;
  /** Index in the text where a pick's insertion starts (the fragment, or the cue word when it is part of the name). */
  from: number;
}

export interface SuggestRow {
  /** What goes into the question. */
  insert: string;
  /** The name shown (the part typed is highlighted). */
  name: string;
  /** „firmă · Cluj”, „Oraș · Sibiu”, „județ”. */
  meta: string;
  /** A firm or an institution: the pick also fixes its identity when the interpreter finds several (pinnedChoice). */
  pin?: SuggestPin;
}

export interface SuggestPin { name: string; county: string | null }

export const SUGGEST_TITLES: Record<SuggestKind, string> = {
  supplier: "Firme",
  authority: "Instituții",
  townhall: "Localități",
  place: "Locuri",
  county: "Județe",
};

/** Characters folded one by one, so an index in the folded text is the same index in the original. */
export const foldChars = (text: string): string =>
  [...text].map((c) => {
    const f = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return f.length === 1 ? f : c.toLowerCase().slice(0, 1) || c;
  }).join("");

const SUPPLIER = new Set(["firma", "firmei", "compania", "companiei", "societatea", "societatii", "furnizorul", "furnizorului"]);
/** Words that open an institution's own name: they are searched with the name and replaced by it. */
const NAMED_AUTHORITY = new Set([
  "spitalul", "spitalului", "scoala", "scolii", "liceul", "liceului", "colegiul", "colegiului", "universitatea",
  "universitatii", "gradinita", "gradinitei", "teatrul", "teatrului", "muzeul", "muzeului", "inspectoratul",
  "inspectoratului", "directia", "directiei", "agentia", "agentiei", "consiliul", "consiliului", "regia", "regiei",
  "administratia", "administratiei",
]);
const AUTHORITY = new Set(["institutia", "institutiei"]);
const TOWNHALL = new Set(["primaria", "primariei", "orasul", "orasului", "municipiul", "municipiului", "comuna", "comunei"]);
const PLACE = new Set(["in", "din", "la"]);
const COUNTY = new Set(["judetul", "judetului"]);
/** Words no name holds: the question has gone on past the name („primăria Y care …”, „firma X după …”). */
const STOP = new Set(["care", "ce", "cat", "cate", "cati", "cand", "intre", "dupa", "anul", "anii", "fata", "cel", "cele", "cei", "mai"]);
/** The longest name followed after its cue word. */
const MAX_WORDS = 6;

const cueKind = (word: string): SuggestKind | null =>
  SUPPLIER.has(word) ? "supplier" : NAMED_AUTHORITY.has(word) || AUTHORITY.has(word) ? "authority"
    : TOWNHALL.has(word) ? "townhall" : COUNTY.has(word) ? "county" : PLACE.has(word) ? "place" : null;

/**
 * The cue at the end of `text` (the caret is at its end), or null: no cue word in the last words, nothing typed after
 * it, a fragment under 2 letters or with no letter („în 2024”), or a question that went on past the name.
 */
export function suggestCue(text: string): SuggestCue | null {
  const folded = foldChars(text);
  if (/[?!,;]\s*$/.test(folded)) return null;
  const words = [...folded.matchAll(/\S+/g)];
  for (let i = words.length - 1; i >= Math.max(0, words.length - 1 - MAX_WORDS); i--) {
    const word = words[i]![0].replace(/^[„"'(]+|[.,;:!?”"')]+$/g, "");
    const kind = cueKind(word);
    if (!kind) {
      if (STOP.has(word)) return null;
      continue;
    }
    // The cue is the last word: nothing is typed after it yet.
    if (i === words.length - 1) return null;
    const cueStart = words[i]!.index!, after = words[i + 1]!.index!;
    const tail = folded.slice(after);
    if (/[?!,;]/.test(tail) || tail.replace(/[^a-z]/g, "").length < 2) return null;
    const named = NAMED_AUTHORITY.has(word);
    // „primăria din Râm…”: the town hall's place.
    if (kind === "place" && i > 0 && TOWNHALL.has(words[i - 1]![0])) return { kind: "townhall", query: tail.trim(), fragment: text.slice(after).trim(), from: after };
    return { kind, query: (named ? folded.slice(cueStart) : tail).trim(), fragment: text.slice(after).trim(), from: named ? cueStart : after };
  }
  return null;
}

/** The text with the cue's fragment replaced by the picked name; the caret goes after it. */
export function applySuggestion(text: string, cue: SuggestCue, insert: string): string {
  return text.slice(0, cue.from) + insert;
}

/** The part of a name the fragment matched, for the highlight: [start, end) in the name, or null. */
export function matchedPart(name: string, fragment: string): [number, number] | null {
  const words = foldChars(fragment).split(/\s+/).filter((w) => w.length > 0);
  const last = words[words.length - 1];
  if (!last) return null;
  const folded = foldChars(name);
  const whole = foldChars(fragment).trim();
  const at = folded.indexOf(whole);
  if (at >= 0) return [at, at + whole.length];
  const first = folded.indexOf(words[0]!);
  return first >= 0 ? [first, first + words[0]!.length] : null;
}

/**
 * The reading of a picked firm or institution among the interpreter's choices (several names matched the words): the
 * same name, in the same county. The pick was the person's choice, so its answer opens as a chosen namesake does.
 */
export function pinnedChoice(result: IntentResult, pin: SuggestPin | null | undefined, text: string): IntentChoice | null {
  if (!pin || result.spec) return null;
  const name = foldChars(pin.name).trim();
  if (!foldChars(text).includes(name)) return null;
  const county = pin.county ? foldChars(pin.county) : null;
  const hit = result.alternatives.find((alt) => {
    if (alt.kind !== "entity") return false;
    const label = foldChars(alt.label);
    return label.startsWith(`${name} (`) && (!county || label.includes(`(${county})`)) || label === name;
  });
  return hit ? { spec: hit.spec, sentence: hit.sentence, label: hit.label } : null;
}

/** The two feeds the box reads: /api/suggest (firms, institutions) and /api/topic-search/places (counties, localities). */
export interface EntityFeed { authority: { name: string; county: string | null }[]; supplier: { name: string; county: string | null }[] }
export interface PlaceFeed { places: { id: string; name: string; detail: string; kind: "county" | "locality" | string }[] }

/** The feed a cue reads. */
export const suggestUrl = (cue: SuggestCue): string =>
  cue.kind === "supplier" || cue.kind === "authority"
    ? `/api/suggest?q=${encodeURIComponent(cue.query)}`
    : `/api/topic-search/places?q=${encodeURIComponent(cue.query)}`;

/** At most five rows, in the feed's order. `county` spells a county for the eye (countyName). */
export function suggestRows(cue: SuggestCue, feed: EntityFeed | PlaceFeed, county: (raw: string) => string): SuggestRow[] {
  if (cue.kind === "supplier" || cue.kind === "authority") {
    const list = (feed as EntityFeed)[cue.kind] ?? [];
    const noun = cue.kind === "supplier" ? "firmă" : "instituție";
    return list.slice(0, 5).map((e) => ({
      insert: e.name, name: e.name, meta: e.county ? `${noun} · ${county(e.county)}` : noun, pin: { name: e.name, county: e.county },
    }));
  }
  const places = (feed as PlaceFeed).places ?? [];
  const counties = new Set(places.filter((p) => p.kind === "county").map((p) => foldChars(p.name)));
  return places
    .filter((p) => cue.kind === "county" ? p.kind === "county" : cue.kind === "townhall" ? p.kind === "locality" : true)
    .slice(0, 5)
    .map((p) => p.kind === "county"
      ? { insert: cue.kind === "county" ? p.name : `județul ${p.name}`, name: p.name, meta: "județ" }
      // A locality named as its county („Iași”) is said as a locality, or the county would be read.
      : { insert: cue.kind === "place" && counties.has(foldChars(p.name)) ? `${unitWord(p.detail)} ${p.name}` : p.name, name: p.name, meta: p.detail });
}

const unitWord = (detail: string): string => {
  const kind = detail.split(" · ")[0];
  return kind === "Oraș" ? "orașul" : kind === "Comună" ? "comuna" : "municipiul";
};
