"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { tracePaths } from "./outline";

/*
 * The trace round a target that holds its explanation (M-01; owner, 15 November 2026 for the signal tags, extended to
 * every large target by the UX audit's motion pass, 16 November 2026): a thin line starts at the middle of the top and
 * bottom edges, runs out to both sides, round the corners, and closes at the middle of the left and right edges in
 * exactly the wait before the explanation shows (--hold); the explanation opens as the line closes. Leaving early, it
 * runs back to the middle. Drawn over the target's border, in its own colour (outline.css .tag-trace). Term renders it
 * inside its button when `hold="box"`; it measures the Term's root (the tag, the pill).
 */
export default function HoldTrace() {
  const ref = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState<{ width: number; height: number; radius: number; top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const root = ref.current?.closest<HTMLElement>(".term-tip");
    if (!root) return;
    // The outline goes round whichever draws the box: the Term's root (a tag, a pill), or its button when the pill is
    // drawn on the button and the root has no border (.ehead-flag, .sgc-under, .sgc-also, .sg-inactive).
    const button = root.querySelector<HTMLElement>(":scope > .term-trigger");
    const width = (el: HTMLElement) => { const s = getComputedStyle(el); return (parseFloat(s.borderTopWidth) || 0) + (parseFloat(s.borderLeftWidth) || 0); };
    const onButton = !!button && width(root) === 0 && width(button) > 0;
    if (onButton) root.dataset.traceOn = "trigger";
    const target = onButton && button ? button : root;
    const measure = () => setBox((was) => {
      const s = getComputedStyle(target);
      const width = target.offsetWidth, height = target.offsetHeight;
      const radius = parseFloat(s.borderTopLeftRadius) || 0, top = parseFloat(s.borderTopWidth) || 0, left = parseFloat(s.borderLeftWidth) || 0;
      return was && was.width === width && was.height === height && was.radius === radius && was.top === top && was.left === left ? was : { width, height, radius, top, left };
    });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => { observer.disconnect(); delete root.dataset.traceOn; };
  }, []);
  const paths = box && box.width > 0 && box.height > 0 ? tracePaths(box.width, box.height, box.radius) : [];
  return <svg ref={ref} className="tag-trace" aria-hidden="true" focusable="false"
    style={box ? { top: -box.top, left: -box.left } : undefined}
    width={box?.width ?? 0} height={box?.height ?? 0} viewBox={box ? `0 0 ${box.width} ${box.height}` : undefined}>
    {paths.map((d, i) => <path key={i} d={d} pathLength={1} />)}
  </svg>;
}
