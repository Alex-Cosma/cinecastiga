import type {
  AskFilters, AskSpec, Block, NetworkOptions, PeersOptions, SankeyOptions, ScatterOptions, TimeseriesOptions, TrendOptions,
} from "../spec";
import type { QuestionSpec } from "../question-ui";
import type { GlossaryId } from "../../glossary";

/*
 * The filter registry (plan §2.1, §2.2): one description of every key of a
 * question, where each question offers it, how the engine applies it and what
 * it does to the total. Plain TypeScript for client and server: no React, no SQL.
 * F0 describes the builder of today (QuestionBuilder.tsx); F1b renders from it.
 */

/** The question the registry reads and writes: the builder's spec, with the block options read ahead (F0a). */
export type FilterSpec = QuestionSpec;

type Sub<K extends string, T> = `${K}.${Extract<keyof T, string>}`;
/** Every path of AskSpec: top-level keys, `filters.*` and the sub-keys of each block option. */
export type SpecPath =
  | Exclude<keyof AskSpec, "filters" | "trend" | "timeseries" | "network" | "sankey" | "scatter" | "peers">
  | Sub<"filters", AskFilters>
  | Sub<"trend", TrendOptions> | Sub<"timeseries", TimeseriesOptions> | Sub<"network", NetworkOptions>
  | Sub<"sankey", SankeyOptions> | Sub<"scatter", ScatterOptions> | Sub<"peers", PeersOptions>;

/**
 * What the engine answers, which is the block except for "Cine conduce?": on
 * value it is the transaction ranking (runSpec runs table topN 1), on the risk
 * index a historical profile (a missing rankBy is the index, leaderAxis).
 */
export type AnswerForm = Exclude<Block, "entity_card"> | "entity_card:value" | "entity_card:risk";

export type FilterId =
  // today's builder (QuestionBuilder.tsx) and the stored keys it keeps
  | "dataset" | "cpvTerm" | "authority" | "authorityKind" | "county" | "locality" | "period"
  | "supplier" | "employees" | "admin" | "compareWith"
  | "dim" | "measure" | "topN" | "rankBy"
  | "minimumRecords" | "population" | "singleBidder" | "comparisonMode"
  // read ahead (F0a), offered by the stage that implements them
  | "purchaseKind" | "procedure" | "purchaseValue" | "firmSeat" | "seatCounty" | "sharedPartners" | "newSince"
  | "mainClient" | "dominantSupplier" | "exclude"
  | "trendChange" | "trendMonths" | "trendOrder" | "trendMinBase" | "trendFirstOnly"
  | "timeseriesGrain" | "timeseriesSplit" | "timeseriesMonths"
  | "networkPartners" | "networkSince" | "networkOrder" | "networkShow" | "networkSignals"
  | "sankeyShown" | "scatterFlag" | "scatterRankBy" | "peers";

/** P1–P9 (kit §2). Today: sentence, under (the chips row), invite ("Adaugă o condiție"), presentation, advanced ("Mai multe filtre"). */
export type Placement = "sentence" | "invite" | "row" | "under" | "presentation" | "strip" | "rowMenu" | "fact" | "advanced";

export type ControlKind =
  // today's pickers (QuestionBuilder pickerBody)
  | "list" | "entitySearch" | "placeSearch" | "localitySearch" | "domainSearch" | "personSearch" | "period" | "range"
  | "minimum" | "population" | "none"
  // the kit's (F1a), for the keys read ahead
  | "toggle" | "segmented" | "countGroups" | "countPills" | "bands" | "rangePills" | "peers";

/**
 * What a condition does to the answer's total (plan §2.1 P3a/P3b): a selection
 * changes it; a group narrows the list and keeps the total of the sentence;
 * display changes what is drawn or in which order.
 */
export type Scope = "selection" | "group" | "display";
/**
 * How the engine computes it (plan §2.5). `block` is the shape of the answer
 * (what a row is, which axis), neither a condition on the records nor a group.
 */
export type EngineLevel = "row" | "entityAttr" | "group" | "profile" | "display" | "block";

export type Availability =
  | { state: "offered" }
  | { state: "disabled"; reason: string; term?: GlossaryId }
  | { state: "hidden" };

