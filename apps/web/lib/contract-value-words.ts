/*
 * Why a contract above 1 billion lei is kept out of the totals (owner, 19 November 2026; @seap/db
 * contract-value-review.ts): the finding of the last processing run, in the reader's words. Shared by the entity's
 * page, the contract's page and the administrators' list.
 */
export type HeldGuard = "lowest_offer" | "notice_value_missing" | "notice_sum";
export interface HeldValue { guard: string | null; decision: string | null; reason?: string | null }

/** „valoarea e de câteva ori peste oferta din anunț”: the reason, lower case, without a full stop. */
export function heldValueReason(v: HeldValue): string {
  if (v.decision === "exclude") return "valoare semnalată ca greșită";
  if (v.guard === "lowest_offer") return "valoarea e de câteva ori peste oferta din anunț";
  if (v.guard === "notice_value_missing") return "anunțul nu are o valoare totală care s-o confirme";
  if (v.guard === "notice_sum") return "contractele anunțului adună mult peste valoarea lui";
  return "încă neverificat de procesare";
}

/** The rule in one sentence, wherever the totals are explained. */
export const VALUE_REVIEW_RULE = "Un contract de peste 1 miliard lei intră în totaluri doar dacă anunțul lui nu-i contrazice valoarea. Un contract de orice mărime rămâne afară dacă valoarea lui a fost semnalată ca greșită.";

/*
 * A contract held out of the totals, as the reader meets it (owner, 26 November 2026): in a list a warning icon whose
 * explanation is VALUE_HELD_LIST_TEXT; on the contract's page the words VALUE_HELD_TITLE and VALUE_HELD_PAGE_TEXT,
 * followed by the reason of the decision or of the automatic check. The value shown is always the source's.
 */
export const VALUE_HELD_TITLE = "Eroare probabilă";
export const VALUE_HELD_LIST_TEXT = "Valoarea din SEAP conține cel mai probabil o greșeală de redactare. Contractul poate fi văzut, dar nu intră în totaluri și statistici.";
export const VALUE_HELD_PAGE_TEXT = "Valoarea din SEAP conține cel mai probabil o greșeală de redactare. Contractul nu intră în totaluri și statistici.";

/** The sentence after VALUE_HELD_PAGE_TEXT on the contract's page: the reason an administrator wrote, or what the
 * automatic check found. */
export function heldValueSentence(v: HeldValue): string {
  const written = v.decision === "exclude" ? v.reason?.trim() : "";
  if (written) return /[.!?]$/.test(written) ? written : `${written}.`;
  const found = heldValueReason(v);
  return `${found[0]!.toUpperCase()}${found.slice(1)}.`;
}
