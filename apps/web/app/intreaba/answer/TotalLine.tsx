import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { markChanged } from "../../../components/motion/changed";
import InfoMark from "../../../components/InfoMark";
import { GLOSSARY } from "../../../lib/glossary";
import type { KitTip } from "../builder/kit-types";

/*
 * Component 21, the total line (G8): the answer's total and what changed it,
 * on every answer where an exclusion ("Scoate din calcul"), a selection row
 * (P3b) or the seat phrase changes the total: "Din 1.550.554.366 lei,
 * câștigați de 412 firme · fără SYSTRA · doar firmele cu sediul în alt județ
 * (i)". Its words are a polite live region, read whole, so the new total is
 * heard after a chip or an exclusion; the (i) stays outside it. The caveat
 * that closed the line („valoare înregistrată, nu plăți”) is in the (i)'s box
 * (owner, 17 November 2026: less small print under the answers). The words of
 * the conditions come from describeConditions(spec).totalLine (F1b); it never
 * asks for a second query.
 */

export const RECORDED_VALUE = { text: "valoare înregistrată, nu plăți", tip: { id: "valoare-inregistrata" } } as const satisfies { text: string; tip: KitTip };

/**
 * The one mark after a total (owner, 17 November 2026): „valoare înregistrată, nu plăți” and, on a ranking of firms,
 * „în asociere: cote egale”, which were words on the line, are in its box; `more` adds the answer's own note (the
 * series' „lei ai fiecărui an”).
 */
export function TotalMark({ joint = false, more }: { joint?: boolean; more?: { title: string; text: string } }) {
  const extra = [...(joint ? [{ title: "În asociere: cote egale", text: GLOSSARY["in-asociere"].text }] : []), ...(more ? [more] : [])];
  return <InfoMark title="Valoare înregistrată" label="Valoare înregistrată, nu plăți"
    text={<>Nu plăți. {GLOSSARY["valoare-inregistrata"].text}{extra.map((part) => <Fragment key={part.title}><br /><b>{part.title}.</b> {part.text}</Fragment>)}</>} />;
}

export interface TotalLineProps {
  /** The lead with the total: "Din <span className="qb-num">…</span>, câștigați de 412 firme". */
  children: ReactNode;
  conditions?: readonly string[];
  /** The closing caveat, in the (i): contract amounts are not payments. */
  note?: boolean;
  /** A ranking of firms: the (i) also says that a consortium's value is split equally. */
  joint?: boolean;
}

export default function TotalLine({ children, conditions = [], note = true, joint = false }: TotalLineProps) {
  // One flow of text: a line breaks before a "·", never after it, so the dot goes with its condition.
  const sep = <>{" "}<span className="qb-total-sep" aria-hidden="true">·</span>{" "}</>;
  // The total changed by a filter for the same answer is marked once (M-05); another subject draws a new line.
  const live = useRef<HTMLSpanElement>(null), shown = useRef<string | null>(null);
  useEffect(() => {
    const figure = live.current?.querySelector(".qb-num") ?? null, text = figure?.textContent ?? null;
    if (text !== null && shown.current !== null && text !== shown.current) markChanged(figure);
    if (text !== null) shown.current = text;
  });
  return <p className="qb-total qb-tipwrap">
    <span aria-live="polite" aria-atomic="true" ref={live}>
      {children}
      {conditions.map((condition) => <Fragment key={condition}>{sep}<span className="qb-total-cond">{condition}</span></Fragment>)}
    </span>
    {note && <>{" "}<TotalMark joint={joint} /></>}
  </p>;
}
