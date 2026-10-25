import { countyIsFirmSeat } from "../population";
import { focalRole, leaderAxis, localityScopeError, transitionQuestion, type QuestionSpec } from "../question-ui";
import { runnableError, type AskSpec } from "../spec";
import { filterContext } from "./context";
import { describeConditions } from "./describe";
import { presentConditions, refusedConditions, tautology, withoutConditions, type LegacyCondition } from "./legacy-conditions";
import { selectionOrigin } from "./origin";
import { parkedRow, pathValues, unpark, type Parked, type ParkedItem } from "./parked";
import { windowFilters, writeChoice, type Choice } from "./pickers";
import { FILTERS, visibleFilters } from "./registry";
import { sentenceTokens } from "./sentence";
import type { FilterId, FilterSpec, Slot } from "./types";

/*
 * Changing the draft (plan §2.4, §2.8 transitionQuestion "condus de
 * registru"): a choice in one of the question's windows, another question
 * from the catalogue, or a parked condition brought back. Every condition the
 * draft carried either stays (the new question shows it, or it is still a
 * link's chip the engine applies there), or leaves with a note in "Ce se
 * schimbă odată cu întrebarea", or, on a change of lens ("Cine conduce?",
 * value ↔ index), waits in the parked row. Never a silent drop.
 */

export interface Transition {
  spec: FilterSpec;
  /** "Ce se schimbă odată cu întrebarea": what changed besides the choice itself. */
  notes: string[];
  /** The conditions that left with a note (not the ones the chosen window replaced, nor the parked ones). */
  dropped: FilterId[];
  /** The parked row (component 6), or none. A draft state: never in the link. */
  parked: Parked | null;
  /** Another answer about what a note dropped ("Cât câștigă X ›", R8 "›"), by the note's text. */
  links?: Record<string, NoteLink>;
}

export type NoteLink = NonNullable<LegacyCondition["retarget"]>;

/** Whose place a county is: the buyer's, or the firm's own seat on a firm profile (countyIsFirmSeat). */
function countyMeaning(spec: FilterSpec): "place" | "seat" | null {
  if (!spec.filters.county) return null;
  return countyIsFirmSeat(spec, focalRole(spec)) ? "seat" : "place";
}

/** A parked chip names the phrase as the reader saw it ("2025", "„medicamente”"); a person or a town hall by its words. */
function phraseLabels(spec: FilterSpec): Map<FilterId, string> {
  const labels = new Map<FilterId, string>();
  for (const token of sentenceTokens(spec))
    if (token.kind === "slot" && token.says.length === 1 && !["admin", "locality"].includes(token.says[0]!)) labels.set(token.says[0]!, token.value);
  return labels;
}

/**
 * The draft after an edit, with every condition `before` carried accounted
 * for. `touched` are the filters of the window the reader used: what it
 * replaced needs no note. `lens`: set aside instead of dropping. `why`: the
 * note's reason, the new choice or the new question.
 */
