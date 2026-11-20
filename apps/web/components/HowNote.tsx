import type { ReactNode } from "react";
import Term from "./Term";
import "./how-note.css";

/**
 * A method note as quiet dotted words before the page's end, whose explanation floats over the page instead of a fold
 * that opens in it and pushes it down (owner, 20 November 2026, after „Cum am calculat” and „Ce includ cifrele” of
 * 19 November). The words are the box's title. The text is spans (the box is a span): `how-n` for a paragraph,
 * `tip-li` for a point (guide.css). Links inside it work: the box stays while the mouse is on it.
 */
export default function HowNote({ title, children, only, className }: {
  title: string; children: ReactNode; only?: "complet"; className?: string;
}) {
  return <p className={`how-note${className ? ` ${className}` : ""}`} data-only={only}>
    <Term tip hold="line" title={title} text={children}>{title}</Term>
  </p>;
}
