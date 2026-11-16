"use client";

import { useEffect, useRef, type RefObject } from "react";

/*
 * A number that changed is marked, not counted (UX audit M-05, motion pass 16 November 2026): when a filter, a year or
 * a measure changes a figure for the same subject, its background takes --accent-soft, holds it for 30% of 900 ms and
 * fades. Never at the first drawing or for another subject, and when more than six figures change at once nothing is
 * marked (it would be noise). It is colour, not motion: reduced motion keeps it. The figure itself never moves or
 * passes through values the data does not have.
 */

const MAX_AT_ONCE = 6;
const pending = new Set<Element>();
let frame = 0;

function flush() {
  frame = 0;
  const marks = [...pending];
  pending.clear();
  if (marks.length > MAX_AT_ONCE) return;
  for (const el of marks) {
    if (!(el instanceof HTMLElement) || !el.isConnected || typeof el.animate !== "function") continue;
    if (!el.style.borderRadius) el.style.borderRadius = "3px";
    el.animate([{ backgroundColor: "var(--accent-soft)" }, { backgroundColor: "var(--accent-soft)", offset: 0.3 }, { backgroundColor: "transparent" }], { duration: 900, easing: "ease-out" });
  }
}

/** Marks `el` as changed; the marks of one frame are counted together. */
export function markChanged(el: Element | null | undefined): void {
  if (typeof window === "undefined" || !el) return;
  pending.add(el);
  if (!frame) frame = requestAnimationFrame(flush);
}

/**
 * Marks the element behind `ref` when `value` changes while `subject` stays the same. A null value (loading) is not
 * a change: the next value is compared with the last one shown.
 */
export function useChangedMark(ref: RefObject<Element | null>, value: string | number | null | undefined, subject: string | number = "") {
  const last = useRef<{ value: string | number; subject: string | number } | null>(null);
  useEffect(() => {
    if (value === null || value === undefined) return;
    const was = last.current;
    last.current = { value, subject };
    if (was && was.subject === subject && was.value !== value) markChanged(ref.current);
  }, [ref, value, subject]);
}
