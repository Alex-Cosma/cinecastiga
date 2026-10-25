import { entityLabel, leaderAxis, localityScopeError, type QuestionSpec } from "../question-ui";
import { runnableError, type AskSpec } from "../spec";
import { filterContext } from "./context";
import { describeConditions, preciseWords, type ConditionLabels } from "./describe";
import { isDaBoundPopulation, splitExcluded, type SelectionOrigin } from "./origin";
import { FILTER_DEFS, FILTERS, SPEC_PATH_OWNERS, presentPaths, visibleFilters } from "./registry";
import { retarget } from "./retarget";
import type { FilterId, FilterSpec, SpecPath } from "./types";

/*
 * legacyConditions (plan §2.2 legacy-conditions.ts, §2.6): the conditions a
 * spec carries that its question does not show (BLOCK_FILTERS: its sentence,
 * rows, strip and "Selecție avansată"), each in words, with where it comes
 * from and whether the engine applies it. The builder draws them under the
 * sentence: "Din link: {words}" (?) ×, or the label of the page that produced
 * the selection ("Selecția relației: 2 firme"); a refused one opens the
 * builder with its reason (restore.ts) instead of an error far from its cause.
 * A precise selection or a record threshold the question's "Selecție
 * avansată" offers is that place's chip (advancedConditions). Missing keys
 * mean today's behaviour, so they are never listed.
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
  /** The reason in the chip's few words, where the engine's message is a paragraph (a profile's archive). */
  why?: string;
  /** The (?) of an applied condition, where it says more than "from an older link" (a tautology of "Cine conduce?"). */
  tip?: string;
  /** Another answer about the same entity ("Cât câștigă X ›"), beside the chip (R8 "›"). */
  retarget?: { label: string; spec: FilterSpec };
}

/** Why a tautology answers itself, in a note's words ("Am scos „firma „PORR””: …"). */
const TAUTOLOGY_WHY = { supplier: "cu o singură firmă aleasă, răspunsul e chiar ea", authority: "cu o singură instituție aleasă, răspunsul e chiar ea" } as const;

/**
 * "Cine conduce?" on value with the ranked role's own entity named (plan
 * §4.13, final entity_card §4 and §7): an old link's tautology. It runs as
 * before and the answer is that entity; the chip says why and offers its
 * total. A change of subject that would make one drops the entity instead,
 * with the same reason and link in its note (transition.ts).
 */
export function tautology(spec: FilterSpec, id: FilterId): { why: string; tip: string; retarget: NonNullable<LegacyCondition["retarget"]> } | null {
  if (spec.block !== "entity_card" || leaderAxis(spec) === "risk") return null;
  const firms = spec.dim === "supplier";
  if (id !== (firms ? "supplier" : "authority")) return null;
  const name = entityLabel(spec, id), why = TAUTOLOGY_WHY[id];
  return {
    why, tip: `${why.charAt(0).toUpperCase()}${why.slice(1)}.`,
    retarget: { label: `${firms ? "Cât câștigă" : "Cât cumpără"} ${name}`, spec: retarget(spec, "stat") },
  };
}

/**
 * A profile answers from its whole archive of direct acquisitions: the engine
 * refuses every transaction key there with one long message; the chip says
 * it short (kit §4, final scatter §5, distribution §5).
 */
export const PROFILE_REFUSAL = "Profilul folosește toată arhiva de achiziții directe; condiția nu se aplică aici.";

/** The shape of the answer, not a condition: the question shows it in its sentence or ignores it. */
const SHAPE: ReadonlySet<FilterId> = new Set(["dim", "measure", "topN", "rankBy", "comparisonMode"]);

