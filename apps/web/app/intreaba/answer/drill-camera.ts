/*
 * Going down a level of „Ce se cumpără” (UX audit M-20, owner, 16 November 2026): the chosen part becomes the whole.
 * The domain clicked widens until it fills the bar (its neighbours slide out of it, as the camera moves), then its
 * subdomains and the legend appear (opacity, 210 ms); going back up a level, the legend leaves (120 ms) and the bar
 * comes back out of the domain it was. 260 ms × --chart-pace (1.5) = 390 ms, --ease, transform and opacity only; the
 * words never scale (they are in the legend, which is not moved). Only the same question narrowed: another subject
 * enters anew. Reduced motion: the new level at once.
 *
 * The click runs the new level in place (AskPanel); its answer remounts the result (keyed by its subject), so the
 * camera plays on a copy of the bar laid over it, which the new bar replaces when it is drawn.
 */
import { chartPace } from "../../../components/motion/pace";

/** The camera's length at pace 1 (--med); the subdomains' appearance; the legend's exit. */
export const CAMERA_MS = 260, APPEAR_MS = 210, LEGEND_OUT_MS = 120;

export interface Box { left: number; width: number }

/**
 * Each segment's transform (origin at its own left edge) that makes segment `chosen` fill a bar of `width`: the bar
 * scaled by width ÷ the chosen one's width around the chosen one's left edge, then moved to the bar's start.
 */
export function fillTransforms(segments: readonly Box[], chosen: number, width: number): string[] {
  const c = segments[chosen];
  if (!c || c.width <= 0) return segments.map(() => "none");
  const k = width / c.width;
  return segments.map((s) => `translateX(${((s.left - c.left) * k - s.left).toFixed(2)}px) scaleX(${k.toFixed(4)})`);
}

/** The domain of `codes` that holds `code` (itself, or the level above it that leads to it). */
export function holding(codes: readonly (string | null)[], code: string): number {
  let best = -1;
  codes.forEach((c, i) => { if (c && code.startsWith(c) && (best < 0 || c.length > codes[best]!.length)) best = i; });
  return best;
}

interface Pending { dir: "down" | "up"; code: string; until: number; copy: HTMLElement | null; timer: number }
let pending: Pending | null = null;

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = () => getComputedStyle(document.documentElement).getPropertyValue("--ease").trim() || "ease-out";
const exit = () => getComputedStyle(document.documentElement).getPropertyValue("--ease-exit").trim() || "ease-in";
const boxes = (bar: HTMLElement) => [...bar.children].map((s) => ({ left: (s as HTMLElement).offsetLeft, width: (s as HTMLElement).offsetWidth }));

function drop() {
  if (!pending) return;
  window.clearTimeout(pending.timer);
  pending.copy?.remove();
  pending = null;
}

/** Whether the level being drawn arrives from a drill (its bar then appears, instead of its usual entrance). */
export const arriving = (): boolean => pending !== null && performance.now() < pending.until + 8000;

/** A domain clicked (its segment or its legend row): its segment widens to fill the bar, on a copy laid over it. */
export function drillDown(from: Element, code: string): void {
  drop();
  const result = from.closest(".cq-result");
  const bar = result?.querySelector<HTMLElement>(".ask-comp");
  const legend = result?.querySelector<HTMLElement>(".ask-complegend");
  if (!bar || reduced()) return;
  const segments = [...bar.children] as HTMLElement[];
  const chosen = segments.findIndex((s) => s.dataset.code === code);
  if (chosen < 0) return;
  const duration = CAMERA_MS * chartPace();
  const rect = bar.getBoundingClientRect();
  const copy = bar.cloneNode(true) as HTMLElement;
  copy.removeAttribute("data-chart");
  copy.classList.remove("cm-x", "has-hot");
  copy.setAttribute("aria-hidden", "true");
  copy.style.cssText = `position:absolute;left:${rect.left + scrollX}px;top:${rect.top + scrollY}px;width:${rect.width}px;height:${rect.height}px;margin:0;z-index:5;pointer-events:none;box-sizing:border-box`;
  document.body.append(copy);
  const parts = [...copy.children] as HTMLElement[];
  const to = fillTransforms(boxes(bar), chosen, bar.clientWidth);
  parts.forEach((part, i) => {
    part.style.transformOrigin = "0 50%";
    part.animate([{ transform: "none" }, { transform: to[i]! }], { duration, easing: ease(), fill: "forwards" });
    if (i !== chosen) part.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duration * 0.6, easing: exit(), fill: "forwards" });
  });
  legend?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LEGEND_OUT_MS, easing: exit(), fill: "forwards" });
  pending = { dir: "down", code, until: performance.now() + duration, copy, timer: window.setTimeout(drop, 10000) };
}

/** A level up (the thread's crumbs): the legend leaves now; the bar comes out of `code` when the level is drawn. */
export function drillUp(from: Element, code: string): void {
  drop();
  if (reduced() || !code) return;
  const legend = from.closest("#raspuns")?.querySelector<HTMLElement>(".ask-complegend");
  legend?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LEGEND_OUT_MS, easing: exit(), fill: "forwards" });
  pending = { dir: "up", code, until: performance.now(), copy: null, timer: window.setTimeout(drop, 10000) };
}

/** The new level's bar and legend are drawn (before paint): they appear after the camera, or the camera runs back. */
export function arrive(bar: HTMLElement | null, legend: HTMLElement | null): void {
  const p = pending;
  if (!p) return;
  pending = null;
  window.clearTimeout(p.timer);
  if (!bar) { p.copy?.remove(); return; }
  const duration = CAMERA_MS * chartPace();
  if (p.dir === "down") {
    // The camera may still be moving on the copy: the subdomains wait for it, then take its place.
    const wait = Math.max(0, p.until - performance.now());
    const copy = p.copy;
    if (copy) {
      const from = copy.getBoundingClientRect(), to = bar.getBoundingClientRect();
      copy.animate([{ translate: "0 0", opacity: 1 }, { translate: `${to.left - from.left}px ${to.top - from.top}px`, opacity: 0 }],
        { duration: APPEAR_MS, delay: wait, easing: ease(), fill: "forwards" }).onfinish = () => copy.remove();
    }
    for (const el of [bar, legend]) el?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: APPEAR_MS, delay: wait, easing: ease(), fill: "backwards" });
    return;
  }
  // Up: the bar starts as the domain we came from, filling it, and comes back to its place; its neighbours come in
  // during the second part; the legend after.
  const segments = [...bar.children] as HTMLElement[];
  const i = holding(segments.map((s) => s.dataset.code ?? null), p.code);
  if (i < 0) { for (const el of [bar, legend]) el?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: APPEAR_MS, easing: ease() }); return; }
  const from = fillTransforms(boxes(bar), i, bar.clientWidth);
  segments.forEach((s, j) => {
    s.style.transformOrigin = "0 50%";
    s.animate([{ transform: from[j]! }, { transform: "none" }], { duration, easing: ease(), fill: "backwards" });
    if (j !== i) s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration * 0.6, delay: duration * 0.4, easing: ease(), fill: "backwards" });
  });
  legend?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: APPEAR_MS, delay: duration * 0.6, easing: ease(), fill: "backwards" });
}

/** A browser Back or another answer: nothing is left over. */
export const cancelDrill = (): void => drop();