export type TransitionResult =
  | { kind: "keep" }
  | { kind: "drop"; note: string }
  | { kind: "move"; to: (s: FilterSpec) => FilterSpec; note: string }
  | { kind: "park"; label: string };

/** What a picker knows besides the spec (lib/ask/filters/context.ts). */
export interface FilterCtx {
  block: Block;
  form: AnswerForm;
  /** The role of the named or focal entity (focalRole). */
  role: "authority" | "supplier";
  /** A historical profile: distribution, scatter, "Cine conduce?" on the index (isHistoricalProfile). */
  profile: boolean;
  named: { authority: boolean; supplier: boolean; compareWith: boolean; admin: boolean };
  /** Can this question be scoped to one locality (localityScopeSupport). */
  locality: { ok: true } | { ok: false; reason: string };
  /** The year the builder's period presets start from (today: the calendar year). */
  year: number;
  /** The archive's years, when the caller has read /api/data-coverage (F2's default years). */
  coverage?: { firstYear: number; lastYear: number; completeUntil?: string };
  /** Optional mart columns the server probed (seat_county, registered_year; F4, F5). */
  columns?: ReadonlySet<string>;
  /** Counts of the windows, from POST /api/ask/facets (F3). */
  facets?: Readonly<Record<string, unknown>>;
}

export interface FilterDef<V = unknown> {
  id: FilterId;
  /** The spec paths it owns: every path of AskSpec has exactly one owner (registry.test.ts). */
  keys: readonly SpecPath[];
  /** A control over part of another filter's key, owning none (the exclusions of `population`). */
  viewOf?: SpecPath;
  /** Its usual place; BLOCK_FILTERS says where each question puts it. */
  placement: Placement;
  control: ControlKind;
  /** Today's words: the item of "Adaugă o condiție" (label · detail), the picker's title and note. */
  label: string;
  detail?: string;
  windowTitle?: string;
  windowNote?: string;
  /** Where the engine applies it and how (the support declaration, plan §2.2). An absent form accepts and ignores it, or refuses it. */
  engine: Partial<Record<AnswerForm, EngineLevel>>;
  /** What it does to the total on a form it applies to (today's in TODAY_SCOPE, lib/ask/filters/today.ts). */
  scope(form: AnswerForm): Scope;
  /** Read ahead (F0a): the stage that implements it (READ_AHEAD_KEYS). */
  stage?: string;
  /** A key the engine of 4e90b00 did not have, applied from this stage on (F2: the trend's): it has no scope of today (TODAY_SCOPE). */
  since?: string;
  /** A spec carries it. */
  read(spec: FilterSpec): V | undefined;
  /** The spec after its own picker writes `value` (undefined: removed), with the picker's side effects. */
  write(spec: FilterSpec, value: V | undefined): FilterSpec;
  /**
   * The values its control offers on this spec: an option list, or probes
   * for a search (the contract tests try each one). Undefined = remove or "any".
   */
  choices(spec: FilterSpec, ctx: FilterCtx): readonly (V | undefined)[];
  /** Read ahead: one well-formed value, on a question of `sampleBlock`. */
  sample?: { block: Block; value: V; base?: Partial<FilterSpec> };
  /** F1b and later: the rule of a new key, called by validateSpec. */
  validate?(spec: AskSpec): string | null;
  /** F1b: keep, move, drop with a note or park on a change of question. */
  onTransition?(spec: FilterSpec, to: AnswerForm): TransitionResult;
}

/**
 * A window that writes several filters as one choice (pickers.ts):
 * - focal: the entity of a question about one entity, an institution or a firm (it sets the dimension to the role);
 * - subject: "Ce clasăm?", "Cine?", "Cine concurează?": firms, institutions (with their kind) or counties;
 * - buyer: "Cine a cumpărat?": every institution, a kind, one institution or a town hall, one of them at a time;
 * - from: "De la cine?": the tabs O firmă · Administrator · Ce fel de firme, one of them at a time (kit §5.24);
 * - peers: "Față de cine?", the group a distribution places its entity in, with today's keys (the county
 *   and, for institutions, the kind; F6a's peers come later): every one, a kind, a county, or both.
 */
export type Picker = "focal" | "subject" | "buyer" | "from" | "peers";

