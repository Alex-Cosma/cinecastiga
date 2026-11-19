/*
 * Why a contract above 1 billion lei is kept out of the totals (owner, 19 November 2026; @seap/db
 * contract-value-review.ts): the finding of the last processing run, in the reader's words. Shared by the entity's
 * page, the contract's page and the administrators' list.
 */
export type HeldGuard = "lowest_offer" | "notice_value_missing" | "notice_sum";
export interface HeldValue { guard: string | null; decision: string | null }

/** „valoarea e de câteva ori peste oferta din anunț”: the reason, lower case, without a full stop. */
export function heldValueReason(v: HeldValue): string {
  if (v.decision === "exclude") return "valoare semnalată ca greșită";
  if (v.guard === "lowest_offer") return "valoarea e de câteva ori peste oferta din anunț";
  if (v.guard === "notice_value_missing") return "anunțul nu are o valoare totală care s-o confirme";
  if (v.guard === "notice_sum") return "contractele anunțului adună mult peste valoarea lui";
  return "încă neverificat de procesare";
}

/** The rule in one sentence, wherever the totals are explained. */
export const VALUE_REVIEW_RULE = "Un contract de peste 1 miliard lei intră în totaluri doar dacă anunțul lui nu-i contrazice valoarea și nu a fost semnalat ca greșit.";
