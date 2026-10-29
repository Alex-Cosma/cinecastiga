import type { CoveragePeriods } from "../months-window";
import { countyIsFirmSeat, isHistoricalProfile } from "../population";
import { focalRole, leaderAxis, localityScopeError, transitionQuestion, type QuestionSpec } from "../question-ui";
import { runnableError, type AskSpec } from "../spec";
import { filterContext } from "./context";
import { describeConditions } from "./describe";
import { presentConditions, refusedConditions, tautology, withoutConditions, type LegacyCondition } from "./legacy-conditions";
import { selectionOrigin } from "./origin";
import { parkedRow, pathValues, unpark, type Parked, type ParkedItem } from "./parked";
import { windowFilters, writeChoice, type Choice } from "./pickers";
import { FILTERS, visibleFilters } from "./registry";
import { edited } from "./defs/shared";
import { sentenceTokens } from "./sentence";
import { enterTrend, leavingTrend, TREND_FILTERS, trendFollows } from "./trend-rules";
import { exclusionsAfterSubject } from "./exclusions";
import { enterNetwork, networkFollows } from "./defs/network";
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
  /**
   * Conditions kept under another key (F4): a firm profile's county is the firm's seat, written as seatCounty
   * (seatFromCounty), and a seat that becomes the institutions' place again; the old key → the new one.
   */
  renamed?: Partial<Record<FilterId, FilterId>>;
}

export type NoteLink = NonNullable<LegacyCondition["retarget"]>;

/** Whose place a county is: the buyer's, or the firm's own seat on a firm profile (countyIsFirmSeat). */
function countyMeaning(spec: FilterSpec): "place" | "seat" | null {
  if (!spec.filters.county) return null;
  return countyIsFirmSeat(spec, focalRole(spec)) ? "seat" : "place";
}

/** The county moved to the firm's seat (F4): one seat key, written by the seat's window (defs/seat.ts). */
const countyToSeat = (spec: FilterSpec): FilterSpec => edited(spec, (next) => {
  next.filters.seatCounty = next.filters.county as string;
  delete next.filters.county;
});

/**
 * A link's county on a firm profile is the firm's seat (plan §2.6): the first
 * edit writes it as seatCounty, the same condition (F4), so the draft carries
 * the seat's own key from then on. A distribution's group keeps its county
 * (its own window, F6a). A restored link is not rewritten (restore.ts): it
 * opens as it was asked.
 */
