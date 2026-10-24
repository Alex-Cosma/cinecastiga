import { PROFILE_FORMS, TRANSACTION_FORMS } from "./context";
import type { AnswerForm, FilterCtx, FilterId, FilterSpec, Scope } from "./types";

/*
 * The state of today, fixed at F0 (plan §2.2): what each key does to the
 * total on each question, and the choices today's builder offers and then
 * refuses. Neither table follows later stages: a stage that changes a scope
 * lists the change with its answer version, and F1b's offers (blocks.ts)
 * remove the refusals; registry.test.ts checks each one is gone.
 */

const on = (forms: readonly AnswerForm[], scope: Scope): Partial<Record<AnswerForm, Scope>> =>
  Object.fromEntries(forms.map((form) => [form, scope]));
const LOCALITY_FORMS = TRANSACTION_FORMS.filter((form) => !["map", "compare", "network", "sankey", "fact_check"].includes(form));

/**
 * TODAY_SCOPE: every key the engine of 4e90b00 applies, on each question it
 * applies it to. Almost everything is a selection on the records (rowPredicates,
 * profilePredicates): the total and "% din total" change with it.
 */
export const TODAY_SCOPE: Readonly<Partial<Record<FilterId, Partial<Record<AnswerForm, Scope>>>>> = {
  dataset: on(TRANSACTION_FORMS, "selection"),
  cpvTerm: on(TRANSACTION_FORMS, "selection"),
  authority: { ...on(TRANSACTION_FORMS, "selection"), distribution: "display" },
  supplier: { ...on(TRANSACTION_FORMS, "selection"), distribution: "display" },
  authorityKind: on([...TRANSACTION_FORMS, ...PROFILE_FORMS], "selection"),
  county: on([...TRANSACTION_FORMS, ...PROFILE_FORMS], "selection"),
  locality: on(LOCALITY_FORMS, "selection"),
  period: on(TRANSACTION_FORMS, "selection"),
  employees: on(TRANSACTION_FORMS, "selection"),
  admin: on(TRANSACTION_FORMS, "selection"),
  compareWith: { compare: "selection" },
  minimumRecords: on(TRANSACTION_FORMS.filter((form) => form !== "trend"), "selection"),
  population: on(TRANSACTION_FORMS, "selection"),
  singleBidder: on(TRANSACTION_FORMS, "selection"),
  dim: on(["table", "trend", "scatter", "entity_card:value", "entity_card:risk"], "display"),
  measure: on(["table", "stat", "timeseries", "map"], "display"),
  topN: on(["table", "trend"], "display"),
  rankBy: on(["entity_card:value", "entity_card:risk"], "display"),
};

/**
 * A key whose scope on a question differs from TODAY_SCOPE gives the same rows
 * and another "% din total": each change carries the answer version that says
 * so (plan §2.6; table:employees-2 in F3, trend-2 in F2). None in F0.
 */
export const SCOPE_CHANGES: readonly { filter: FilterId; form: AnswerForm; version: string }[] = [];

/** A choice today's builder offers on a question, and what follows it. */
export interface TodayRefusal {
  id: string;
  /** The filter the choice writes. */
  filter: FilterId;
  /** The question before the choice. */
  when(spec: FilterSpec, ctx: FilterCtx): boolean;
  /** Which of the values its control offers; all when absent. */
  values?(value: unknown): boolean;
  /**
   * "engine": validateSpec (or the locality rule of /api/ask) refuses the
   * question: R1, offered and then refused. "input": the choice empties an
   * input the question needs, and the builder asks for it again.
   */
  kind: "engine" | "input";
  /** The beginning of the message the builder then shows (questionErrors). */
  reason: string;
  /** What F1b does about it. */
  fix: string;
}

/** What unsupportedPopulationView refuses on a profile: a condition on the records, or the contracts stream. */
const TRANSACTION_FILTERS = ["cpvTerm", "yearFrom", "yearTo", "monthFrom", "monthTo", "singleBidder", "minEmployees", "maxEmployees", "adminName", "adminPersonKey"];
const recordConditions = (spec: FilterSpec) =>
  Boolean(spec.population || spec.minimumRecords || spec.dataset === "contracts" || TRANSACTION_FILTERS.some((key) => spec.filters[key] !== undefined));
const namedEntity = (ctx: FilterCtx) => ctx.named.authority || ctx.named.supplier;
const buyerPlace = (spec: FilterSpec) => Boolean(spec.filters.authorityKind || spec.filters.uatSiruta);
const defined = (value: unknown) => value !== undefined;
const PROFILE_REASON = "Acest răspuns folosește profiluri istorice de achiziții directe și nu poate respecta selecția de tranzacții.";
const FIRM_PROFILE_REASON = "Profilurile firmelor nu pot fi restrânse după tipul sau localitatea cumpărătorului.";
const PARK = "F1b: the conditions the index cannot apply are set aside (onTransition park, component 6: «Nu se aplică indicelui: ↺ …») and come back with the value axis.";

/**
 * The choices today's builder offers on a question it can run, and then
 * refuses (registry.test.ts walks every choice and every pair of choices from
 * each catalogue question and from the legacy corpus, and finds exactly
 * these). Listed in the stage notes; F1b removes the "engine" ones.
 */
