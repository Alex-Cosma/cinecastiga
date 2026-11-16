"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { EASE, EASE_EXIT, prefersReducedMotion } from "./outline";

/*
 * Filter chips enter and leave (UX audit M-10, motion pass 16 November 2026): a chip added comes in over --fast (scale
 * .92 → 1, fading in); a chip taken out leaves in 120 ms (--ease-exit, to .92) and then its neighbours slide into the
 * room in 200 ms (FLIP: they are already in place, drawn from where they were). Only the chips move; the answer or the
 * rows change at once, after the decision. Reduced motion: opacity only, the neighbours jump. Each chip carries a stable
 * `data-chip` key inside the box behind `ref`.
 */

type Seen = { node: HTMLElement; left: number; top: number; width: number; height: number };

/** Where `node` sits in `box`'s layout, without any transform it is animated by (offsets up to the box). */
function placeIn(node: HTMLElement, box: HTMLElement): { left: number; top: number } {
  let left = 0, top = 0, at: HTMLElement | null = node;
  while (at && at !== box) {
    left += at.offsetLeft; top += at.offsetTop;
    const parent = at.offsetParent as HTMLElement | null;
    if (!parent || !box.contains(parent) && parent !== box) {
      // The box is not an offset parent: measure both from their common one.
      left -= box.offsetLeft; top -= box.offsetTop;
      break;
    }
    at = parent;
  }
  return { left, top };
}

export function useChipMotion(ref: RefObject<HTMLElement | null>): void {
  const seen = useRef<Map<string, Seen>>(new Map());
  // After the first drawing, a chip that appears enters, even into a box that was empty or not there.
  const primed = useRef(false);
  useLayoutEffect(() => {
    const box = ref.current;
    const first = !primed.current;
    primed.current = true;
    if (!box) { seen.current = new Map(); return; }
    if (getComputedStyle(box).position === "static") box.style.position = "relative";
    const now = new Map<string, Seen>();
    for (const node of Array.from(box.querySelectorAll<HTMLElement>("[data-chip]"))) {
      if (!node.offsetWidth) continue;
      const p = placeIn(node, box);
      now.set(node.dataset.chip!, { node, left: p.left, top: p.top, width: node.offsetWidth, height: node.offsetHeight });
    }
    const before = seen.current;
    seen.current = now;
    if (first || typeof box.animate !== "function") return;
    const still = prefersReducedMotion();
    let left = false;
    for (const [key, was] of before) {
      if (now.has(key)) continue;
      left = true;
      // The chip React took out leaves from where it was: a copy, out of the reading order and the pointer's way.
      const ghost = was.node.cloneNode(true) as HTMLElement;
      ghost.removeAttribute("data-chip");
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      Object.assign(ghost.style, { position: "absolute", left: `${was.left}px`, top: `${was.top}px`, width: `${was.width}px`, height: `${was.height}px`, margin: "0", pointerEvents: "none" });
      box.appendChild(ghost);
      const out = ghost.animate(still ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.92)" }], { duration: 120, easing: EASE_EXIT, fill: "forwards" });
      out.onfinish = () => ghost.remove();
    }
    for (const [key, is] of now) {
      const was = before.get(key);
      if (!was) {
        is.node.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "none" }], { duration: 160, easing: EASE });
        continue;
      }
      const dx = was.left - is.left, dy = was.top - is.top;
      if (still || (!dx && !dy)) continue;
      is.node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 200, delay: left ? 120 : 0, easing: EASE, fill: "backwards" });
    }
  });
}
