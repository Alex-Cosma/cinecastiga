import { useEffect, useLayoutEffect, useRef, useState, type AnimationEvent } from "react";

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
 * The map's camera: the SVG viewBox eases (ease-out cubic) from where it is to the target, over 560 ms. The one
 * motion on the site longer than --slow besides the methodology's story (DESIGN.md: "the /harta camera move"). The
 * first view, and reduced motion, take the target at once.
 */
export function useGlide<T extends readonly number[]>(target: T | null, duration = 560): T | null {
  const [view, setView] = useState<T | null>(null);
  const at = useRef<T | null>(null);
  useEffect(() => {
    if (!target) return;
    const from = at.current;
    if (!from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { at.current = target; setView(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration), e = 1 - Math.pow(1 - k, 3);
      const next = from.map((f, i) => f + (target[i]! - f) * e) as unknown as T;
      at.current = next; setView(next);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return view;
}
