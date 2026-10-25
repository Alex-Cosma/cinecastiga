import { defaultQuestion, localityScopeError, questionErrors, questionKey, transitionQuestion } from "../question-ui";
import { validateSpec, type Block } from "../spec";
import { filterContext } from "./context";
import { FILTERS, placedSlots, writeFocal } from "./registry";
import type { Party } from "./defs/selection";
import { choicesOf, choiceState, type Choice } from "./pickers";
import { chooseQuestion } from "./transition";
import type { Availability, FilterCtx, FilterSpec, Placement, Slot } from "./types";

/*
 * The walk of F1b's builder (registry.test.ts, plan §6.1): every row of every
 * window BLOCK_FILTERS draws on a draft, and what the builder and the engine
 * say about the result. Today's builder (F0) and its walk left when
 * QuestionBuilder began to render from BLOCK_FILTERS (F1b-builder-a).
 */

/** One row of one window of BLOCK_FILTERS on a draft, with its state (pickers.ts). */
export interface PlacedChoice { placement: Placement; slot: Slot; choice: Choice; state: Availability }

/** Every row of every window F1b's builder draws on `spec`: the sentence, invitations, rows, presentation, strip and P9. */
export function choicesOn(spec: FilterSpec, ctx: FilterCtx = filterContext(spec)): PlacedChoice[] {
  return placedSlots(spec, ctx).flatMap(({ placement, slot }) =>
    choicesOf(slot, spec, ctx).map((choice) => ({ placement, slot, choice, state: choiceState(slot, choice, spec, ctx) })));
}

/** What the builder shows under "Vezi răspunsul" (questionErrors: required inputs, then validateSpec and the locality rule). */
export const builderErrors = (spec: FilterSpec): string[] => questionErrors(spec);
/** What /api/ask refuses: validateSpec, then the locality rule. */
export function engineError(spec: FilterSpec): string | null {
  const parsed = validateSpec(spec);
  return "error" in parsed ? parsed.error : localityScopeError(spec);
}
/** questionErrors' requests for an input the question needs (an entity, the second one, two years). */
export const REQUIRED_INPUTS = [
  "Alege instituția sau firma despre care vrei să afli mai multe.", "Alege și a doua instituție sau firmă pentru comparație.",
  "Alege instituția cumpărătoare.", "Alege firma furnizoare.", "Alege doi ani diferiți pentru a vedea schimbarea.",
];
/** One question of each kind, ready to run: the catalogue choice, with the inputs it needs (corpus builderQuestion). */
export function baseQuestions(year: number): { name: string; spec: FilterSpec }[] {
  // A trend chosen from the catalogue writes a new trend's options (chooseQuestion → trend-rules.ts enterTrend).
  const choose = (block: Block, edit: (q: FilterSpec) => FilterSpec = (q) => q) =>
    transitionQuestion(edit((block === "trend" ? chooseQuestion(defaultQuestion(), block) : transitionQuestion(defaultQuestion(), block)).spec as FilterSpec)).spec as FilterSpec;
  const buyer: Party = { name: "Comuna Exemplu", id: 101 }, firm: Party = { name: "Firma Exemplu SRL", id: 202 };
  const set = (patch: Partial<FilterSpec>) => (q: FilterSpec): FilterSpec => ({ ...q, ...patch, filters: { ...q.filters, ...patch.filters } });
  const years = { filters: { yearFrom: year - 1, yearTo: year } };
  return [
    { name: "table firms", spec: choose("table") },
    { name: "table institutions", spec: choose("table", set({ dim: "authority" })) },
    { name: "table counties", spec: choose("table", set({ dim: "county" })) },
    { name: "stat value", spec: choose("stat") },
    { name: "stat count", spec: choose("stat", set({ measure: "count" })) },
    { name: "timeseries", spec: choose("timeseries") },
    { name: "map", spec: choose("map") },
    { name: "breakdown", spec: choose("breakdown") },
    { name: "compare institutions", spec: choose("compare", (q) => set({ filters: { compareWith: "Comuna Alta", compareWithId: 103 } })(writeFocal(q, "authority", buyer))) },
    { name: "compare firms", spec: choose("compare", (q) => set({ filters: { compareWith: "Firma Alta SRL", compareWithId: 204 } })(writeFocal(q, "supplier", firm))) },
    { name: "trend firms", spec: choose("trend", set(years)) },
    { name: "trend institutions", spec: choose("trend", set({ dim: "authority", ...years })) },
    { name: "trend counties", spec: choose("trend", set({ dim: "county", ...years })) },
    { name: "network institution", spec: choose("network", (q) => writeFocal(q, "authority", buyer)) },
    { name: "network firm", spec: choose("network", (q) => writeFocal(q, "supplier", firm)) },
    { name: "sankey institution", spec: choose("sankey", (q) => writeFocal(q, "authority", buyer)) },
    { name: "sankey firm", spec: choose("sankey", (q) => writeFocal(q, "supplier", firm)) },
    { name: "fact_check", spec: choose("fact_check", set({ filters: { authorityName: buyer.name, authorityId: 101, supplierName: firm.name, supplierId: 202 } })) },
    { name: "distribution institution", spec: choose("distribution", (q) => writeFocal(q, "authority", buyer)) },
    { name: "distribution firm", spec: choose("distribution", (q) => writeFocal(q, "supplier", firm)) },
    { name: "scatter institutions", spec: choose("scatter", set({ dim: "authority" })) },
    { name: "scatter firms", spec: choose("scatter", set({ dim: "supplier" })) },
    { name: "leader value institutions", spec: choose("entity_card", set({ dim: "authority", rankBy: "value" })) },
    { name: "leader value firms", spec: choose("entity_card", set({ dim: "supplier", rankBy: "value" })) },
    { name: "leader risk institutions", spec: choose("entity_card", set({ dim: "authority", rankBy: "risk" })) },
    { name: "leader risk firms", spec: choose("entity_card", set({ dim: "supplier", rankBy: "risk" })) },
  ];
}
