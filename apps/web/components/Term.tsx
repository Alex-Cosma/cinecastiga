"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { GLOSSARY, type GlossaryId } from "../lib/glossary";
import HoldTrace from "./motion/HoldTrace";
import TipText from "./TipText";
import { EASE, cssMs, prefersReducedMotion } from "./motion/outline";

/**
 * A word with a one-tap explanation from the shared glossary.
 *
 *   <Term id="achizitie-directa">achiziții directe</Term>
 *
 * The word is a real button: a tap, a click, Enter or Space opens the
 * definition below it, in the page flow (no hover-only tooltip, nothing that
 * can widen a 390 px screen). Escape or a second press closes it. Do not
 * place a Term inside a link or another button: split the link instead.
 */
type TermProps = {
  children?: ReactNode; className?: string; tip?: boolean;
  /**
   * A large target (a tag, a pill, a dotted word, a column header) whose floating explanation waits for a resting
   * mouse (M-01, UX audit 16 November 2026): the root carries `term-holding` for the wait (--hold, 1 s) while an
   * outline closes round it ("box": over its border, components/motion/HoldTrace.tsx) or its dotted line turns solid
   * from the middle out ("line"); the explanation opens as it closes. A tap, a click or the keyboard show it at once.
   * Never on the small "?", which opens at once.
   */
  hold?: "box" | "line";
} & (
  | { id: GlossaryId; title?: never; text?: never }
  // A caveat built from page data (one signal, one contract) that has no
  // fixed glossary entry. The binding wording still lives in the caller.
  | { id?: never; title: string; text: ReactNode }
);

/**
 * An Escape that closed the definition closes only it: not the window around
 * it either, by propagation or by a modal dialog's own cancel (which a
 * cancelled keydown does not fire).
 */
