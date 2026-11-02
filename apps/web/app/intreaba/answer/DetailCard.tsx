"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { KitLink as Link } from "../builder/kit-types";
import KitLink from "./KitLink";
import { FactTag, type RowFact } from "./RowFacts";

/*
 * Component 19, the card: what was picked in the answer (a point of the
 * scatter, a county of the map, a bar of the series, place 1 of "Cine
 * conduce?"), with its facts and links. A mint surface with a soft green
 * border, like its picked row (green = picked, kit §5.37; no side stripe
 * since 1 November 2026), never a solid green fill. A named region:
 * on opening, focus moves to its title; Escape or × closes it and focus goes
 * back to what opened it (the point or the row), or to `returnTo`.
 */

export interface CardFact { label: string; value: string }

export interface CardLine {
  tag?: RowFact;
  text?: string;
  /** "9 înregistrări →" on the right of its line. */
  records?: Link;
}

export interface DetailCardProps {
  title: string;
  /** "Primărie de comună · locul 20 din 82, după semnale". */
  meta?: string;
  facts?: readonly CardFact[];
  lines?: readonly CardLine[];
  /** The buttons, by R8: "Vezi cele 9 cu semnalul →", "Unde se situează? ›", "Fișa instituției ↗". */
  actions?: readonly Link[];
  onClose?: () => void;
  /** Where focus goes on closing; the element focused before opening otherwise. */
  returnTo?: HTMLElement | null;
  /** Take focus on opening (off for frames drawn open in the dev demo). */
  autoFocus?: boolean;
  level?: 3 | 4;
  children?: ReactNode;
}

/** Whether focus should go back on closing: it was inside the card, or nowhere (the card is gone). */
export function shouldReturnFocus(active: Element | null, card: Element | null, body: Element | null): boolean {
  return !active || active === body || !!card?.contains(active);
}

export default function DetailCard({ title, meta, facts = [], lines = [], actions = [], onClose, returnTo, autoFocus = true, level = 4, children }: DetailCardProps) {
  const card = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const back = useRef<HTMLElement | null>(null), returnRef = useRef(returnTo);
  returnRef.current = returnTo;
  useEffect(() => {
    if (!autoFocus) return;
    back.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    heading.current?.focus();
    const node = card.current;
    return () => {
      const target = returnRef.current ?? back.current;
      if (target?.isConnected && shouldReturnFocus(document.activeElement, node, document.body)) target.focus();
    };
  }, [autoFocus]);
  const Title = level === 3 ? "h3" : "h4";
  return <section
    ref={card}
    className="qb-card"
    aria-label={title}
    onKeyDown={event => { if (event.key === "Escape" && onClose) { event.preventDefault(); event.stopPropagation(); onClose(); } }}
  >
    <div className="qb-card-head">
      <Title ref={heading} tabIndex={-1}>{title}</Title>
      {onClose && <button type="button" className="qb-close" aria-label="Închide fișa" onClick={onClose}>×</button>}
    </div>
    {meta && <p className="qb-card-meta">{meta}</p>}
    {facts.length > 0 && <div className="qb-card-facts">{facts.map(fact => <span key={fact.label}>{fact.label} <span className="qb-num">{fact.value}</span></span>)}</div>}
    {lines.length > 0 && <ul className="qb-card-lines">{lines.map((line, index) => <li key={index}>
      <span>{line.tag && <FactTag fact={line.tag} />}{line.text}</span>
      {line.records && <KitLink link={{ glyph: "→", ...line.records }} className="qb-rec" />}
    </li>)}</ul>}
    {children}
    {actions.length > 0 && <div className="qb-actions">{actions.map(action => <KitLink key={action.label} link={action} className="qb-secondary" />)}</div>}
  </section>;
}
