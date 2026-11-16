"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OUTLINE_MS, progress, type Progress } from "./outline";

/*
 * „Copiat” and „Salvat” are said on the button that was pressed (UX audit M-08, motion pass 16 November 2026): the
 * label changes for 1.6 s with a check drawn in 220 ms, then comes back; a live region beside it reads the result for
 * a screen reader. A save that takes longer than 300 ms shows a piece of outline turning round its button
 * (outline.ts progress), which closes when it is done.
 */

/** The check drawn before „Copiat” / „Salvat” (outline.css .mo-done-check). */
export function DoneCheck() {
  return <svg className="mo-done-check" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5l3.2 3L13 4.5" pathLength={1} /></svg>;
}

/** A flag that is true for `ms` (the label's 1.6 s) after `raise()`. */
export function useFlag(ms: number = OUTLINE_MS.label): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const raise = useCallback(() => {
    setOn(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOn(false), ms);
  }, [ms]);
  return [on, raise];
}

/** The progress outline of a save, on the button behind `ref`: `start()` when the request goes, `done(ok)` when it ends. */
export function useProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const run = useRef<Progress | null>(null);
  useEffect(() => () => run.current?.done(false), []);
  const start = useCallback(() => { run.current?.done(false); run.current = progress(ref.current); }, []);
  const done = useCallback((ok: boolean) => { run.current?.done(ok); run.current = null; }, []);
  return { ref, start, done };
}