/** One control in a place: its filter, and the other filters the same picker writes. */
export interface Slot {
  id: FilterId;
  /** The builder's picker, when it is not the filter's own (types.ts Picker). */
  picker?: Picker;
  /** Filters the same picker also writes: the place picker writes a locality, the focal picker the other role. */
  writes?: readonly FilterId[];
  /** The chip has × (today: every chip but the data stream; the period only when set). */
  removable?: boolean;
  /** Words of this place when they differ from the filter's: an invitation's name ("Ce s-a cumpărat"), a row chip's. */
  label?: string;
  detail?: string;
  /** The title of the window it opens (R10), where the place has its own. */
  window?: string;
  /** The values this place offers when they are fewer than its filter's: a record threshold counts the ranked role only. */
  choices?: readonly unknown[];
  /** The question needs a value here (the pair of a verification): its window has no empty row (R1). */
  required?: true;
}

/**
 * A field of the precise selection "⋯ › Selecție avansată" offers (P9, plan
 * §1.1 variant A), with the rules it keeps: what the sentence cannot say
 * (lists, several counties, exact days, a winner's share, codes left out).
 */
export interface AdvancedField {
  field: "date" | "value" | "authority" | "supplier" | "cpv" | "county";
  ops: readonly ("gte" | "lte" | "in" | "not_in")[];
}

export type RowLabel = "Câștigătorii" | "Instituțiile" | "Furnizorii" | "Clienții";
/** A row of conditions (component 3): its chips, each with its own name and window. */
export interface ConditionRow { label: RowLabel; kind: "group" | "selection"; chips: readonly Slot[] }
export type RowAction = "records" | "exclude" | "deeper" | "entity";
export type FactId = string;

export interface BlockFilters {
  /** P1: the phrases of the sentence, in order (F1b: sentence.ts, one slot per editable phrase). */
  sentence(spec: FilterSpec, ctx: FilterCtx): readonly Slot[];
  /** Component 18: "Profil istoric · achiziții directe, toată arhiva (?)" on the three profiles. */
  scopeLine(spec: FilterSpec, ctx: FilterCtx): "historical-da" | null;
  /**
   * P2. Today's builder: the items of "Adaugă o condiție", the same generic
   * list on most questions, listed whether set or not (plan §1, R3). F1b: the
   * unset fragments of the sentence, in its order, at most four.
   */
  invites(spec: FilterSpec, ctx: FilterCtx): readonly Slot[];
  /** P3a / P3b. F1b: the partners' selection rows of the network and the flow; a group row comes with its stage and answer version (plan §2.1). */
  rows(spec: FilterSpec, ctx: FilterCtx): readonly ConditionRow[];
  /**
   * P4, the chips the question owns. Today's builder: its chips row (the data
   * stream always, the rest when set). F1b: none with today's keys; a link's
   * conditions (legacyConditions), the precise selection (advancedConditions)
   * and the parked row (transition.ts) sit there too, outside this table.
   */
  under(spec: FilterSpec, ctx: FilterCtx): readonly Slot[];
  /** P5: the line at the bottom of the builder ("Arată primele 10 firme, după …"). */
  presentation(spec: FilterSpec, ctx: FilterCtx): readonly Slot[];
  /**
   * P9. Today's builder: "Mai multe filtre" (record threshold and precise
   * selection) under every question but compare. F1b (variant A): "⋯ ›
   * Selecție avansată", only on the questions that apply it.
   */
  advanced(spec: FilterSpec, ctx: FilterCtx): readonly Slot[];
  /** P9's precise selection: the fields its editor offers on this question (none where `advanced` has no population). */
  advancedFields(spec: FilterSpec, ctx: FilterCtx): readonly AdvancedField[];
  /**
   * P6: the controls beside the answer that write a key (the data stream of the
   * network, the map's lens). Today none: the answer's links (a row's records,
   * one CPV level down, the entity page) are derived links, listed in
   * fixtures/site-links-inventory.ts.
   */
  strip: readonly FilterId[];
  rowMenu: readonly RowAction[];
  facts: readonly FactId[];
  exclude?: { field: "authority" | "supplier" | "cpv"; max: 5 };
}
