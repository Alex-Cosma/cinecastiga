import type { SuggestResponse } from "@/app/api/suggest/route";
import { COUNTIES } from "./counties";
import { askHref } from "./discovery-links";
import { cleanName } from "./format";
import type { IntentResult, PlaceMatch, SubjectMatch } from "./intent/types";
import type { EntityHit } from "./search";
import { fold } from "./topic-search/shared";
import { placeId, remainingWords } from "./topic-search/words";

/**
 * Grouped suggestions of the home search box (and the header search dialog).
 * Pure: the component fetches /api/intent, /api/suggest and /api/search and
 * this module decides what is shown, in which order and where each row leads.
 * Every source is optional: a failed request only removes its groups.
 */

export type SuggestionGroupId = "likely" | "subjects" | "places" | "authorities" | "suppliers" | "persons" | "words";
export type SuggestionIcon = "question" | "layers" | "pin" | "building" | "network" | "search";

export interface Suggestion {
  id: string;
  label: string;
  detail?: string;
  href: string;
  icon: SuggestionIcon;
}

export interface SuggestionGroup {
  id: SuggestionGroupId;
  title: string;
  items: Suggestion[];
}

export interface SuggestionInput {
  /** The typed text, trimmed. */
  text: string;
  intent?: IntentResult | null;
  /** /api/suggest for the whole text. */
  vocab?: SuggestResponse | null;
  /** /api/suggest for the last word of a longer text ("iluminat buz" → "buz"). */
  lastWord?: { word: string; vocab: SuggestResponse } | null;
  /** /api/search (institutions and firms, Meilisearch). */
  entities?: EntityHit[] | null;
}

const TITLES: Record<SuggestionGroupId, string> = {
  likely: "Cel mai probabil cauți",
  subjects: "Subiecte",
  places: "Locuri",
  authorities: "Instituții",
  suppliers: "Firme",
  persons: "Persoane",
  words: "Caută cuvintele",
};
const MAX = { subjects: 4, places: 4, authorities: 4, suppliers: 4, persons: 3 };

const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);
const capital = (s: string) => s.charAt(0).toLocaleUpperCase("ro-RO") + s.slice(1);
const cauta = (q: string, place?: string | null) => `/cauta?${new URLSearchParams({ q, ...(place ? { place } : {}) })}`;

/**
 * A catalogue subject matched only on a fragment of a word ("construct" →
 * "Construcţie de canale") is a weak reading: the person is more likely
 * typing a name. Curated synonyms and whole catalogue words are not weak.
 */
export function weakSubject(s: SubjectMatch): boolean {
  if (s.source !== "catalog") return false;
  const typed = words(s.matched.text);
  const label = new Set(words(s.cpvName ?? s.label));
  return typed.some((w) => !label.has(w));
}

/** The interpretation of exactly this text, or null (stale or failed). */
function current(input: SuggestionInput) {
  const i = input.intent?.interpretation;
  return i && fold(i.text).trim() === fold(input.text).trim() ? input.intent! : null;
}

function countyLabel(name: string) {
  return name === "București" ? "Municipiul București" : `Județul ${name}`;
}

