"use client";

import { useState, type ReactNode } from "react";
import { countWords } from "@/lib/ask/answer-text";

/**
 * A direct acquisition's products (UX audit Z7-16): the first ten, then „Arată toate cele 34 de produse”, at every width
 * and in both modes (owner, 18 November 2026; until then only on a phone). Every row is in the page (search and print
 * see them all); CSS folds the rest (record-pages.css).
 */
export default function ItemsMore({ count, children }: { count: number; children: ReactNode }) {
  const [all, setAll] = useState(false);
  return <div className="record-items-wrap" data-all={all || undefined}>
    {children}
    {count > 10 && !all && <button type="button" className="record-items-more" onClick={() => setAll(true)}>
      Arată toate cele {countWords(count, "produs", "produse")}
    </button>}
  </div>;
}
