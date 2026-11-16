import { useEffect, useLayoutEffect, useRef, useState, type AnimationEvent, type RefObject } from "react";
import { chartPace } from "@/components/motion/pace";
import { glideFrames, viewUnder, type ViewBox } from "./camera";

/*
 * Motion for /harta's charts (owner, 6 November 2026; DESIGN.md "Charts in motion"). The vocabulary is the shared kit
 * (components/motion/chart-motion.css, gated by app/Reveal.tsx); these hooks only add what CSS cannot do here.
 */

/** Reduced motion, or a page reached by back/forward (Reveal marks it settled): charts are drawn finished. */
const drawnFinished = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "settled";

/**
 * A map layer's first fill. Until its numbers are in, and for one painted frame after, its areas show the ramp's base
 * tint; then they take their values and the areas' own fill-opacity transition (harta.css) fills them all together,
 * never in the order of their values.
 */
export function useFillIn(ready: boolean): boolean {
  const [filled, setFilled] = useState(false);
  useLayoutEffect(() => {
    if (!ready || filled) return;
    // Before paint: the finished map without a frame of base tint.
    if (drawnFinished()) { setFilled(true); return; }
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setFilled(true)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [ready, filled]);
  return filled;
}

/**
 * A chart's entrance classes, for marks React may later move (a ranking taking a new order, a list re-sorted by a
 * filter). They stay only until the entrance has played: a moved element is inserted again, and an animation still
 * named on it would replay. Marks that join after the entrance (keys it did not draw) fade in briefly (`cm-in`).
 * `subject` is what the chart shows (the map's level); a new subject enters anew. Put `onAnimationEnd` on the
 * chart's root (the element with `data-chart`).
 */
export function useEntrance(subject: string, keys: readonly string[]) {
  const [done, setDone] = useState<{ subject: string; keys: ReadonlySet<string> } | null>(null);
  const entering = done?.subject !== subject;
  return {
    entering,
    /** The class a mark gets: its entrance while the chart enters, nothing afterwards, `cm-in` if it joined later. */
    mark: (key: string, entrance: string) => (!done || done.subject !== subject ? entrance : done.keys.has(key) ? "" : "cm-in"),
    onAnimationEnd: (event: AnimationEvent<Element>) => {
      if (!entering || !event.animationName.startsWith("cm-")) return;
      const playing = event.currentTarget.getAnimations({ subtree: true })
        .some((a) => a.playState === "running" && a instanceof CSSAnimation && a.animationName.startsWith("cm-"));
      if (!playing) setDone({ subject, keys: new Set(keys) });
    },
  };
}

/**
 * The map's camera (UX audit M-17, owner, 16 November 2026): the SVG takes the target viewBox at once and the group
 * `cam` (put on `.mx-cam`, the map's whole drawing) starts where the old view put things and eases to no transform
 * along today's path (camera.ts: the eased viewBox, sampled), over 560 ms at pace 1 (--chart-pace, components/motion/
 * pace.ts). React draws the map once per move instead of every frame, and the move is a transform. The one motion on
 * the site longer than --slow besides the methodology's story (DESIGN.md: "the /harta camera move"). The first view,
 * and reduced motion, take the target at once; a move caught mid-way starts from what is on screen.
 */
export function useGlide<T extends readonly number[]>(target: T | null, duration = 560): { view: T | null; cam: RefObject<SVGGElement | null> } {
  const [view, setView] = useState<T | null>(null);
  const cam = useRef<SVGGElement | null>(null);
  const from = useRef<ViewBox | null>(null);
  const move = useRef<Animation | null>(null);
  // Before paint: what is on screen now (the view, or the camera caught mid-way), then the new viewBox.
  useLayoutEffect(() => {
    if (!target) return;
    from.current = view ? onScreen(view as unknown as ViewBox, cam.current, move.current) : null;
    setView(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  // The new viewBox is drawn: the group starts on the old view and eases to none, in the same frame.
  useLayoutEffect(() => {
    const start = from.current;
    from.current = null;
    move.current?.cancel(); move.current = null;
    const g = cam.current, svg = g?.ownerSVGElement;
    if (!view || !start || !g || !svg || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const width = svg.clientWidth, height = svg.clientHeight;
    if (!width || !height) return;
    const frames = glideFrames(start, view as unknown as ViewBox, width, height);
    move.current = g.animate(frames.map((transform) => ({ transform })), { duration: duration * chartPace(), easing: "linear" });
    move.current.onfinish = () => { move.current = null; };
  }, [view, duration]);
  useEffect(() => () => move.current?.cancel(), []);
  return { view, cam };
}

/** The view on screen: `view`, or, while the camera moves, the one its group's transform shows now. */
function onScreen(view: ViewBox, g: SVGGElement | null, move: Animation | null): ViewBox {
  const svg = g?.ownerSVGElement;
  if (!g || !svg || !move || move.playState !== "running") return view;
  const m = getComputedStyle(g).transform.match(/^matrix\(([^)]+)\)$/);
  if (!m) return view;
  const [k, , , , cx, cy] = m[1]!.split(",").map(Number) as [number, number, number, number, number, number];
  return viewUnder(view, k, cx, cy, svg.clientWidth, svg.clientHeight);
}

/**
 * The UAT panel's opening and closing on wide screens (UX audit M-17): the grid takes its new columns at once (no
 * grid-template-columns animated, which laid the page out again every frame) and what moved glides from where it was,
 * by transform, over --slow: the map's frame scales from its old size (its crumb's words kept at their size) and the
 * ranking travels from beside the map to under it, or back. Under 980 px the panel comes below and nothing changes
 * width; reduced motion takes the new places at once. Returns the ref of `.mx-body`.
 */
export function usePanelShift(open: boolean): RefObject<HTMLDivElement | null> {
  const body = useRef<HTMLDivElement | null>(null);
  const was = useRef(open);
  useLayoutEffect(() => {
    if (was.current === open) return;
    was.current = open;
    const el = body.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 980px)").matches) return;
    const stage = el.querySelector<HTMLElement>(":scope > .mx-stage"), rank = el.querySelector<HTMLElement>(":scope > .mx-rank");
    const panel = el.querySelector<HTMLElement>(":scope > .mx-panel");
    if (!stage || !rank) return;
    const after = [stage.getBoundingClientRect(), rank.getBoundingClientRect()] as const;
    // The places they had: the old columns for one measurement, before anything is painted.
    el.classList.toggle("has-panel", !open);
    if (panel) panel.style.display = "none";
    const before = [stage.getBoundingClientRect(), rank.getBoundingClientRect()] as const;
    el.classList.toggle("has-panel", open);
    if (panel) panel.style.display = "";
    const root = getComputedStyle(document.documentElement);
    const timing = { duration: cssTime(root.getPropertyValue("--slow"), 420), easing: root.getPropertyValue("--ease").trim() || "ease-out" };
    const k = after[0].width ? before[0].width / after[0].width : 1;
    if (Math.abs(k - 1) > 0.01) {
      stage.animate([{ transformOrigin: "0 0", transform: `translate(${before[0].left - after[0].left}px, ${before[0].top - after[0].top}px) scale(${k})` }, { transformOrigin: "0 0", transform: "none" }], timing);
      const crumb = stage.querySelector<HTMLElement>(":scope > .mx-crumb");
      crumb?.animate([{ transformOrigin: "0 0", transform: `scale(${1 / k})` }, { transformOrigin: "0 0", transform: "none" }], timing);
    }
    const dx = before[1].left - after[1].left, dy = before[1].top - after[1].top;
    if (Math.abs(dx) + Math.abs(dy) > 1) rank.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], timing);
  }, [open]);
  return body;
}

/** A CSS time ("420ms", ".42s") in milliseconds. */
function cssTime(raw: string, fallback: number): number {
  const text = raw.trim(), value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return text.endsWith("ms") ? value : text.endsWith("s") ? value * 1000 : fallback;
}
