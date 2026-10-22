import type { AskSpec, AuthorityKind } from "../ask/spec";

/**
 * Free-text question → typed interpretation. The rules interpreter
 * (rules.ts) is the only implementation today (owner decision 1, 22 Oct
 * 2026): deterministic, no text leaves the server. A future LLM interpreter
 * implements the same QuestionInterpreter contract and returns the same
 * Interpretation, so the API, the sentence and the spec mapping stay shared.
 */

/** What the person wants to know, from cue words ("cine câștigă", "cât"…). */
export type IntentKind =
  | "ranking_suppliers"
  | "ranking_authorities"
  | "total"
  | "breakdown"
  | "trend"
  | "compare"
  | "signals";

export interface Span {
  /** The words as the person typed them. */
  text: string;
  /** Token positions [start, end) in the tokenized question. */
  from: number;
  to: number;
}

export interface SubjectMatch {
  /** Value for AskFilters.cpvTerm: a curated synonym or a catalogue code. */
  term: string;
  /** Human label: the synonym, or the catalogue name. */
  label: string;
  /** Catalogue name behind the term (for a synonym, its CPV class). */
  cpvName: string | null;
  source: "synonym" | "catalog";
  matched: Span;
}

export type LocalityTip = "municipiu" | "oraș" | "comună" | "sector";

export interface PlaceMatch {
  kind: "county" | "locality";
  /** County display name ("Buzău"); for a locality, its county. */
  county: string;
  /** SIRUTA code of the locality (AskFilters.uatSiruta). */
  siruta?: number;
  tip?: LocalityTip;
  /** "Județul Buzău", "Municipiul Buzău", "Comuna Sălcioara". */
  name: string;
  /** Unambiguous label with the county: "Comuna Sălcioara (Ialomița)". */
  label: string;
  matched?: Span;
}

export interface EntityMatch {
  role: "authority" | "supplier";
  id: number | null;
  name: string;
  county: string | null;
  matched: Span;
}

export interface PersonMatch {
  key: string;
  name: string;
  birthYear: number | null;
  birthLocality: string | null;
  nFirms: number;
  matched: Span;
}

export interface PeriodMatch {
  yearFrom?: number;
  yearTo?: number;
  matched: Span;
}

export interface Interpretation {
  /** The question as received (trimmed, bounded). */
  text: string;
  /** Which interpreter produced it ("rules-v1"; later e.g. "llm-…"). */
  interpreter: string;
  intent: IntentKind | null;
  /** "cue": the person said it; "default": inferred from what was named. */
  intentSource: "cue" | "default" | null;
  /** Further intents named in the same question ("… și cât costă"). */
  otherIntents: IntentKind[];
  /** Rows the person wants ranked or profiled, from "firme"/"instituții". */
  dimHint: "supplier" | "authority" | null;
  subjects: SubjectMatch[];
  place: PlaceMatch | null;
  /** Other readings of the place: the same name elsewhere, or county vs city. */
  placeAlternatives: PlaceMatch[];
  /** The place name matched several localities and none was chosen. */
  placeAmbiguous: boolean;
  authorityKind: { kind: AuthorityKind; matched: Span } | null;
  authority: EntityMatch | null;
  supplier: EntityMatch | null;
  /** Several firms/institutions carry the typed name and none was chosen. */
  entityAlternatives: EntityMatch[];
  /** Second entity for "compară X cu Y". */
  compareWith: EntityMatch | null;
  person: PersonMatch | null;
  personAlternatives: PersonMatch[];
  period: PeriodMatch | null;
  dataset: "da" | "contracts" | null;
  singleBidder: boolean;
  measure: "count" | "value_per_capita" | null;
  topN: number | null;
  /** "cel mai / cea mai" + singular: one superlative entity. */
  superlative: boolean;
  employees: { min?: number; max?: number } | null;
  /** Words that carried meaning for the person but not for the rules. */
  leftover: string[];
  confidence: number;
  confidenceLabel: "high" | "medium" | "low" | "none";
  /** Plain-language notes about choices made. */
  notes: string[];
  /** Why this place was chosen over its alternatives ("Am ales județul…"); shown with the main reading only. */
  placeNote: string | null;
}

export interface InterpretContext {
  /** Relative periods ("anul trecut") resolve against this date. */
  now: Date;
}

/** The pluggable contract: rules today, an LLM-backed implementation later. */
export interface QuestionInterpreter {
  readonly id: string;
  interpret(text: string, context: InterpretContext): Promise<Interpretation>;
}

// ---------------------------------------------------------------- vocabulary

export interface PlaceEntry {
  kind: "county" | "locality";
  /** Folded name used for matching, without "municipiul/oraș" ("ramnicu sarat"). */
  key: string;
  county: string;
  siruta?: number;
  tip?: LocalityTip;
  name: string;
  label: string;
  population?: number | null;
}

export interface CpvHit {
  term: string;
  cpvName: string | null;
}

export interface EntityHit {
  id: number | null;
  name: string;
  county: string | null;
}

export interface PersonHit {
  key: string;
  name: string;
  birthYear: number | null;
  birthLocality: string | null;
  nFirms: number;
}

/**
 * Lookups the rules need. The SQL implementation (vocabulary-sql.ts) reuses
 * /api/suggest's queries; tests use an in-memory one.
 */
export interface Vocabulary {
  /** Every county plus every locality (UAT) and București sector. */
  places(): Promise<PlaceEntry[]>;
  /** Curated colloquial terms (reference.cpv_synonym), for typo tolerance. */
  synonyms(): Promise<string[]>;
  /** /api/suggest CPV semantics: catalogue labels and synonyms containing every word. */
  cpv(foldedPhrase: string): Promise<CpvHit[]>;
  authorities(foldedPhrase: string): Promise<EntityHit[]>;
  suppliers(foldedPhrase: string): Promise<EntityHit[]>;
  persons(foldedPhrase: string): Promise<PersonHit[]>;
}

// ---------------------------------------------------------------- API shape

export interface IntentAlternative {
  /** Short Romanian label for a button ("Doar primăria Municipiului Buzău"). */
  label: string;
  kind: "place" | "intent" | "person" | "entity";
  sentence: string;
  spec: AskSpec;
}

export interface IntentResult {
  q: string;
  interpretation: Interpretation;
  spec: AskSpec | null;
  sentence: string | null;
  alternatives: IntentAlternative[];
  /** Why no spec could be built, in plain words. */
  problem: string | null;
}
