import { NEW_NETWORK_SHOW } from "../../lib/ask/network-shared";
import { RANKING_PAGE_SIZE } from "../../lib/ask/winner-words";
import type { QuestionSpec } from "../../lib/ask/question-ui";

/*
 * Esențial (lib/view-mode.ts) on Întreabă's answers (owner, 18 November 2026). The mode lives in CSS: these helpers only
 * say which marks an element gets, from the question and the answer, never from the mode.
 */

type Spec = Pick<QuestionSpec, "block" | "topN" | "measure" | "rankBy" | "trend"> & { network?: { show?: number | undefined; order?: string | undefined } | undefined };

/** `data-only="complet"` when the element goes in Esențial, nothing otherwise. */
export const completIf = (hidden: boolean): "complet" | undefined => hidden ? "complet" : undefined;

/**
 * The presentation line under the title („Arată primele 10, după valoarea înregistrată”) at its defaults: Esențial hides it
 * then; another length or order (a link can carry one) stays, so the reader sees the list is shaped and can undo it.
 */
export function presentationAtDefault(spec: Spec): boolean {
  if (spec.block === "table") return spec.topN === RANKING_PAGE_SIZE && (spec.measure ?? "value") === "value";
  if (spec.block === "network") return (spec.network?.show === undefined || spec.network.show === NEW_NETWORK_SHOW) && networkOrderAtDefault(spec);
  if (spec.block === "trend") return (spec.topN ?? 10) === 10 && spec.trend?.order !== "percent" && spec.trend?.minBase === undefined;
  return true;
}

/** The network's „Ordonează” at its default (by value). */
export const networkOrderAtDefault = (spec: Pick<Spec, "network">): boolean => (spec.network?.order ?? "value") === "value";

/**
 * Answers that are the risk score itself belong to Complet whole (owner, 18 November 2026, for the risk clouds; the same
 * reason holds for the peer group's position and the ranking by score): opened from a link, they show whole, with the
 * line that says so. Without the score nothing of them would answer the question.
 */
export function completeOnlyAnswer(spec: Pick<QuestionSpec, "block" | "rankBy"> | null | undefined): boolean {
  if (!spec) return false;
  return spec.block === "scatter" || spec.block === "distribution" || (spec.block === "entity_card" && spec.rankBy === "risk");
}