export function buildSuggestionGroups(input: SuggestionInput): SuggestionGroup[] {
  const text = input.text.trim();
  if (text.length < 2) return [];
  const intent = current(input);
  const i = intent?.interpretation ?? null;
  const subjects = i?.subjects ?? [];
  // A vocabulary label equal to the whole text is a subject even without the interpreter.
  const exactVocab = (input.vocab?.cpv ?? []).some((c) => fold(/^\d/.test(c.term) ? c.cpvName ?? "" : c.term).trim() === fold(text));
  const strongSubject = subjects.some((s) => !weakSubject(s)) || exactVocab;
  const place = i && !i.placeAmbiguous && i.place?.matched ? i.place : null;
  const named = Boolean(i && (i.authority || i.supplier || i.person));
  const understood = strongSubject || Boolean(place) || named || Boolean(i?.placeAmbiguous);
  const groups = new Map<SuggestionGroupId, Suggestion[]>();
  const push = (g: SuggestionGroupId, s: Suggestion) => {
    const list = groups.get(g) ?? [];
    if (list.some((x) => x.href === s.href || fold(x.label) === fold(s.label))) return;
    if (g in MAX && list.length >= MAX[g as keyof typeof MAX]) return;
    list.push(s);
    groups.set(g, list);
  };

  // 1. The interpreter's reading, verbatim. An ambiguous reading is offered as a choice, never picked.
  if (intent && i && understood && (i.confidenceLabel === "high" || i.confidenceLabel === "medium")) {
    if (intent.sentence) push("likely", { id: "likely", label: intent.sentence, detail: "Deschide întrebarea în Întreabă", href: `/intreaba?q=${encodeURIComponent(text)}`, icon: "question" });
    else if (intent.problem && intent.alternatives.length) push("likely", { id: "likely", label: intent.problem, detail: `${intent.alternatives.length} variante de ales în Întreabă`, href: `/intreaba?q=${encodeURIComponent(text)}`, icon: "question" });
  }

  // 2. Subjects: what the interpreter recognised, then the vocabulary matches.
  // (the subject with the place named in the words is a row of "Locuri")
  const subjectRest = place?.matched ? remainingWords(text, [place.matched]) : text;
  for (const s of subjects) {
    const label = s.source === "catalog" ? s.cpvName ?? s.label : s.label;
    push("subjects", { id: `subject:${s.term}`, label: capital(label), detail: s.source === "synonym" && s.cpvName ? `Subiect · de exemplu ${s.cpvName}` : "Subiect din catalogul CPV", href: cauta(label), icon: "layers" });
  }
  for (const c of input.vocab?.cpv ?? []) {
    const synonym = !/^\d/.test(c.term);
    const label = synonym ? c.term : c.cpvName ?? c.term;
    push("subjects", { id: `cpv:${c.term}`, label: capital(label), detail: synonym ? `Subiect${c.cpvName ? ` · de exemplu ${c.cpvName}` : ""}` : `Subiect din catalogul CPV · ${c.term}`, href: cauta(label), icon: "layers" });
  }

  // 3. Places. With other words ("iluminat buzau"), the place narrows the search for them.
  const placeRow = (id: string | null, label: string, detail: string, rest: string, askAbout: string) => {
    if (!id) return;
    if (rest.length >= 2) push("places", { id: `place:${id}`, label: `${rest} · ${label}`, detail: `Caută „${rest}” doar în ${label}`, href: cauta(rest, id), icon: "pin" });
    else push("places", { id: `place:${id}`, label, detail, href: `/intreaba?q=${encodeURIComponent(askAbout)}`, icon: "pin" });
  };
  const placeMatches: PlaceMatch[] = i ? [...(i.place ? [i.place] : []), ...i.placeAlternatives] : [];
  for (const p of placeMatches) {
    const rest = p.matched ? remainingWords(text, [p.matched]) : subjectRest;
    placeRow(placeId(p), p.kind === "county" ? p.name : p.label, p.kind === "county" ? "Ce cumpără instituțiile din județ" : "Ce cumpără primăria", rest, p.name);
  }
  const placeSources: { word: string; rest: string; vocab: SuggestResponse | null | undefined }[] = [
    { word: text, rest: "", vocab: input.vocab },
    ...(input.lastWord ? [{ word: input.lastWord.word, rest: text.slice(0, Math.max(0, text.length - input.lastWord.word.length)).trim(), vocab: input.lastWord.vocab }] : []),
  ];
  for (const { word, rest, vocab } of placeSources) {
    const key = fold(word).trim();
    if (key.length >= 3) for (const name of COUNTIES) if (fold(name).startsWith(key)) placeRow(`county:${fold(name)}`, countyLabel(name), "Ce cumpără instituțiile din județ", rest, countyLabel(name));
    for (const u of vocab?.uat ?? []) {
      if (u.tip === "sector") continue;
      const kind = u.tip === "municipiu" ? "Municipiul" : u.tip === "oraș" ? "Orașul" : "Comuna";
      const county = COUNTIES.find((c) => fold(c) === fold(u.county)) ?? u.county;
      placeRow(`uat:${u.siruta}`, `${kind} ${u.name} (${county})`, "Ce cumpără primăria", rest, `${kind} ${u.name}`);
    }
  }

  // 4. Institutions and firms (exact identities from the search index).
  for (const e of input.entities ?? []) {
    const authority = e.roles.includes("authority");
    push(authority ? "authorities" : "suppliers", {
      id: `entity:${e.id}`,
      label: cleanName(e.name),
      detail: [authority ? "Instituție publică" : "Firmă", e.county, e.cui ? `CUI ${e.cui}` : null].filter(Boolean).join(" · "),
      href: `/entitati/${e.id}`,
      icon: authority ? "building" : "network",
    });
  }

  // 5. Persons (ONRC administrators): only when the words read as a name.
  const personsRelevant = Boolean(i?.person || i?.personAlternatives.length) || (!strongSubject && !place && !(groups.get("places")?.length));
  if (personsRelevant)
    for (const p of input.vocab?.person ?? []) {
      const name = cleanName(p.name);
      const who = `${name}${p.birthYear ? ` (n. ${p.birthYear}${p.birthLocality ? `, ${p.birthLocality}` : ""})` : ""}`;
      push("persons", { id: `person:${p.key}`, label: name, detail: [p.birthYear ? `n. ${p.birthYear}` : null, p.birthLocality, `${p.nFirms} ${p.nFirms === 1 ? "firmă condusă" : "firme conduse"}`].filter(Boolean).join(" · "), href: askHref({ block: "table", measure: "value", dim: "supplier", filters: { adminPersonKey: p.key, adminName: who } }), icon: "network" });
    }

  push("words", { id: "words", label: `Caută „${text}” în titluri și documente`, detail: "Exact cuvintele scrise, fără interpretare", href: `/cauta?${new URLSearchParams({ q: text, literal: "1" })}`, icon: "search" });

  // Subjects and places lead when the words read as a subject or a place; names lead otherwise.
  const order: SuggestionGroupId[] = strongSubject || place
    ? ["likely", "subjects", "places", "authorities", "suppliers", "persons", "words"]
    : ["likely", "authorities", "suppliers", "persons", "subjects", "places", "words"];
  return order.filter((id) => groups.get(id)?.length).map((id) => ({ id, title: TITLES[id], items: groups.get(id)! }));
}

/** Options in keyboard order. */
export function flattenSuggestions(groups: SuggestionGroup[]): Suggestion[] {
  return groups.flatMap((g) => g.items);
}
