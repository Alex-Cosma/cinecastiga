import { defaultQuestion, localityScopeError, questionErrors, questionKey, transitionQuestion } from "../question-ui";
import { validateSpec, type Block } from "../spec";
import { filterContext } from "./context";
import { FILTERS, placedSlots, writeFocal, type OfferTable } from "./registry";
import type { Party } from "./defs/selection";
import { choicesOf, choiceState, type Choice } from "./pickers";
import { TODAY_BLOCK_FILTERS } from "./today-blocks";
import type { Availability, FilterCtx, FilterId, FilterSpec, Placement, Slot } from "./types";

/*
 * The walk of today's builder (today.test.ts, plan §6.1): every choice its
 * controls offer on a spec, applied as it applies them (the picker's write,
 * then transitionQuestion, as replaceDraft does), and what it says about the
 * result. F1b's offers have their own walk, through the pickers and
 * transition.ts (registry.test.ts).
 */

export interface Offer {
  filter: FilterId;
  placement: Placement;
  picker?: "focal";
  value: unknown;
  to: FilterSpec;
}

/** Every distinct choice offered on `spec`: its controls' values, × on a removable chip, both roles of the focal picker. */
export function offersOn(spec: FilterSpec, ctx: FilterCtx = filterContext(spec), table: OfferTable = TODAY_BLOCK_FILTERS): Offer[] {
  const seen = new Set<string>();
  const out: Offer[] = [];
  const add = (offer: Omit<Offer, "to">, to: FilterSpec) => {
    const normalized = transitionQuestion(to).spec as FilterSpec;
    const key = `${offer.filter}|${offer.picker ?? ""}|${questionKey(normalized)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...offer, to: normalized });
  };
  for (const { placement, slot } of placedSlots(spec, ctx, table)) {
    if (slot.picker === "focal") {
      for (const role of ["authority", "supplier"] as const)
        for (const party of FILTERS[role].choices(spec, ctx) as Party[])
          add({ filter: role, placement, picker: "focal", value: party }, writeFocal(spec, role, party));
      continue;
    }
    for (const id of [slot.id, ...(slot.writes ?? [])]) {
      const def = FILTERS[id];
      const values = [...def.choices(spec, ctx), ...(slot.removable && id === slot.id ? [undefined] : [])];
      for (const value of values) add({ filter: id, placement, value }, def.write(spec, value));
    }
  }
  return out;
}

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
/** "input" when the builder only asks for an input the question needs; "engine" when the question is refused. */
export const refusalKind = (errors: readonly string[]): "engine" | "input" =>
  errors.every((error) => REQUIRED_INPUTS.includes(error)) ? "input" : "engine";

/** One question of each kind, ready to run: the catalogue choice, with the inputs it needs (corpus builderQuestion). */
export function baseQuestions(year: number): { name: string; spec: FilterSpec }[] {
  const choose = (block: Block, edit: (q: FilterSpec) => FilterSpec = (q) => q) =>
    transitionQuestion(edit(transitionQuestion(defaultQuestion(), block).spec as FilterSpec)).spec as FilterSpec;
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
