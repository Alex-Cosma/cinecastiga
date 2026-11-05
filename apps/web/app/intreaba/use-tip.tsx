"use client";

import { useState } from "react";

/*
 * Its own module (audit P3F1, 5 Nov 2026): the entity page's tables and year chart import only this hook, and importing
 * it from blocks.tsx pulled the whole Ask answer code into that page's bundle. blocks.tsx re-exports it.
 */

/**
 * House rule (docs/PRINCIPLES.md): every graph element answers on hover with an
 * instant cursor-following tooltip — never the sluggish native <title>. Usage:
 * const t = useTip(); spread {...t.bind("Titlu", "linie valoare", "linie mică")}
 * on the element; render {t.el} once per block.
 */
export interface TipBind {
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
}
/** A screen whose main pointer cannot hover (a phone, a tablet): no cursor tip there. */
const noHover = (): boolean => typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches === true;
/** The tip beside the cursor, turned to its other side near the screen's right or bottom edge (its max-width is 240 px). */
const TIP_W = 248, TIP_H = 96;
function tipPlace(x: number, y: number): { left: number; top: number } {
  const w = typeof window !== "undefined" ? window.innerWidth : Infinity, h = typeof window !== "undefined" ? window.innerHeight : Infinity;
  return {
    left: x + 14 + TIP_W > w ? Math.max(8, x - 14 - TIP_W) : x + 14,
    top: y + 14 + TIP_H > h ? Math.max(8, y - 14 - TIP_H) : y + 14,
  };
}
export function useTip() {
  const [tip, setTip] = useState<{
    title: string;
    v?: string | undefined;
    s?: string | undefined;
    x: number;
    y: number;
  } | null>(null);
  const bind = (title: string, v?: string, s?: string): TipBind => {
    // A tap emulates the mouse's enter and never its leave: on a screen without hover the tip would stay over what the
    // tap opened, past the screen's edge (S4 review: a bar's card on a phone). There the tap's own result speaks.
    const move = (e: React.MouseEvent) => {
      if (noHover()) return;
      setTip({ title, v, s, x: e.clientX, y: e.clientY });
    };
    return {
      onMouseEnter: move,
      onMouseMove: move,
      onMouseLeave: () => setTip(null),
    };
  };
  /** Instant full-text tooltip for ellipsized cells — fires ONLY when the
   *  element is actually truncated, so untrimmed text stays quiet. */
  const bindClip = (text: string | null | undefined): TipBind => {
    const move = (e: React.MouseEvent) => {
      const el = e.currentTarget as HTMLElement;
      if (!text || noHover() || el.scrollWidth <= el.clientWidth + 1) {
        setTip(null);
        return;
      }
      setTip({ title: text, x: e.clientX, y: e.clientY });
    };
    return {
      onMouseEnter: move,
      onMouseMove: move,
      onMouseLeave: () => setTip(null),
    };
  };
  const el = tip ? (
    <div className="ask-maptip" style={tipPlace(tip.x, tip.y)}>
      <div className="t">{tip.title}</div>
      {tip.v && <div className="v">{tip.v}</div>}
      {tip.s && <div className="s">{tip.s}</div>}
    </div>
  ) : null;
  /** Manual control for canvas-rendered blocks (no DOM element to bind). */
  const show = (
    title: string,
    v: string | undefined,
    s: string | undefined,
    x: number,
    y: number,
  ) => setTip({ title, v, s, x, y });
  const hide = () => setTip(null);
  return { bind, bindClip, show, hide, el, active: tip?.title ?? null };
}