/** The spec without the keys of these filters (no picker side effects: what the link would be without them). */
export function withoutConditions(spec: FilterSpec, ids: readonly FilterId[]): FilterSpec {
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

/** The conditions a spec carries, with their paths, in the registry's order (the default stream is none). */
export function presentConditions(spec: FilterSpec): Map<FilterId, SpecPath[]> {
  const byOwner = new Map<FilterId, SpecPath[]>();
  for (const path of presentPaths(spec)) {
    const owner = SPEC_PATH_OWNERS[path];
    if (!owner || owner === "question" || SHAPE.has(owner)) continue;
    if (owner === "dataset" && spec.dataset === "all") continue;
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
export function refusedConditions(spec: FilterSpec, skip: (id: FilterId, spec: FilterSpec) => boolean = () => false): Map<FilterId, string> {
  const reasons = new Map<FilterId, string>();
  let rest = spec;
  for (let round = 0; round < 8; round++) {
    const error = errorOf(rest);
    if (!error) break;
    const form = filterContext(rest).form;
    const present = [...presentConditions(rest).keys()].filter((id) => !skip(id, rest));
    const unapplied = present.filter((id) => FILTERS[id].engine[form] === undefined);
    const blamed = unapplied.length && errorOf(withoutConditions(rest, unapplied)) !== error ? unapplied
      : present.filter((id) => errorOf(withoutConditions(rest, [id])) !== error);
    if (!blamed.length) break;
    for (const id of blamed) reasons.set(id, error);
    rest = withoutConditions(rest, blamed);
  }
  return reasons;
}

/**
 * What the question shows itself without a chip: a profile answers from its
 * archive whatever the stream, except contracts (refused); the home page's
 * direct-acquisition population is the ceiling itself (a display rule).
 */
const noChip = (id: FilterId, s: FilterSpec) => id === "dataset" && filterContext(s).profile && s.dataset !== "contracts"
  || id === "population" && isDaBoundPopulation(s);

/** The legacy conditions of a spec (plan §2.6), in the registry's order. */
export function legacyConditions(input: QuestionSpec | AskSpec, labels: ConditionLabels = {}): LegacyCondition[] {
  const spec = input as FilterSpec;
  const ctx = filterContext(spec);
  const visible = visibleFilters(spec, ctx);
  const described = describeConditions(spec, labels).byId;
  const reasons = refusedConditions(spec, noChip);
  const out: LegacyCondition[] = [];
  for (const [id, paths] of presentConditions(spec)) {
    if (noChip(id, spec)) continue;
    const reason = reasons.get(id);
    const words = described[id];
    const origin = words?.origin;
    const applied = FILTERS[id].engine[ctx.form] !== undefined;
    // A selection another page produced keeps its label; otherwise what the question shows is its own.
    if (!reason && !origin && (!applied || visible.has(id))) continue;
    if (!reason && origin && !applied) continue;
    let text = words?.words ?? FILTERS[id].label.toLowerCase();
    if (id === "population" && !origin) {
      // Exclusions are ordinary "Fără X" chips (kit §5.15): only the rest of a precise selection comes from the link.
      const { excluded, rest } = splitExcluded(spec.population);
      if (!rest && !reason) continue;
      if (rest && excluded.length && !reason) text = preciseWords(rest);
    }
    const self = reason ? null : tautology(spec, id);
    out.push({
      key: id, paths, words: origin?.words ?? text,
      origin: origin?.origin ?? "link",
      label: origin ? `${origin.label}: ${origin.words}` : `Din link: ${text}`,
      ...(words?.detail ? { detail: words.detail } : {}),
      status: reason ? "refused" : "applied",
      ...(reason ? { reason } : {}),
      ...(reason && ctx.profile && !applied ? { why: PROFILE_REFUSAL } : {}),
      ...(self ? { tip: self.tip, retarget: self.retarget } : {}),
    });
  }
  return out;
}

/** A chip of "Selecție avansată" (P9): what the place holds, which opens it again. */
export interface AdvancedCondition { key: "population" | "minimumRecords"; words: string; label: string; detail?: string }

/**
 * The precise selection and the record threshold a question's "⋯ › Selecție
 * avansată" offers (plan §1.1 variant A), set on the draft: a chip under the
 * sentence that opens that place. They are this question's conditions, not an
 * old link's. Exclusions stay "Fără X" chips; a selection of another page keeps
 * its label (legacyConditions).
 */
export function advancedConditions(input: QuestionSpec | AskSpec, labels: ConditionLabels = {}): AdvancedCondition[] {
  const spec = input as FilterSpec;
  const visible = visibleFilters(spec);
  const described = describeConditions(spec, labels).byId;
  const out: AdvancedCondition[] = [];
  if (spec.minimumRecords && visible.has("minimumRecords") && described.minimumRecords?.words)
    out.push({ key: "minimumRecords", words: described.minimumRecords.words, label: `Selecție avansată: ${described.minimumRecords.words}` });
  if (spec.population && visible.has("population") && !described.population?.origin && !isDaBoundPopulation(spec)) {
    const { rest } = splitExcluded(spec.population);
    if (rest) out.push({ key: "population", words: preciseWords(rest), label: `Selecție avansată: ${preciseWords(rest, false)}`, ...(described.population?.detail ? { detail: described.population.detail } : {}) });
  }
  return out;
}
