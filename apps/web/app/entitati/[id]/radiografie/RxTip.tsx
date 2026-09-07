"use client";

import { useState, type ReactNode } from "react";

/**
 * Rich fixed tooltip for the radiografie charts (the ask-engine useTip only
 * carries three strings; these cards need bars and grids). One per component.
 */
export function useRxTip() {
  const [tip, setTip] = useState<{ node: ReactNode; x: number; y: number; card: boolean } | null>(null);
  const show = (node: ReactNode, e: { clientX: number; clientY: number }, card = false) =>
    setTip({ node, x: e.clientX, y: e.clientY, card });
  const hide = () => setTip(null);
  let el: ReactNode = null;
  if (tip) {
    const w = tip.card ? 420 : 300;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const left = Math.min(tip.x + 14, vw - w - 8);
    const top = tip.y + 16 + (tip.card ? 260 : 120) > vh ? tip.y - (tip.card ? 270 : 130) : tip.y + 16;
    el = (
      <div className={`rx-tip${tip.card ? " card" : ""}`} style={{ left, top }}>
        {tip.node}
      </div>
    );
  }
  return { show, hide, el };
}

export const fmtM = (v: number): string =>
  v >= 1e9
    ? `${(v / 1e9).toFixed(1).replace(".", ",")} mld`
    : v >= 1e6
      ? `${(v / 1e6).toFixed(1).replace(".", ",")} mil`
      : `${Math.round(v / 1e3)} k`;
export const pct = (v: number): string => `${(v * 100).toFixed(v * 100 < 1 ? 1 : 0).replace(".", ",")}%`;
export const yrs = (a: string, b: string): string => (a === b ? a : `${a}–${b}`);
