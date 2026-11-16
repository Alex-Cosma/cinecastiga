"use client";

import { useState, type ReactNode } from "react";
import { countWords } from "@/lib/ask/answer-text";

/**
 * A direct acquisition's products on a phone (UX audit Z7-16): the first ten, then „Arată toate cele 34 de produse”.
 * Every row is in the page (search, print, wide screens see them all); only a phone folds the rest, by CSS.
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
