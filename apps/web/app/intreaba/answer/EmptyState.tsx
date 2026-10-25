"use client";

/*
 * Component 17, the empty answer (G2): what is missing, and at most three
 * ways to widen the question, each named as the first row of its window
 * ("Toți anii", "Oriunde", "Orice firmă", "Toate achizițiile") or
 * "Scoate „…”". "Fără …" is kept for exclusions (kit §5.14). After a press,
 * focus moves to the answer's title (tabIndex -1), where the new answer is read.
 */

export const MAX_RELAX = 3;

export interface Relaxation { id: string; label: string; onClick?: () => void }

/** "Scoate „Furnizori noi”": the relaxation that drops a condition without a default row. */
export const removeWords = (name: string) => `Scoate „${name}”`;

export default function EmptyState({ message, relax = [], titleId }: { message: string; relax?: readonly Relaxation[]; titleId?: string }) {
  return <div className="qb-empty">
    <p>{message}</p>
    {relax.length > 0 && <div className="qb-relax" role="group" aria-label="Lărgește întrebarea">
      {relax.slice(0, MAX_RELAX).map(item => <button key={item.id} type="button" onClick={() => {
        item.onClick?.();
        if (titleId) requestAnimationFrame(() => document.getElementById(titleId)?.focus());
      }}>{item.label}</button>)}
    </div>}
  </div>;
}
