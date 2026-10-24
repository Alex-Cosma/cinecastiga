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

/** The question the registry reads and writes: the builder's spec plus the block options read ahead (F0a). */
export type FilterSpec = QuestionSpec & Pick<AskSpec, "trend" | "timeseries" | "network" | "sankey" | "scatter" | "peers">;

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
  | { state: "hidden" }
  /**
   * F0 only, the state of today: the builder offers it, then refuses the
   * question (R1). `refusal` names the TODAY_REFUSALS entry; `partial` when
   * only some of its values are refused. F1b turns each into hidden or disabled.
   */
  | { state: "refused"; reason: string; refusal: string; partial?: true };

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

/** One control in a place: its filter, and the other filters the same picker writes. */
export interface Slot {
  id: FilterId;
  /** The builder's picker, when it is not the filter's own: the focal entity (an institution or a firm). */
  picker?: "focal";
  /** Filters the same picker also writes: the place picker writes a locality, the focal picker the other role. */
  writes?: readonly FilterId[];
  /** The chip has × (today: every chip but the data stream; the period only when set). */
  removable?: boolean;
  /** Words of this place when they differ from the filter's (the county of a profile's comparison group). */
  label?: string;
  detail?: string;
}

export type RowLabel = "Câștigătorii" | "Instituțiile" | "Furnizorii" | "Clienții";
export interface ConditionRow { label: RowLabel; kind: "group" | "selection"; chips: readonly FilterId[] }
export type RowAction = "records" | "exclude" | "deeper" | "entity";
export type FactId = string;

export interface BlockFilters {
  /** P1: the phrases of the sentence, in order. */
  sentence(spec: FilterSpec, ctx: FilterCtx): readonly Slot[];
  /** Component 18. Today: the badge "Profiluri istorice · achiziții directe" and the note under the sentence. */
  scopeLine(spec: FilterSpec, ctx: FilterCtx): "historical-da" | null;
  /**
   * P2. Today: the items of "Adaugă o condiție", the same generic list on most
   * questions, listed whether set or not (plan §1, R3). F1b: the unset
   * fragments of the sentence, at most four.
   */
  invites(spec: FilterSpec, ctx: FilterCtx): readonly Slot[];
  /** P3a / P3b. None today; a group row comes with its stage and answer version (plan §2.1). */
  rows(spec: FilterSpec, ctx: FilterCtx): readonly ConditionRow[];
  /** P4. Today: the chips row under the sentence (the data stream always, the rest when set). */
  under(spec: FilterSpec, ctx: FilterCtx): readonly Slot[];
  /** P5: the line at the bottom of the builder ("Arată primele 10 firme, după …"). */
  presentation(spec: FilterSpec, ctx: FilterCtx): readonly Slot[];
  /** P9. Today: "Mai multe filtre" (record threshold and precise selection) under every question but compare. */
  advanced(spec: FilterSpec, ctx: FilterCtx): readonly FilterId[];
  /**
   * P6–P8. No filter is applied beside the answer today: its links (a row's
   * records, one CPV level down, the entity page) are derived links, listed in
   * fixtures/site-links-inventory.ts; F1b draws them as the strip and row menu.
   */
  strip: readonly FilterId[];
  rowMenu: readonly RowAction[];
  facts: readonly FactId[];
  exclude?: { field: "authority" | "supplier" | "cpv"; max: 5 };
}
