import { Fragment, type ReactNode } from "react";
import HelpTip from "../builder/HelpTip";
import type { KitTip } from "../builder/kit-types";

/*
 * Component 21, the total line (G8): the answer's total and what changed it,
 * on every answer where an exclusion ("Scoate din calcul"), a selection row
 * (P3b) or the seat phrase changes the total: "Din 1.550.554.366 lei,
 * câștigați de 412 firme · fără SYSTRA · doar firmele cu sediul în alt județ
 * · valoare înregistrată, nu plăți (?)". Its words are a polite live region,
 * read whole, so the new total is heard after a chip or an exclusion; the
 * (?) stays outside it, or its definition would be read with every total. The
 * words of the conditions come from describeConditions(spec).totalLine (F1b);
 * it never asks for a second query.
 */

export const RECORDED_VALUE = { text: "valoare înregistrată, nu plăți", tip: { id: "valoare-inregistrata" } } as const satisfies { text: string; tip: KitTip };

export interface TotalLineProps {
  /** The lead with the total: "Din <span className="qb-num">…</span>, câștigați de 412 firme". */
  children: ReactNode;
  conditions?: readonly string[];
  /** The closing caveat; contract amounts are not payments. */
  note?: { text: string; tip?: KitTip } | false;
}

export default function TotalLine({ children, conditions = [], note = RECORDED_VALUE }: TotalLineProps) {
  // One flow of text: a line breaks before a "·", never after it, so the dot goes with its condition.
  const sep = <>{" "}<span className="qb-total-sep" aria-hidden="true">·</span>{" "}</>;
  // The (?) stays on the line of the note's last two words ("nu plăți (?)"): both in one unbreakable
  // span after the live words, which say those two words for screen readers, so the caveat is announced too.
  const split = note ? /^(.*?)(\S+\s+\S+|\S+)$/s.exec(note.text) : null;
  const last = split?.[2] ?? (note ? note.text : "");
  const tip = note && note.tip ? note.tip : null;
  return <p className="qb-total qb-tipwrap">
    <span aria-live="polite" aria-atomic="true">
      {children}
      {conditions.map(condition => <Fragment key={condition}>{sep}<span className="qb-total-cond">{condition}</span></Fragment>)}
      {note && <>{sep}{split?.[1]}<span className={tip ? "qb-sr" : "qb-nowrap"}>{last}</span></>}
    </span>
    {tip && <span className="qb-nowrap"><span aria-hidden="true">{last}</span> <HelpTip tip={tip} /></span>}
  </p>;
}