export const TODAY_REFUSALS: readonly TodayRefusal[] = [
  { id: "trend-threshold", filter: "minimumRecords", values: defined, when: (_s, ctx) => ctx.form === "trend", kind: "engine",
    reason: "Filtrul «cel puțin N înregistrări» se aplică întregii selecții și nu este disponibil în diferența dintre doi ani.",
    fix: "F1b: no record threshold on the trend (hidden; «Mai multe filtre» is gone, R3). A link that carries one shows a refused «Din link» chip." },
  { id: "profile-threshold", filter: "minimumRecords", values: defined, when: (_s, ctx) => ctx.profile, kind: "engine", reason: PROFILE_REASON,
    fix: "F1b: hidden on the three profiles (R3; with variant A, «Selecție avansată» is absent there too)." },
  { id: "profile-population", filter: "population", values: defined, when: (_s, ctx) => ctx.profile, kind: "engine", reason: PROFILE_REASON,
    fix: "F1b: hidden on the three profiles (R3; with variant A, «Selecție avansată» is absent there too)." },
  { id: "profile-contracts", filter: "dataset", values: (value) => value === "contracts", when: (_s, ctx) => ctx.profile, kind: "engine", reason: PROFILE_REASON,
    fix: "F1b: the profile line (component 18) replaces the data stream chip on profiles; contracts is not offered." },
  { id: "risk-records", filter: "rankBy", values: (value) => value === "risk", when: (spec, ctx) => ctx.form === "entity_card:value" && recordConditions(spec),
    kind: "engine", reason: PROFILE_REASON, fix: PARK },
  { id: "risk-named", filter: "rankBy", values: (value) => value === "risk", when: (_s, ctx) => ctx.form === "entity_card:value" && namedEntity(ctx),
    kind: "engine", reason: "Acest răspuns compară o populație de profiluri; nu poate fixa o singură entitate.", fix: PARK },
  { id: "risk-firm-buyer", filter: "rankBy", values: (value) => value === "risk", when: (spec, ctx) => ctx.form === "entity_card:value" && spec.dim === "supplier" && buyerPlace(spec),
    kind: "engine", reason: FIRM_PROFILE_REASON, fix: PARK },
  { id: "risk-locality", filter: "rankBy", values: (value) => value === "risk", when: (spec, ctx) => ctx.form === "entity_card:value" && Boolean(spec.filters.uatSiruta),
    kind: "engine", reason: "Indicele de risc compară profiluri între ele, deci aici poți alege doar județul.", fix: PARK },
  { id: "firm-profile-buyer", filter: "dim", values: (value) => value === "supplier", when: (spec, ctx) => ["scatter", "entity_card:risk"].includes(ctx.form) && buyerPlace(spec),
    kind: "engine", reason: FIRM_PROFILE_REASON,
    fix: "F1b: the kind of institution is a phrase of the institutions' sentence; changing the subject to firms drops it with a note (onTransition)." },
  { id: "firm-focal-buyer", filter: "supplier", values: defined, when: (spec, ctx) => ctx.form === "distribution" && buyerPlace(spec),
    kind: "engine", reason: FIRM_PROFILE_REASON,
    fix: "F1b: choosing a firm as the profile drops the kind of institution with a note (onTransition), as the dimension does." },
  { id: "county-ranking", filter: "dim", values: (value) => value === "county",
    when: (spec, ctx) => ["table", "trend"].includes(ctx.form) && Boolean(spec.filters.county || spec.filters.uatSiruta),
    kind: "engine", reason: "Clasamentul e deja pe județe",
    fix: "F1b: «Județe» is disabled in «Ce clasăm?» while a county or a locality is chosen, with the reason (R1)." },
  { id: "ranking-pair", filter: "authority", values: defined,
    when: (spec, ctx) => ["table", "trend"].includes(ctx.form) && spec.dim !== "county" && ctx.named.supplier, kind: "engine", reason: "Ai filtrat pe o singură",
    fix: "F1b: a ranking of firms names its buyer, a ranking of institutions its firm, never both (the sentence has one of them); the other is disabled with the reason." },
  { id: "ranking-pair-firm", filter: "supplier", values: defined,
    when: (spec, ctx) => ["table", "trend"].includes(ctx.form) && spec.dim !== "county" && ctx.named.authority, kind: "engine", reason: "Ai filtrat pe o singură",
    fix: "F1b: a ranking of firms names its buyer, a ranking of institutions its firm, never both (the sentence has one of them); the other is disabled with the reason." },
  { id: "compare-role", filter: "authority", values: defined, when: (_s, ctx) => ctx.form === "compare" && ctx.role === "supplier", kind: "input",
    reason: "Alege și a doua instituție sau firmă pentru comparație.",
    fix: "Kept: a comparison is of two entities of one role; changing the role empties the second one (pickEntity)." },
  { id: "compare-role-firm", filter: "supplier", values: defined, when: (_s, ctx) => ctx.form === "compare" && ctx.role === "authority", kind: "input",
    reason: "Alege și a doua instituție sau firmă pentru comparație.",
    fix: "Kept: a comparison is of two entities of one role; changing the role empties the second one (pickEntity)." },
];
