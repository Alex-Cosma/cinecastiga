"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { EASE, prefersReducedMotion } from "./outline";

/*
 * Rows added under a list show where they start (UX audit M-04, motion pass 16 November 2026): „Arată încă” brings
 * them in with a 6 px rise and a fade in 220 ms, 30 ms apart (150 ms at most); above about 20 new rows the group
 * enters once; the first new one takes --accent-soft, which fades in 1.4 s (where the focus went, visible to a mouse
 * too). Never on a page change or a filter: there the list is replaced at once. Reduced motion: no rise and no step;
 * the first row's background stays (it is information).
 */

const GROUP = 20;

/** Brings in `rows`, the rows just added under a list. */
export function riseNew(rows: readonly Element[]): void {
  if (typeof window === "undefined" || !rows.length) return;
  const reduced = prefersReducedMotion(), group = rows.length > GROUP;
  if (!reduced) rows.forEach((row, i) => {
    if (typeof row.animate !== "function") return;
    row.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 220, delay: group ? 0 : Math.min(i * 30, 150), easing: EASE, fill: "backwards" });
  });
  const first = rows[0];
  if (first && typeof first.animate === "function")
    first.animate([{ backgroundColor: "var(--accent-soft)" }, { backgroundColor: "var(--accent-soft)", offset: 0.35 }, { backgroundColor: "transparent" }], { duration: 1400, easing: "ease-out" });
}

/**
 * For a list whose rows come later (a fetch): call `more(shown)` when „Arată încă” is pressed; once the list holds more
 * than `shown` rows (`count` grew), the new ones rise in. Anything else that changes the list (a sort, a filter, a
 * page) does nothing.
 */
export function useRiseOnMore(list: RefObject<HTMLElement | null>, count: number, rows: (list: HTMLElement) => readonly Element[] = (l) => Array.from(l.children)) {
  const asked = useRef<number | null>(null);
  useLayoutEffect(() => {
    const from = asked.current;
    if (from === null || count <= from || !list.current) return;
    asked.current = null;
    riseNew(rows(list.current).slice(from));
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps -- the rows are read when the count grows
  return useCallback((shown: number) => { asked.current = shown; }, []);
}

/*
 * Sorting is seen in the column (UX audit M-16): once the rows of a new order are on screen, the cells of the column
 * it is sorted by take --accent-soft, which fades in 700 ms. The rows themselves take their new order at once (DESIGN:
 * no sliding). Colour, so reduced motion keeps it. The sort arrow turns in --fast (outline.css .mo-sort-arrow).
 */
export function markColumn(cells: readonly Element[]): void {
  for (const cell of cells) {
    if (typeof cell.animate !== "function") continue;
    cell.animate([{ backgroundColor: "var(--accent-soft)" }, { backgroundColor: "transparent" }], { duration: 700, easing: "ease-out" });
  }
}

/**
 * Marks the sorted column of the table behind `ref` once a new sort (`sort`, e.g. "date:desc") has its rows on
 * screen (`ready`). The first sort shown, a filter or a page change mark nothing.
 */
export function useSortedColumn(ref: RefObject<HTMLElement | null>, sort: string, cells: string, ready: boolean) {
  const marked = useRef(sort);
  useLayoutEffect(() => {
    if (!ready || marked.current === sort || !ref.current) return;
    marked.current = sort;
    markColumn(Array.from(ref.current.querySelectorAll(cells)));
  }, [ref, sort, cells, ready]);
}
