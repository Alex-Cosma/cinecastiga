import { countWords } from "../answer-text";
import { localityScopeError, type QuestionSpec } from "../question-ui";
import { runnableError, type AskSpec } from "../spec";
import { filterContext } from "./context";
import { describeConditions, type ConditionLabels } from "./describe";
import { isDaBoundPopulation, splitExcluded, type SelectionOrigin } from "./origin";
import { FILTER_DEFS, FILTERS, SPEC_PATH_OWNERS, offeredFilters, presentPaths } from "./registry";
import type { FilterId, FilterSpec, SpecPath } from "./types";

/*
 * legacyConditions (plan §2.2 legacy-conditions.ts, §2.6): the conditions a
 * link carries that the plan's questions no longer offer, each in words, with
 * where it comes from and whether the engine applies it. F1b draws them under
 * the sentence: "Din link: {words}" (?) ×, or the label of the page that
 * produced the selection ("Selecția relației: 2 firme"); a refused one opens
 * the builder with its reason instead of an error far from its cause.
 * Nothing renders it in F0. Missing keys mean today's behaviour, so they are
 * never listed.
 */

export type LegacyOrigin = "link" | SelectionOrigin;

export interface LegacyCondition {
  /** The filter that owns the condition (SPEC_PATH_OWNERS). */
  key: FilterId;
  paths: SpecPath[];
  /** The condition in words, lowercase: "firme cu cel puțin 5 înregistrări în selecție". */
  words: string;
  /** A link, or the page that produced the selection (origin.ts). */
  origin: LegacyOrigin;
  /** The chip: "Din link: …" or the page's own label. */
  label: string;
  /** The (?) text, where the words are short: a precise selection's groups. */
  detail?: string;
  status: "applied" | "refused";
  /** The engine's message, on a refused condition. */
  reason?: string;
}

/**
 * Keys the plan stops offering on new questions and keeps applying on old
 * links (plan §1.1, G1; filters/defs/legacy.ts). The comparison mode is
 * accepted and ignored: it has no chip.
 */
const LEGACY: ReadonlySet<FilterId> = new Set(["minimumRecords", "population", "singleBidder"]);
/** The shape of the answer, not a condition: the question shows it in its sentence or ignores it. */
const SHAPE: ReadonlySet<FilterId> = new Set(["dim", "measure", "topN", "rankBy", "comparisonMode"]);

/** The employee bands of the kit (§4): 0 · 1–9 · 10–49 · 50–249 · 250+, and runs of adjacent bands. */
const BAND_FROM = [0, 1, 10, 50, 250], BAND_TO = [0, 9, 49, 249];
function onBands(spec: FilterSpec): boolean {
  const { minEmployees, maxEmployees } = spec.filters;
  if (minEmployees === undefined && maxEmployees === undefined) return true;
  const min = minEmployees === undefined ? 0 : Number(minEmployees);
  const max = maxEmployees === undefined ? null : Number(maxEmployees);
  return BAND_FROM.includes(min) && (max === null || BAND_TO.includes(max) && max >= min);
}

/** The spec without the keys of these filters (no picker side effects: what the link would be without them). */
function without(spec: FilterSpec, ids: readonly FilterId[]): FilterSpec {
  const next = structuredClone(spec) as unknown as Record<string, Record<string, unknown> | undefined> & { filters: Record<string, unknown> };
  for (const id of ids)
    for (const path of FILTERS[id].keys) {
      const [head, sub] = path.split(".") as [string, string | undefined];
      if (sub === undefined) delete next[head];
      else if (next[head]) delete next[head]![sub];
    }
  return next as unknown as FilterSpec;
}

const errorOf = (spec: FilterSpec) => runnableError(spec as unknown as AskSpec) ?? localityScopeError(spec);

/** The filters the spec carries, with their paths, in the registry's order. */
function owners(spec: FilterSpec): Map<FilterId, SpecPath[]> {
  const byOwner = new Map<FilterId, SpecPath[]>();
  for (const path of presentPaths(spec)) {
    const owner = SPEC_PATH_OWNERS[path];
    if (!owner || owner === "question" || SHAPE.has(owner)) continue;
    byOwner.set(owner, [...byOwner.get(owner) ?? [], path]);
  }
  return new Map(FILTER_DEFS.filter((def) => byOwner.has(def.id)).map((def) => [def.id, byOwner.get(def.id)!]));
}

/**
 * Which conditions make the engine refuse the question, with its message. A
 * profile refuses every transaction key with one message, so the conditions the
 * engine does not apply on this answer are tried together first; otherwise each
 * condition whose removal changes the refusal. Repeated until the question runs
 * or no condition is to blame (a missing entity is the question's, not a chip's).
 */
function refusals(spec: FilterSpec, skip: (id: FilterId, spec: FilterSpec) => boolean): Map<FilterId, string> {
  const reasons = new Map<FilterId, string>();
  let rest = spec;
  for (let round = 0; round < 8; round++) {
    const error = errorOf(rest);
    if (!error) break;
    const form = filterContext(rest).form;
    const present = [...owners(rest).keys()].filter((id) => !skip(id, rest));
    const unapplied = present.filter((id) => FILTERS[id].engine[form] === undefined);
    const blamed = unapplied.length && errorOf(without(rest, unapplied)) !== error ? unapplied
      : present.filter((id) => errorOf(without(rest, [id])) !== error);
    if (!blamed.length) break;
    for (const id of blamed) reasons.set(id, error);
    rest = without(rest, blamed);
  }
  return reasons;
}

/** The legacy conditions of a spec (plan §2.6), in the registry's order. */
export function legacyConditions(input: QuestionSpec | AskSpec, labels: ConditionLabels = {}): LegacyCondition[] {
  const spec = input as FilterSpec;
  const ctx = filterContext(spec);
  const offered = offeredFilters(spec, ctx);
  const described = describeConditions(spec, labels).byId;
  // A profile answers from its archive whatever the stream, except contracts (refused); the home page's
  // direct-acquisition population is the ceiling itself (a display rule, no chip).
  const skip = (id: FilterId, s: FilterSpec) => id === "dataset" && filterContext(s).profile && s.dataset !== "contracts"
    || id === "population" && isDaBoundPopulation(s);
  const reasons = refusals(spec, skip);
  const out: LegacyCondition[] = [];
  for (const [id, paths] of owners(spec)) {
    if (skip(id, spec)) continue;
    const reason = reasons.get(id);
    const applied = FILTERS[id].engine[ctx.form] !== undefined;
    if (!reason && (!applied || !(LEGACY.has(id) || id === "employees" && !onBands(spec) || !offered.has(id)))) continue;
    const words = described[id];
    let text = words?.words ?? FILTERS[id].label.toLowerCase();
    if (id === "population" && !words?.origin) {
      // Exclusions are ordinary "Fără X" chips (kit §5.15): only the rest of a precise selection comes from the link.
      const { excluded, rest } = splitExcluded(spec.population);
      if (!rest && !reason) continue;
      if (rest && excluded.length && !reason) text = `selecție precisă, ${countWords(rest.groups.reduce((n, g) => n + g.conditions.length, 0), "condiție", "condiții")}`;
    }
    const origin = words?.origin;
    out.push({
      key: id, paths, words: origin?.words ?? text,
      origin: origin?.origin ?? "link",
      label: origin ? `${origin.label}: ${origin.words}` : `Din link: ${text}`,
      ...(words?.detail ? { detail: words.detail } : {}),
      status: reason ? "refused" : "applied",
      ...(reason ? { reason } : {}),
    });
  }
  return out;
}
