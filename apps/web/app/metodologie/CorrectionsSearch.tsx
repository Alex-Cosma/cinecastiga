"use client";

import { useId, useState } from "react";
import { roCount } from "@/lib/ro-count";

/** Letters without diacritics, lower case: „București” finds „BUCURESTI”. */
export const foldQuery = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("ro-RO").replace(/\s+/g, " ").trim();

/**
 * One search over the rows of „Unde corectăm datele SEAP” (Corrections.tsx): a row stays when its name, CUI or source
 * text holds every word typed; a fold with a match opens, one without hides. Clearing the field restores the folds as
 * they were before the search.
 */
export default function CorrectionsSearch({ rootId, total }: { rootId: string; total: number }) {
  const id = useId();
  const [found, setFound] = useState<number | null>(null);
  const [before, setBefore] = useState<Map<HTMLDetailsElement, boolean> | null>(null);

  function filter(value: string) {
    const root = document.getElementById(rootId);
    if (!root) return;
    const folds = [...root.querySelectorAll<HTMLDetailsElement>("details.mt-corr-g")];
    const words = foldQuery(value).split(" ").filter(Boolean);
    if (!words.length) {
      root.querySelectorAll<HTMLElement>("li[data-q]").forEach((li) => (li.hidden = false));
      folds.forEach((d) => { d.hidden = false; d.open = before?.get(d) ?? false; });
      setBefore(null);
      setFound(null);
      return;
    }
    const saved = before ?? new Map(folds.map((d) => [d, d.open]));
    if (!before) setBefore(saved);
    let n = 0;
    for (const d of folds) {
      let inFold = 0;
      d.querySelectorAll<HTMLElement>("li[data-q]").forEach((li) => {
        const text = foldQuery(li.dataset.q ?? "");
        const hit = words.every((w) => text.includes(w));
        li.hidden = !hit;
        if (hit) inFold++;
      });
      d.hidden = inFold === 0;
      d.open = inFold > 0;
      n += inFold;
    }
    setFound(n);
  }

  return (
    <div className="mt-corr-search" role="search">
      <label htmlFor={id}>Caută o firmă sau un CUI</label>
      <input id={id} type="search" autoComplete="off" spellCheck={false} onChange={(e) => filter(e.target.value)} />
      <p aria-live="polite" className="mt-corr-found">
        {found === null ? null : found === 0 ? "Niciun rând." : `${roCount(found, "1 rând", "rânduri")} din ${total}.`}
      </p>
    </div>
  );
}
