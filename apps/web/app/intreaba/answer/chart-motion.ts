"use client";

import { useCallback, useRef, useState, type AnimationEvent } from "react";
import type { AskSpec } from "@/lib/ask/spec";

/*
 * The Ask answers' charts in motion (owner, 6 November 2026; DESIGN.md "Charts in motion"). The vocabulary is the
 * shared kit (components/motion/chart-motion.css, gated by app/Reveal.tsx): a chart enters once, when it first shows,
 * and data that changes for the same subject tweens in place (.cm-tw). Two things CSS cannot do alone live here:
 * - the subject of an answer, which keys its result: another block, unit, entity or level enters anew, while a filter,
 *   a measure, a group or a period changes the same marks in place;
 * - the entrance classes of marks React may later move or add: a moved element is inserted again, and an entrance
 *   still named on it would replay, so the classes stay only until the entrance has played; a mark that joins after
 *   it fades in briefly (cm-in).
 */

/** What an answer is about: its block, its unit (dim), its superlative, its entities and a breakdown's level. */
export function answerSubject(spec: AskSpec): string {
  const f = spec.filters;
  const focal = [f.authorityId ?? f.authorityName, f.supplierId ?? f.supplierName, f.compareWithId ?? f.compareWith, f.uatSiruta ?? f.uatName,
    f.adminPersonKey ?? f.adminName];
  // A breakdown's segments are its level's domains: one level down, or another kind, has other domains.
  const level = spec.block === "breakdown" ? [f.cpvTerm, f.purchaseKind] : [];
  return [spec.block, spec.dim, spec.rankBy, ...focal, ...level].map((v) => (v === undefined || v === null ? "" : String(v))).join("|");
}

/** The kit's entrance classes (a mark that is still entering). */
const ENTRANCE = ".cm-x, .cm-xr, .cm-y, .cm-yd, .cm-pt, .cm-fade, .cm-draw";

export interface ChartMotion {
  /** True until the chart's entrance has played (it waits while the chart is below the fold). */
  entering: boolean;
  /** The entrance class while the chart enters; nothing afterwards. */
  enter: (entrance: string) => string;
  /** A mark's ref: mounted after the entrance (a row a re-query adds, a new year), it fades in briefly. */
  join: (el: Element | null) => void;
  /** The chart root's props: the gate's mark (`data-chart`) and the end of its entrance. Its class must not change. */
  root: { "data-chart": ""; onAnimationEnd: (event: AnimationEvent<Element>) => void };
}

export function useChartMotion(): ChartMotion {
  const [entering, setEntering] = useState(true);
  // Read by the ref callback in the same commit as the render.
  const live = useRef(entering);
  live.current = entering;
  const onAnimationEnd = useCallback((event: AnimationEvent<Element>) => {
    if (!live.current) return;
    const playing = event.currentTarget.getAnimations({ subtree: true }).some((a) => {
      const target = a instanceof CSSAnimation ? (a.effect as KeyframeEffect | null)?.target : null;
      return a.playState === "running" && target instanceof Element && target.matches(ENTRANCE);
    });
    if (!playing) setEntering(false);
  }, []);
  const join = useCallback((el: Element | null) => {
    if (!el || live.current) return;
    el.classList.add("cm-in");
    const end = (event: Event) => {
      if (event.target !== el) return;
      el.classList.remove("cm-in");
      el.removeEventListener("animationend", end);
    };
    el.addEventListener("animationend", end);
  }, []);
  return { entering, enter: (entrance) => (entering ? entrance : ""), join, root: { "data-chart": "", onAnimationEnd } };
}
