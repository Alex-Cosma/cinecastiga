"use client";

import { useEffect, useRef, type ReactNode } from "react";
import HelpTip from "../builder/HelpTip";
import type { KitTip, SentenceToken } from "../builder/kit-types";

/*
 * The frame of the dev demo (kit/components.html): numbered sections with
 * their classes, captions, cells for static states and a "live" strip where
 * the component works. Shared by both halves of the demo.
 */

export const text = (value: string): SentenceToken => ({ kind: "text", text: value });
export const slot = (id: string, name: string, value: string, className?: string): SentenceToken => ({ kind: "slot", id, slot: name, value, ...(className ? { className } : {}) });

export function Section({ n, title, classes, note, children }: { n: number; title: string; classes: string; note: string; children: ReactNode }) {
  return <section className="kd-sec" id={`kd-sec-${n}`} aria-labelledby={`kd-sec-${n}-h`}>
    <div className="kd-sec-head"><h2 id={`kd-sec-${n}-h`}>{n}. {title}</h2><code>{classes}</code><p>{note}</p></div>
    <div className="kd-panel fk">{children}</div>
  </section>;
}
export const Cap = ({ children }: { children: ReactNode }) => <span className="kd-cap">{children}</span>;
export const Cell = ({ cap, wide = false, children }: { cap: string; wide?: boolean; children: ReactNode }) => <div className={`kd-cell${wide ? " kd-cell-wide" : ""}`}><Cap>{cap}</Cap>{children}</div>;
export const Live = ({ children }: { children: ReactNode }) => <div className="kd-live"><Cap>funcționează: mouse, tastatură, atingere</Cap>{children}</div>;

/** A (?) drawn open, for the frame of the open state: the real Term, pressed once on load. */
export function OpenTip({ tip }: { tip: KitTip }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>(".term-trigger")?.click(); }, []);
  return <span ref={ref} className="kd-opentip"><HelpTip tip={tip} /></span>;
}
