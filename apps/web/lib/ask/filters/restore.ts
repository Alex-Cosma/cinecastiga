import { localityScopeError, transitionQuestion, type QuestionSpec } from "../question-ui";
import { keyVersionNotes } from "../answer-core";
import { kindApplies, kindLeftOutNote, type PurchaseKind } from "../purchase";
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

/**
 * A link's spec, opened as the builder will draft it. With the answer's grounding (`labels.grounding`), a kind its
 * domain has no codes of is left out of the draft with the engine's note, as the answer and the spec it returns
 * leave it out (resolvedSpec; S6, S5T-kind-domain): the sentence never says „de produse” beside „drumuri”.
 */
export function restoreLink(raw: unknown, labels: ConditionLabels = {}): RestoredLink {
  const parsed = parseSpec(raw);
  if ("error" in parsed) return { kind: "error", error: INVALID_LINK };
  if (unimplementedSpecKeys(parsed).length) return { kind: "error", error: NEWER_VERSION_LINK, newer: true };
  // parseSpec omits the default stream; a link that names it keeps it.
  const named = raw && typeof raw === "object" && "dataset" in raw ? (raw as { dataset?: unknown }).dataset : undefined;
  const given = (typeof named === "string" && !parsed.dataset ? { ...parsed, dataset: named } : parsed) as unknown as QuestionSpec;
  const opened = transitionQuestion(given);
  const kind = opened.spec.filters.purchaseKind as PurchaseKind | undefined;
  const leftOut = kind && labels.grounding?.cpv && !kindApplies(kind, labels.grounding) ? kind : null;
  const { spec, changes } = leftOut ? { spec: withoutKind(opened.spec), changes: [...opened.changes, kindLeftOutNote(leftOut, labels.grounding?.cpv?.term ?? opened.spec.filters.cpvTerm)] } : opened;
  const errorOf = (s: QuestionSpec) => runnableError(s as unknown as AskSpec) ?? localityScopeError(s);
  const reason = errorOf(spec);
  return {
    kind: "draft", spec: spec as FilterSpec, link: given as unknown as FilterSpec, notes: [...new Set([...changes, ...keyVersionNotes(given as unknown as AskSpec)])],
    conditions: legacyConditions(spec, labels), advanced: advancedConditions(spec, labels),
    run: reason === null && errorOf(given) === null, reason,
  };
}

function withoutKind(spec: QuestionSpec): QuestionSpec {
  const { purchaseKind: _kind, ...filters } = spec.filters;
  return { ...spec, filters };
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