function settle(
  before: FilterSpec, after: FilterSpec, opts: { lens: boolean; touched: readonly FilterId[]; why: string; whyApplied?: string },
): { spec: FilterSpec; notes: string[]; dropped: FilterId[]; parked: ParkedItem[]; links: Record<string, NoteLink> } {
  const touched = new Set(opts.touched);
  const visibleBefore = visibleFilters(before), visibleAfter = visibleFilters(after);
  // The words of a note or a parked chip, read only when one is needed.
  let words: ReturnType<typeof describeConditions>["byId"] | null = null, labels: Map<FilterId, string> | null = null;
  const say = (id: FilterId) => (words ??= describeConditions(before).byId)[id]?.words ?? FILTERS[id].label.toLowerCase();
  const labelOf = (id: FilterId) => (labels ??= phraseLabels(before)).get(id) ?? say(id);
  const presentBefore = presentConditions(before), presentAfter = presentConditions(after);
  const notes: string[] = [], dropped: FilterId[] = [];
  const parked: ParkedItem[] = [];
  const links: Record<string, NoteLink> = {};
  // What the window removed outside its own filters: a stream without the single bidder, another role without the second entity.
  for (const id of presentBefore.keys()) if (!touched.has(id) && !presentAfter.has(id)) {
    notes.push(`Am scos „${say(id)}”: nu se potrivește cu alegerea nouă.`);
    dropped.push(id);
  }
  let spec = after;
  const remove = (id: FilterId, why: string) => {
    // The ranked role's own entity on "Cine conduce?" would be the answer itself: the note says so and offers its total (final entity_card §4).
    const self = opts.lens ? null : tautology(spec, id);
    if (opts.lens) parked.push({ id, label: labelOf(id), values: pathValues(spec, FILTERS[id].keys) });
    else {
      const note = `Am scos „${say(id)}”: ${self?.why ?? why}.`;
      notes.push(note); dropped.push(id);
      if (self) links[note] = self.retarget;
    }
    spec = withoutConditions(spec, [id]);
  };
  const form = filterContext(after).form;
  for (const id of presentAfter.keys()) {
    if (touched.has(id)) continue;
    if (id === "county") {
      const was = countyMeaning(before), now = countyMeaning(after);
      if (was && now && was !== now) {
        // A county keeps its place where the sentence says the new meaning (a subject, a focal entity); a lens sets it aside.
        if (opts.lens || !visibleAfter.has("county")) remove(id, now === "seat" ? "aici județul e sediul firmei" : "aici județul e locul instituției");
        else notes.push(now === "seat" ? "Județul ales e acum sediul firmelor, nu locul instituțiilor." : "Județul ales e acum locul instituțiilor, nu sediul firmelor.");
        continue;
      }
    }
    if (visibleAfter.has(id)) continue;
    // A link's chip, or a selection another page made, stays a chip where the engine applies it.
    const chip = !visibleBefore.has(id) || id === "population" && selectionOrigin(before.population) !== null;
    if (chip && FILTERS[id].engine[form] !== undefined) continue;
    remove(id, opts.whyApplied && FILTERS[id].engine[form] !== undefined ? opts.whyApplied : opts.why);
  }
  // What the engine still refuses on the new question (a kind on firm profiles), but never the choice itself.
  if (errorOf(spec)) for (const id of refusedConditions(spec, (id) => touched.has(id)).keys()) remove(id, opts.why);
  return { spec, notes, dropped, parked, links };
}

const unique = (notes: readonly string[]) => [...new Set(notes)];
const errorOf = (spec: FilterSpec) => runnableError(spec as unknown as AskSpec) ?? localityScopeError(spec);

/**
 * A choice in a window of the question (pickers.ts): the window writes it, the
 * question normalizes (transitionQuestion, same block), then every other
 * condition is accounted for. Changing the axis of "Cine conduce?" is a lens:
 * what the new axis cannot apply is parked ("Nu se aplică indicelui"), and
 * going back to the axis it came from brings it back.
 */
export function chooseValue(draft: QuestionSpec, slot: Slot, choice: Choice, parked: Parked | null = null): Transition {
  const lens = choice.filter === "rankBy" && draft.block === "entity_card" && choice.value !== leaderAxis(draft);
  const start = lens && parked?.lens === choice.value ? unpark(draft as FilterSpec, parked) : draft as FilterSpec;
  const written = writeChoice(start, slot, choice);
  // What the choice replaced in its own window needs no note; what it left there (a buyer's kind on a firm subject) is settled too.
  const touched = windowFilters(slot).filter((id) => JSON.stringify(pathValues(start, FILTERS[id].keys)) !== JSON.stringify(pathValues(written, FILTERS[id].keys)));
  const { spec, changes } = transitionQuestion(written);
  const settled = settle(start, spec as FilterSpec, { lens, touched, why: "nu se potrivește cu alegerea nouă" });
  return {
    spec: settled.spec, notes: unique([...changes, ...settled.notes]), dropped: settled.dropped,
    parked: !lens ? parked : settled.parked.length ? parkedRow(leaderAxis(start), settled.parked) : null,
    ...(Object.keys(settled.links).length ? { links: settled.links } : {}),
  };
}

/**
 * Another question from the catalogue. The parked conditions come back first:
 * a question that applies them keeps them; the rest leave with a note.
 */
export function chooseQuestion(draft: QuestionSpec, block: string, parked: Parked | null = null): Transition {
  const start = unpark(draft as FilterSpec, parked);
  const { spec, changes } = transitionQuestion(start, block);
  // The reason by cause: a condition the engine applies here but the builder does not offer yet is not "inapplicable".
  const settled = settle(start, spec as FilterSpec, { lens: false, touched: [], why: "nu se aplică la această întrebare", whyApplied: "nu se poate alege aici încă" });
  return {
    spec: settled.spec, notes: unique([...changes, ...settled.notes]), dropped: settled.dropped, parked: null,
    ...(Object.keys(settled.links).length ? { links: settled.links } : {}),
  };
}

/** Touching a parked chip: back to the lens it came from, with everything that waited there (kit §5.43). */
export function restoreParked(draft: QuestionSpec, parked: Parked): Transition {
  return chooseValue(draft, { id: "rankBy" }, { filter: "rankBy", value: parked.lens }, parked);
}
