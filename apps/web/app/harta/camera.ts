/*
 * The map's camera as a transform (UX audit M-17, owner, 16 November 2026). The SVG takes its new viewBox at once (its
 * final state, its hit-testing and its hatching are those of today) and a group inside it (`.mx-cam`) starts where the
 * old view put things and eases to no transform. The path is today's: the viewBox it would have shown, eased out
 * (cubic) from the old one to the new, sampled into keyframes. Pure, so it is tested (camera.test.ts).
 */

export type ViewBox = readonly [number, number, number, number];

/** Where a viewBox puts user space on a W × H box (xMidYMid meet): screen = s · p + (bx, by). */
export interface Mapping { s: number; bx: number; by: number }

export function mapping(v: ViewBox, width: number, height: number): Mapping {
  const s = Math.min(width / v[2], height / v[3]);
  return { s, bx: (width - v[2] * s) / 2 - s * v[0], by: (height - v[3] * s) / 2 - s * v[1] };
}

/** A viewBox that fills the box and shows what `m` shows (the view of a camera caught mid-way). */
export function viewOf(m: Mapping, width: number, height: number): ViewBox {
  return [-m.bx / m.s, -m.by / m.s, width / m.s, height / m.s];
}

/** The transform (user units of the new view, origin 0 0) that draws under view `to` what view `from` showed. */
export function fromView(from: ViewBox, to: ViewBox, width: number, height: number): string {
  const a = mapping(from, width, height), b = mapping(to, width, height);
  const k = a.s / b.s, cx = (a.bx - b.bx) / b.s, cy = (a.by - b.by) / b.s;
  return `matrix(${k.toFixed(6)}, 0, 0, ${k.toFixed(6)}, ${cx.toFixed(3)}, ${cy.toFixed(3)})`;
}

/** The camera's keyframes: today's eased viewBox path from `from` to `to`, as transforms of the group under `to`. */
export function glideFrames(from: ViewBox, to: ViewBox, width: number, height: number, steps = 24): string[] {
  const frames: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const e = 1 - Math.pow(1 - i / steps, 3);
    const v = from.map((f, j) => f + (to[j]! - f) * e) as unknown as ViewBox;
    frames.push(i === steps ? "none" : fromView(v, to, width, height));
  }
  return frames;
}

/** The view on screen while the group is drawn with matrix (k, 0, 0, k, cx, cy) under view `under`. */
export function viewUnder(under: ViewBox, k: number, cx: number, cy: number, width: number, height: number): ViewBox {
  const m = mapping(under, width, height);
  return viewOf({ s: m.s * k, bx: m.s * cx + m.bx, by: m.s * cy + m.by }, width, height);
}
