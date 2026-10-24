import { localityScopeError, transitionQuestion, type QuestionSpec } from "../question-ui";
import { NEWER_VERSION_LINK, parseSpec, runnableError, unimplementedSpecKeys, type AskSpec } from "../spec";
import type { ConditionLabels } from "./describe";
import { advancedConditions, legacyConditions, withoutConditions, type AdvancedCondition, type LegacyCondition } from "./legacy-conditions";
import type { FilterSpec } from "./types";

/*
 * Opening a link (?spec=) in the builder (plan §2.4, §2.6): parseSpec checks
 * the shape only; the builder opens with the draft and runs it only when the
 * engine can (runnableError, and the locality rule of /api/ask). A condition
 * the question does not show is a chip under the sentence, "Din link: …" or
 * the label of the page that produced it; a refused one says why, and "Vezi
 * răspunsul" waits until it is removed (×, or "Scoate condițiile din link").
 * A link with a key this release reads but does not apply keeps F0a's message,
 * without a builder that would show the question without it.
 */

export const INVALID_LINK = "Legătura conține o întrebare invalidă. Poți construi una nouă mai jos.";

export type RestoredLink =
  | { kind: "error"; error: string; newer?: true }
  | {
    kind: "draft";
    spec: FilterSpec;
    /** The link's question as it came (its named stream kept): what runs when `run`, exactly as /api/ask runs it today. */
    link: FilterSpec;
    /** What the builder changed while opening it (transitionQuestion on the same block). */
    notes: string[];
    /** The link's chips under the sentence, applied or refused. */
    conditions: LegacyCondition[];
    /** The precise selection and the record threshold of "Selecție avansată". */
    advanced: AdvancedCondition[];
    /** Run it now: the engine accepts the link as it is (a draft the builder repaired waits for "Vezi răspunsul", with its note). */
    run: boolean;
    /** Why the draft cannot run: the engine's refusal, on the chips when they cause it, else the question's own (an entity to choose). */
    reason: string | null;
  };

/** A link's spec, opened as the builder will draft it. */
export function restoreLink(raw: unknown, labels: ConditionLabels = {}): RestoredLink {
  const parsed = parseSpec(raw);
  if ("error" in parsed) return { kind: "error", error: INVALID_LINK };
  if (unimplementedSpecKeys(parsed).length) return { kind: "error", error: NEWER_VERSION_LINK, newer: true };
  // parseSpec omits the default stream; a link that names it keeps it.
  const named = raw && typeof raw === "object" && "dataset" in raw ? (raw as { dataset?: unknown }).dataset : undefined;
  const given = (typeof named === "string" && !parsed.dataset ? { ...parsed, dataset: named } : parsed) as unknown as QuestionSpec;
  const { spec, changes } = transitionQuestion(given);
  const errorOf = (s: QuestionSpec) => runnableError(s as unknown as AskSpec) ?? localityScopeError(s);
  const reason = errorOf(spec);
  return {
    kind: "draft", spec: spec as FilterSpec, link: given as unknown as FilterSpec, notes: changes,
    conditions: legacyConditions(spec, labels), advanced: advancedConditions(spec, labels),
    run: reason === null && errorOf(given) === null, reason,
  };
}

/**
 * The draft without some of a link's conditions: one chip's ×, or "Scoate
 * condițiile din link" (the refused ones). Their keys only, as the link would
 * be without them; then the builder's normalization.
 */
export function withoutLinkConditions(spec: QuestionSpec, conditions: readonly Pick<LegacyCondition, "key">[]): { spec: FilterSpec; notes: string[] } {
  const next = transitionQuestion(withoutConditions(spec as FilterSpec, conditions.map((c) => c.key)));
  return { spec: next.spec as FilterSpec, notes: next.changes };
}
