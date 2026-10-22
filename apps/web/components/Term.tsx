"use client";

import { useId, useState, type ReactNode } from "react";
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
export default function Term({ id, children, className }: { id: GlossaryId; children?: ReactNode; className?: string }) {
  const entry = GLOSSARY[id];
  const [open, setOpen] = useState(false);
  const definitionId = useId();
  return <span className={`term${open ? " term-open" : ""}${className ? ` ${className}` : ""}`}>
    <button
      type="button"
      className="term-trigger"
      aria-expanded={open}
      aria-controls={definitionId}
      onClick={() => setOpen(value => !value)}
      onKeyDown={event => { if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); } }}
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