function closeOnly(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/** The gap between a floating definition and its "?". */
const TIP_GAP = 6;
/** How far a floating definition keeps inside the screen's sides and bottom. */
const TIP_EDGE = 16;
/** The widest a floating definition grows (guide.css has the same cap for its first frame). */
const TIP_WIDTH = 360;
/** How long a definition stays after the mouse leaves its "?", so it can move onto the box (to scroll a long one). */
const TIP_LEAVE_MS = 150;

/**
 * Whether a floating definition opened above its anchor would pass the top
 * of what the reader sees (the screen, or the sticky header's bottom): it
 * opens below then (S4t-tip-above, „Ponderile” at 320 px after a click had
 * scrolled the strip to the top).
 */
export function tipOpensBelow(anchorTop: number, height: number, ceiling: number): boolean {
  return height > 0 && anchorTop - TIP_GAP - height < Math.max(0, ceiling);
}

type Box = { left: number; top: number; bottom: number };
/**
 * Where a floating definition goes on the screen (14 November 2026: every (?) is placed from its own "?", not from the
 * nearest positioned box, which had sent some to the top of a whole section at its full width). Above the "?" when it
 * fits under the screen's top or the sticky header, else below; when neither side holds it, the side with more room,
 * with the box cut to that room (it scrolls). Its left edge starts a little before the "?" and stays 16 px inside the
 * screen's sides.
 */
export function tipPlace(trigger: Box, box: { width: number; height: number }, screen: { width: number; height: number }, ceiling: number): { left: number; top: number; maxHeight: number | null } {
  const left = Math.max(TIP_EDGE, Math.min(trigger.left - 12, screen.width - box.width - TIP_EDGE));
  const roof = Math.max(0, ceiling);
  const roomAbove = trigger.top - TIP_GAP - roof, roomBelow = screen.height - TIP_EDGE - trigger.bottom - TIP_GAP;
  if (!tipOpensBelow(trigger.top, box.height, ceiling)) return { left, top: trigger.top - TIP_GAP - box.height, maxHeight: null };
  if (box.height <= roomBelow || roomBelow >= roomAbove) return { left, top: trigger.bottom + TIP_GAP, maxHeight: box.height <= roomBelow ? null : Math.max(0, roomBelow) };
  return { left, top: roof, maxHeight: roomAbove };
}

/** Whether the browser puts a popover in the top layer (over every window, transform and clipping box). */
const topLayer = (element: HTMLElement) => typeof element.showPopover === "function";

export default function Term({ children, className, tip = false, hold, ...source }: TermProps) {
  const entry = source.id !== undefined ? GLOSSARY[source.id] : { title: source.title, text: source.text };
  const [open, setOpen] = useState(false);
  // A floating (?) shows while it is pressed open (a tap or a click), while a mouse is over it or its box, or while
  // the keyboard is on it; Escape hides it until the next of these.
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // A mouse resting on a (?) with a `hold`: the wait before it shows.
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<number | undefined>(undefined);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const definition = useRef<HTMLSpanElement>(null);
  const leaving = useRef<number | undefined>(undefined);
  const definitionId = useId();
  const shown = tip && !dismissed && (open || hover || focused);

  // Measured on the screen each time it shows, and again while the page or a window around it scrolls.
  const place = useCallback(() => {
    const def = definition.current, anchor = trigger.current;
    if (!def || !anchor) return;
    const at = anchor.getBoundingClientRect(), height = document.documentElement.clientHeight;
    if (at.bottom < 0 || at.top > height) { def.style.visibility = "hidden"; return; }
    // The page's own width, without a classic scrollbar (which `100vw` in the CSS would count).
    const width = document.documentElement.clientWidth;
    Object.assign(def.style, { maxHeight: "", maxWidth: `${Math.min(TIP_WIDTH, width - 2 * TIP_EDGE)}px` });
    const header = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
    const size = def.getBoundingClientRect();
    const spot = tipPlace(at, { width: size.width, height: size.height }, { width, height }, header);
    Object.assign(def.style, { left: `${spot.left}px`, top: `${spot.top}px`, right: "auto", bottom: "auto", margin: "0", visibility: "", maxHeight: spot.maxHeight === null ? "" : `${spot.maxHeight}px` });
    // Which side of its "?" it opened on: it comes from the "?" and leaves toward it (M-02, guide.css).
    def.dataset.side = spot.top >= at.bottom ? "below" : "above";
  }, []);

  useLayoutEffect(() => {
    const def = definition.current;
    if (!tip || !def) return;
    if (!shown) { if (topLayer(def) && def.matches(":popover-open")) def.hidePopover(); return; }
    if (topLayer(def) && !def.matches(":popover-open")) def.showPopover();
    place();
    // It comes out of its "?" (M-02): 140 ms from 4 px on the "?"'s side; with reduced motion, opacity only.
    const still = prefersReducedMotion(), from = def.dataset.side === "below" ? -4 : 4;
    const entry = typeof def.animate === "function" ? def.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translateY(${from}px)` }, { opacity: 1, transform: "none" }], { duration: still ? 100 : 140, easing: EASE }) : null;
    let frame = 0;
    const follow = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", follow);
    return () => { entry?.cancel(); cancelAnimationFrame(frame); window.removeEventListener("scroll", follow, { capture: true }); window.removeEventListener("resize", follow); };
  }, [place, shown, tip]);

  // A tap elsewhere closes a (?) opened by a tap (a phone does not move the focus to a pressed button, so no blur).
  useEffect(() => {
    if (!tip || !open) return;
    const away = (event: globalThis.PointerEvent) => { if (!(event.target instanceof Node) || !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [open, tip]);
  useEffect(() => () => { window.clearTimeout(leaving.current); window.clearTimeout(holdTimer.current); }, []);

  // The explanation floats on hover, focus or tap instead of opening in the page flow, for tight spots (home map,
  // number strip, headings) where an in-flow definition would push the layout.
  if (tip) {
    const enter = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      window.clearTimeout(leaving.current);
      setDismissed(false);
      // Already showing (back from its box within the grace), or no wait: at once.
      if (!hold || hover) { setHover(true); return; }
      setHolding(true);
      window.clearTimeout(holdTimer.current);
      holdTimer.current = window.setTimeout(() => setHover(true), cssMs("--hold", 1000));
    };
    const leave = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      window.clearTimeout(holdTimer.current);
      setHolding(false);
      window.clearTimeout(leaving.current);
      leaving.current = window.setTimeout(() => setHover(false), TIP_LEAVE_MS);
    };
    const quick = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      window.clearTimeout(holdTimer.current);
      setHolding(false);
      setHover(true);
    };
    const blur = (event: FocusEvent) => { if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return; setFocused(false); setOpen(false); };
    return <span ref={root} className={`term term-tip${children ? " term-tip-text" : ""}${hold ? ` term-hold-${hold}` : ""}${open ? " term-open" : ""}${shown ? " term-shown" : ""}${holding ? " term-holding" : ""}${className ? ` ${className}` : ""}`}
      onPointerEnter={enter} onPointerLeave={leave} onBlur={blur}
      onKeyDown={event => { if (event.key === "Escape" && shown) { closeOnly(event); setOpen(false); setDismissed(true); } }}>
      <button
        ref={trigger}
        type="button"
        className="term-trigger"
        aria-expanded={open}
        aria-describedby={definitionId}
        aria-label={children ? undefined : `${entry.title}: ce înseamnă`}
        // Inside a row's <summary> (a /preturi strip's chips), a tap opens the explanation, not the row.
        onClick={event => { if (event.currentTarget.closest("summary")) event.preventDefault(); setDismissed(false); setOpen(value => !value); }}
        onFocus={event => { if (event.currentTarget.matches(":focus-visible")) { setDismissed(false); setFocused(true); } }}
      >
        {hold === "line" ? <span className="term-words">{children}</span> : children}
        {/* The small "?" opens at once, even on a target that holds (M-01). */}
        <span className="term-mark" aria-hidden="true" onPointerEnter={hold ? quick : undefined}>?</span>
        {hold === "box" && <HoldTrace />}
      </button>
      {/* Out of the tab order: shown on focus, its scrollable box would otherwise take a second stop (critique 2 November 2026).
          A manual popover: in the top layer, over windows, sticky bars and boxes that clip, and placed from the "?" itself. */}
      <span id={definitionId} ref={definition} className="term-def" role="tooltip" tabIndex={-1} popover="manual">
        <b className="term-def-t">{entry.title}</b>{typeof entry.text === "string" ? <TipText text={entry.text} /> : entry.text}
      </span>
    </span>;
  }
  return <span className={`term${open ? " term-open" : ""}${className ? ` ${className}` : ""}`}>
    <button
      type="button"
      className="term-trigger"
      aria-expanded={open}
      aria-controls={definitionId}
      onClick={() => setOpen(value => !value)}
      onKeyDown={event => { if (event.key === "Escape" && open) { closeOnly(event); setOpen(false); } }}
    >
      {children ?? entry.title}
      <span className="term-mark" aria-hidden="true">?</span>
      <span className="d-sr-only"> (ce înseamnă)</span>
    </button>
    <span id={definitionId} className="term-def" role="note" hidden={!open}>
      <b className="term-def-t">{entry.title}</b>{typeof entry.text === "string" ? <TipText text={entry.text} /> : entry.text}
    </span>
  </span>;
}
