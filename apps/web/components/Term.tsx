"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { GLOSSARY, type GlossaryId } from "../lib/glossary";

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
type TermProps = { children?: ReactNode; className?: string; tip?: boolean } & (
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

/** The gap between a floating definition and its anchor (guide.css `calc(100% + 6px)`). */
const TIP_GAP = 6;

/**
 * Whether a floating definition opened above its anchor would pass the top
 * of what the reader sees (the screen, or the sticky header's bottom): it
 * opens below then (S4t-tip-above, „Ponderile” at 320 px after a click had
 * scrolled the strip to the top).
 */
export function tipOpensBelow(anchorTop: number, height: number, ceiling: number): boolean {
  return height > 0 && anchorTop - TIP_GAP - height < Math.max(0, ceiling);
}

export default function Term({ children, className, tip = false, ...source }: TermProps) {
  const entry = source.id !== undefined ? GLOSSARY[source.id] : { title: source.title, text: source.text };
  const [open, setOpen] = useState(false);
  const [below, setBelow] = useState(false);
  const definition = useRef<HTMLSpanElement>(null);
  const definitionId = useId();
  // Measured once it shows (hover, focus or tap): its anchor's top against the screen's and the header's.
  const place = () => requestAnimationFrame(() => {
    const def = definition.current, anchor = def?.offsetParent?.getBoundingClientRect();
    if (!def || !anchor || !def.offsetHeight) return;
    const header = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
    setBelow(tipOpensBelow(anchor.top, def.offsetHeight, header));
  });
  // The explanation floats on hover, focus or tap instead of opening in the
  // page flow, for tight spots (home map, number strip) where an in-flow
  // definition would push the layout. The nearest positioned ancestor anchors it.
  if (tip) return <span className={`term term-tip${children ? " term-tip-text" : ""}${open ? " term-open" : ""}${below ? " term-below" : ""}${className ? ` ${className}` : ""}`}
    onMouseEnter={place} onFocus={place}>
    <button
      type="button"
      className="term-trigger"
      aria-expanded={open}
      aria-describedby={definitionId}
      aria-label={children ? undefined : `${entry.title}: ce înseamnă`}
      onClick={() => { setOpen(value => !value); place(); }}
      onBlur={() => setOpen(false)}
      onKeyDown={event => { if (event.key === "Escape" && open) { closeOnly(event); setOpen(false); } }}
    >
      {children}
      <span className="term-mark" aria-hidden="true">?</span>
    </button>
    {/* Out of the tab order: shown on focus, its scrollable box would otherwise take a second stop (critique 2 November 2026). */}
    <span id={definitionId} ref={definition} className="term-def" role="tooltip" tabIndex={-1}>
      <b>{entry.title}.</b> {entry.text}
    </span>
  </span>;
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
      <b>{entry.title}.</b> {entry.text}
    </span>
  </span>;
}