export function seatFromCounty(spec: FilterSpec): FilterSpec {
  if (spec.block === "distribution" || spec.filters.seatCounty || countyMeaning(spec) !== "seat") return spec;
  return countyToSeat(spec);
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
): { spec: FilterSpec; notes: string[]; dropped: FilterId[]; parked: ParkedItem[]; links: Record<string, NoteLink>; renamed: Partial<Record<FilterId, FilterId>> } {
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
  const renamed: Partial<Record<FilterId, FilterId>> = {};
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
        else {
          notes.push(now === "seat" ? "Județul ales e acum sediul firmelor, nu locul instituțiilor." : "Județul ales e acum locul instituțiilor, nu sediul firmelor.");
          // On a firm profile the seat has its own key since F4 (seatFromCounty).
          if (now === "seat" && spec.block !== "distribution") { spec = seatFromCounty(spec); renamed.county = "seatCounty"; }
        }
        continue;
      }
    }
    // The firms' seat on a profile becomes the institutions' place when the subject turns to institutions
    // (the reverse of the county above, plan §4.12): same words, the other meaning, said in the note.
    if (id === "seatCounty" && !opts.lens && after.dim !== "supplier" && isHistoricalProfile(after) && after.block !== "distribution" && !after.filters.county) {
      const placed = edited(spec, (next) => { next.filters.county = next.filters.seatCounty as string; delete next.filters.seatCounty; });
      if (visibleFilters(placed).has("county")) {
        spec = placed;
        notes.push("Județul ales e acum locul instituțiilor, nu sediul firmelor.");
        renamed.seatCounty = "county";
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
  return { spec, notes, dropped, parked, links, renamed };
}

const unique = (notes: readonly string[]) => [...new Set(notes)];
const errorOf = (spec: FilterSpec) => runnableError(spec as unknown as AskSpec) ?? localityScopeError(spec);

/** What the builder knows besides the draft: the archive's periods (/api/data-coverage), for a trend's years and months. */
export interface TransitionContext { coverage?: CoveragePeriods | null | undefined }

/**
 * A choice in a window of the question (pickers.ts): the window writes it, the
 * question normalizes (transitionQuestion, same block), then every other
 * condition is accounted for. Changing the axis of "Cine conduce?" is a lens:
 * what the new axis cannot apply is parked ("Nu se aplică indicelui"), and
 * going back to the axis it came from brings it back. On a trend, what follows
 * the choice comes before (trend-rules.ts trendFollows: counties back to the
 * growths, an incomplete year's same months).
 */
export function chooseValue(input: QuestionSpec, slot: Slot, choice: Choice, parked: Parked | null = null, context: TransitionContext = {}): Transition {
  const draft = seatFromCounty(input as FilterSpec);
  const first: Partial<Record<FilterId, FilterId>> = draft !== input ? { county: "seatCounty" } : {};
  const lens = choice.filter === "rankBy" && draft.block === "entity_card" && choice.value !== leaderAxis(draft);
  // A network's period applies to „Toți” only (final network §3.2, §4): a group sets it aside, „Toți” brings it back.
  const group = choice.filter === "networkPartners" && draft.block === "network";
  const toAll = group && choice.value === undefined && parked?.lens === "network";
  const start = lens && parked?.lens === choice.value || toAll ? unpark(draft as FilterSpec, parked) : draft as FilterSpec;
  const period = group && choice.value !== undefined && !start.network?.partners && presentConditions(start).has("period")
    ? { id: "period" as const, label: phraseLabels(start).get("period") ?? FILTERS.period.label, values: pathValues(start, FILTERS.period.keys) } : null;
  const chosen = writeChoice(start, slot, choice);
  // A network's group keeps the period's first year as its reference (F4): the period leaves with that note, not as dropped.
  const network = networkFollows(start, chosen, filterContext(chosen, context.coverage ? { coverage: context.coverage } : {}));
  const written = network.spec;
  // What the choice replaced in its own window needs no note; what it left there (a buyer's kind on a firm subject) is settled too.
  const touched = [...windowFilters(slot), ...(choice.filter === "networkPartners" ? ["period" as const, "networkSince" as const] : [])]
    .filter((id) => JSON.stringify(pathValues(start, FILTERS[id].keys)) !== JSON.stringify(pathValues(written, FILTERS[id].keys)));
  const normalized = transitionQuestion(written);
  const follows = trendFollows(start, normalized.spec as FilterSpec, context.coverage);
  const settled = settle(start, follows.spec, { lens, touched, why: "nu se potrivește cu alegerea nouă" });
  // A new subject of another role: the rows "Scoate din calcul" left out were of the old one (F4).
  const subject = exclusionsAfterSubject(start, settled.spec);
  // A trend's options set aside wait for the trend, whatever the axis of "Cine conduce?" does (one row: the axis's wins).
  const waiting = parked?.lens === "trend" ? parked : null;
  // A network's period became the year its group counts from (networkFollows' note says so).
  const periodMoved = choice.filter === "networkPartners" && presentConditions(start).has("period") && !presentConditions(subject.spec).has("period");
  const renamed = { ...first, ...settled.renamed, ...(periodMoved ? { period: "networkSince" as const } : {}) };
  return {
    spec: subject.spec, notes: unique([...normalized.changes, ...network.notes, ...follows.notes, ...settled.notes, ...(subject.note ? [subject.note] : [])]),
    // The exclusions left with their note: the whole precise selection when nothing else was in it.
    dropped: subject.note ? [...settled.dropped, subject.spec.population ? "exclude" : "population"] : settled.dropped,
    parked: period ? parkedRow("network", [period]) : toAll ? null : !lens ? parked : settled.parked.length ? parkedRow(leaderAxis(start), settled.parked) : waiting,
    ...(Object.keys(settled.links).length ? { links: settled.links } : {}),
    ...(Object.keys(renamed).length ? { renamed } : {}),
  };
}

/**
 * Another question from the catalogue. The parked conditions come back first:
 * a question that applies them keeps them; the rest leave with a note. A
 * trend's own options never apply elsewhere: leaving the trend sets them
 * aside ("Doar la schimbare"), and they wait there until the trend comes back.
 * Entering the trend writes a new trend's options and years (trend-rules.ts
 * enterTrend), under what comes back from the row.
 */
export function chooseQuestion(input: QuestionSpec, block: string, parked: Parked | null = null, context: TransitionContext = {}): Transition {
  const draft = seatFromCounty(input as FilterSpec);
  const first: Partial<Record<FilterId, FilterId>> = draft !== input ? { county: "seatCounty" } : {};
  const waits = parked?.lens === "trend" && block !== "trend";
  const start = waits ? draft as FilterSpec : unpark(draft as FilterSpec, parked);
  const leaves = start.block === "trend" && block !== "trend";
  const leaving = leaves ? leavingTrend(start) : [];
  // The defaults a new trend writes again leave with the rest of its key, without a chip or a note.
  const base = leaves ? withoutConditions(start, TREND_FILTERS) : start;
  const moved = transitionQuestion(base, block);
  const entered = block === "trend" && base.block !== "trend" ? enterTrend(base, moved.spec as FilterSpec, context.coverage)
    : block === "network" && base.block !== "network" ? { spec: enterNetwork(moved.spec as FilterSpec), notes: [] as string[] }
      : { spec: moved.spec as FilterSpec, notes: [] as string[] };
  // The reason by cause: a condition the engine applies here but the builder does not offer yet is not "inapplicable".
  const settled = settle(base, entered.spec, { lens: false, touched: [], why: "nu se aplică la această întrebare", whyApplied: "nu se poate alege aici încă" });
  const renamed = { ...first, ...settled.renamed };
  return {
    spec: settled.spec, notes: unique([...moved.changes, ...entered.notes, ...settled.notes]), dropped: settled.dropped,
    parked: leaving.length ? parkedRow("trend", leaving) : waits ? parked : null,
    ...(Object.keys(settled.links).length ? { links: settled.links } : {}),
    ...(Object.keys(renamed).length ? { renamed } : {}),
  };
}

/** Touching a parked chip: back to the lens it came from, with everything that waited there (kit §5.43); a trend's, back to the trend. */
export function restoreParked(draft: QuestionSpec, parked: Parked, context: TransitionContext = {}): Transition {
  if (parked.lens === "trend") return chooseQuestion(draft, "trend", parked, context);
  // A network's period: back on „Toți”, every partner in that period.
  if (parked.lens === "network") return chooseValue(draft, { id: "networkPartners" }, { filter: "networkPartners", value: undefined }, parked, context);
  return chooseValue(draft, { id: "rankBy" }, { filter: "rankBy", value: parked.lens }, parked, context);
}
