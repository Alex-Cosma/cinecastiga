"use client";

import { useLayoutEffect, useRef, useState } from "react";

/*
 * The trace around a signal tag while a mouse rests on it (owner, 15 November 2026): a thin line starts at the middle
 * of the tag's top and bottom edges, runs out to both sides, round the corners, and closes at the middle of its left
 * and right edges in exactly the wait before the explanation shows (TAG_HOLD_MS); the explanation opens as the line
 * closes. Leaving early, it runs back to the middle. Drawn over the tag's border (filters-kit.css .tag-trace).
 */

/** The tag's corner radius (filters-kit.css .qb-tag border-radius). */
const RADIUS = 5;

/**
 * The four quarters of the tag's outline, each from the middle of the top or bottom edge to the middle of a side,
 * on the border's centre line (half a pixel in) of a `width` × `height` box: top right, top left, bottom right,
 * bottom left. Mirror images, so they meet at the sides at the same moment.
 */
export function tracePaths(width: number, height: number, radius = RADIUS): string[] {
  const s = 0.5, x0 = s, x1 = width - s, y0 = s, y1 = height - s;
  const r = Math.max(0, Math.min(radius - s, (x1 - x0) / 2, (y1 - y0) / 2));
  const cx = width / 2, cy = height / 2;
  const n = (v: number) => Number(v.toFixed(2));
  return [
    `M${n(cx)} ${n(y0)}H${n(x1 - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x1)} ${n(y0 + r)}V${n(cy)}`,
    `M${n(cx)} ${n(y0)}H${n(x0 + r)}A${n(r)} ${n(r)} 0 0 0 ${n(x0)} ${n(y0 + r)}V${n(cy)}`,
    `M${n(cx)} ${n(y1)}H${n(x1 - r)}A${n(r)} ${n(r)} 0 0 0 ${n(x1)} ${n(y1 - r)}V${n(cy)}`,
    `M${n(cx)} ${n(y1)}H${n(x0 + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x0)} ${n(y1 - r)}V${n(cy)}`,
  ];
}

/** The trace of the tag that holds it (`.qb-tag-tip`), measured on the screen and kept to its size. */
export default function TagTrace() {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const tag = ref.current?.closest<HTMLElement>(".qb-tag-tip");
    if (!tag) return;
    const measure = () => setSize((was) => {
      const width = tag.offsetWidth, height = tag.offsetHeight;
      return was && was.width === width && was.height === height ? was : { width, height };
    });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(tag);
    return () => observer.disconnect();
  }, []);
  const paths = size && size.width > 0 && size.height > 0 ? tracePaths(size.width, size.height) : [];
  return <svg ref={ref} className="tag-trace" aria-hidden="true" focusable="false"
    width={size?.width ?? 0} height={size?.height ?? 0} viewBox={size ? `0 0 ${size.width} ${size.height}` : undefined}>
    {paths.map((d, i) => <path key={i} d={d} pathLength={1} />)}
  </svg>;
}
