"use client";

import type { ReactNode } from "react";
import Term from "./Term";

/**
 * A small "i" in place of a line of fine print (owner, 17 November 2026: sentences under charts and lists crowd the
 * page). The text opens from it on hover, focus or a tap, as a floating explanation (Term's `tip`): what a figure
 * counts, a caveat, a method note. The dot of the "i" hops once while it is pointed at or open (guide.css).
 *
 *   <InfoMark title="De știut" text="Un UAT fără primărie identificată nu are cifră: nu înseamnă zero lei." />
 *
 * Not for text the reader needs in order to act (an empty state, an error, a form hint) or for a chart's legend:
 * those stay on the page. As with a Term, never inside a link or another button.
 */
export default function InfoMark({ title, text, label, className }: {
  /** The bold first words of the explanation. */
  title: string;
  text: ReactNode;
  /** The mark's name for a screen reader (default: the title). */
  label?: string;
  className?: string;
}) {
  return <Term tip title={title} text={text} className={`info-mark${className ? ` ${className}` : ""}`}>
    <svg className="info-mark-i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" /><path d="M12 11.5v5" /><path className="info-mark-dot" d="M12 7.8h.01" strokeWidth="2.4" /></svg>
    <span className="d-sr-only">{label ?? title}</span>
  </Term>;
}
