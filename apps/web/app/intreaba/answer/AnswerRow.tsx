import type { ReactNode, Ref } from "react";
import type { KitLink as Link } from "../builder/kit-types";
import KitLink from "./KitLink";
import RowFacts, { type RowFact } from "./RowFacts";
import RowMenu, { type RowAction } from "./RowMenu";

/*
 * Component 15, a row of the answer: the name (with its place, "din
 * străinătate", "București"), at most three facts (P8), the value with its
 * share and records ("6,5% · 1 înregistrare →"), and the "⋯" menu (P7). On a
 * phone the value goes under the name and "⋯" stays on the right of the name.
 * A row takes focus from the code only (tabIndex -1), so "Arată încă 10" can
 * move focus to the first new row (ListFoot).
 */

export interface AnswerRowProps {
  name: string;
  place?: string;
  facts?: readonly RowFact[];
  /** The value as the answer formats it ("100.011.056 lei"). */
  value: string;
  /** "6,5%" of the total. */
  share?: string;
  records?: Link;
  actions?: readonly RowAction[];
  /** Static state classes for the dev demo frames (on the "⋯" button), and a menu drawn open. */
  menuClassName?: string;
  menuOpen?: boolean;
}

export default function AnswerRow({ name, place, facts = [], value, share, records, actions = [], menuClassName, menuOpen }: AnswerRowProps) {
  return <div className="qb-arow" role="listitem" tabIndex={-1} data-qb-arow="">
    <div>
      <div className="qb-arow-name">{name}{place && <small>{place}</small>}</div>
      <RowFacts facts={facts} />
    </div>
    <div className="qb-arow-val">
      <span className="qb-num">{value}</span>
      {(share || records) && <small>{share}{share && records && " · "}{records && <KitLink link={{ glyph: "→", ...records }} className="qb-rec" />}</small>}
    </div>
    {actions.length > 0 && <RowMenu name={name} actions={actions} {...(menuClassName ? { className: menuClassName } : {})} defaultOpen={!!menuOpen} />}
  </div>;
}

/** The rows of an answer, as a list; `listRef` lets ListFoot focus the first new row. */
export function AnswerList({ label, listRef, describedBy, children }: { label: string; listRef?: Ref<HTMLDivElement>; describedBy?: string; children: ReactNode }) {
  return <div ref={listRef} className="qb-alist" role="list" aria-label={label} {...(describedBy ? { "aria-describedby": describedBy } : {})}>{children}</div>;
}
