"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { startAtTop, tracePaths } from "./outline";

/*
 * A selection draws once (UX audit M-03, motion pass 16 November 2026): the chosen county, UAT, dot or row gets its
 * outline drawn when it is chosen, never on hover (hover answers at once). On a map the outline opens at the top of the
 * area and runs both ways round it, in the camera's time and curve when the camera moves; a dot's ring and a row's
 * outline draw in --mo-pick (300 ms). Choosing another one replaces the old outline at once; leaving the selection
 * („← România”, Escape) runs it back in 200 ms. Reduced motion and print: whole at once (outline.css).
 */

/** The last non-null value for `ms` after it became null, flagged as leaving (an exit to run). Another value replaces it at once. */
export function useLeaving<T>(value: T | null, ms: number): { shown: T | null; leaving: boolean } {
  const [left, setLeft] = useState<T | null>(null);
  const last = useRef<T | null>(value);
  useEffect(() => {
    if (value !== null) { last.current = value; setLeft(null); return; }
    if (last.current === null) return;
    setLeft(last.current);
    last.current = null;
    const t = window.setTimeout(() => setLeft(null), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return value !== null ? { shown: value, leaving: false } : { shown: left, leaving: left !== null };
}

type DrawStyle = CSSProperties & { "--mo-sel-dur"?: string; "--mo-sel-ease"?: string };
const drawStyle = (duration?: number, easing?: string): DrawStyle | undefined =>
  duration === undefined && !easing ? undefined : { ...(duration !== undefined ? { "--mo-sel-dur": `${Math.round(duration)}ms` } : {}), ...(easing ? { "--mo-sel-ease": easing } : {}) };

/**
 * A chosen area's outline on an SVG map: two copies of its path from its top, one each way, meeting at the far side.
 * `id` keys the drawing (a new id draws anew); `leaving` runs it back.
 */
export function SelectPath({ d, id, className, duration, easing, leaving = false }: { d: string; id: string; className: string; duration?: number | undefined; easing?: string | undefined; leaving?: boolean }) {
  const from = startAtTop(d), style = drawStyle(duration, easing);
  const state = leaving ? " mo-sel-leave" : "";
  return <g key={id} className="mo-sel" aria-hidden="true">
    <path className={`${className} mo-sel-a${state}`} d={from} pathLength={1} fillRule="evenodd" vectorEffect="non-scaling-stroke" pointerEvents="none" style={style} />
    <path className={`${className} mo-sel-b${state}`} d={from} pathLength={1} fillRule="evenodd" vectorEffect="non-scaling-stroke" pointerEvents="none" style={style} />
  </g>;
}

/** A ring round a chosen dot, drawn from its top clockwise. */
export function SelectRing({ cx, cy, r, className, duration, easing, strokeWidth }: { cx: number; cy: number; r: number; className: string; duration?: number | undefined; easing?: string | undefined; strokeWidth?: number | undefined }) {
  // No non-scaling stroke here: Chrome lays a dash of pathLength 1 along the screen-space circle then, so a zoomed ring
  // draws only part of itself. A zoomed map passes its stroke width in its own units instead.
  return <circle className={`${className} mo-ring`} cx={cx} cy={cy} r={r} pathLength={1} transform={`rotate(-90 ${cx} ${cy})`}
    style={drawStyle(duration, easing)} aria-hidden="true" pointerEvents="none" strokeWidth={strokeWidth} />;
}

/**
 * A chosen row's outline (an HTML box): drawn once over the box that holds it (its nearest positioned ancestor), from
 * the middle of its top and bottom edges out to the sides, and kept while it stays chosen. Render it inside the row
 * with a `key` that changes with the choice.
 */
export function SelectTrace({ duration, delay, inset = 1 }: { duration?: number | undefined; delay?: string | undefined; inset?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState<{ width: number; height: number; radius: number; top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const measure = () => setBox((was) => {
      const s = getComputedStyle(host);
      const width = host.offsetWidth, height = host.offsetHeight;
      const radius = parseFloat(s.borderTopLeftRadius) || 0, top = parseFloat(s.borderTopWidth) || 0, left = parseFloat(s.borderLeftWidth) || 0;
      return was && was.width === width && was.height === height && was.radius === radius ? was : { width, height, radius, top, left };
    });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const paths = box && box.width > 0 && box.height > 0 ? tracePaths(box.width, box.height, box.radius, inset) : [];
  return <svg ref={ref} className="mo-select-trace" aria-hidden="true" focusable="false" style={{ ...(box ? { top: -box.top, left: -box.left } : {}), ...drawStyle(duration), ...(delay ? { "--mo-sel-delay": delay } : {}) }}
    width={box?.width ?? 0} height={box?.height ?? 0} viewBox={box ? `0 0 ${box.width} ${box.height}` : undefined}>
    {paths.map((p, i) => <path key={i} d={p} pathLength={1} />)}
  </svg>;
}
