import type { ReactNode } from "react";
import HelpTip from "../builder/HelpTip";
import type { KitTip } from "../builder/kit-types";

/*
 * Component 21, the total line (G8): the answer's total and what changed it,
 * on every answer where an exclusion ("Scoate din calcul"), a selection row
 * (P3b) or the seat phrase changes the total: "Din 1.550.554.366 lei,
 * câștigați de 412 firme · fără SYSTRA · doar firmele cu sediul în alt județ
 * · valoare înregistrată, nu plăți (?)". It is a polite live region, read
 * whole, so the new total is heard after a chip or an exclusion. The words of
 * the conditions come from describeConditions(spec).totalLine (F1b); it never
 * asks for a second query.
 */

export const RECORDED_VALUE = { text: "valoare înregistrată, nu plăți", tip: { id: "valoare-inregistrata" } } as const satisfies { text: string; tip: KitTip };

export interface TotalLineProps {
  /** The lead with the total: "Din <span className="fk-num">…</span>, câștigați de 412 firme". */
  children: ReactNode;
  conditions?: readonly string[];
  /** The closing caveat; contract amounts are not payments. */
  note?: { text: string; tip?: KitTip } | false;
}

export default function TotalLine({ children, conditions = [], note = RECORDED_VALUE }: TotalLineProps) {
  const sep = <span className="fk-total-sep" aria-hidden="true">·</span>;
  // The (?) stays on the line of the note's last two words ("nu plăți (?)").
  const split = note ? /^(.*?)(\S+\s+\S+|\S+)$/s.exec(note.text) : null;
  return <p className="fk-total fk-tipwrap" aria-live="polite" aria-atomic="true">
    <span>{children}</span>
    {conditions.map(condition => <span className="fk-total-part" key={condition}>{sep}<span className="fk-total-cond">{condition}</span></span>)}
    {note && <span className="fk-total-part">{sep}<span>{split?.[1]}<span className="fk-nowrap">{split?.[2] ?? note.text}{note.tip && <> <HelpTip tip={note.tip} /></>}</span></span></span>}
  </p>;
}
