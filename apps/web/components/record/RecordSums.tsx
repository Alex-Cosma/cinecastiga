import type { ReactNode } from "react";

/*
 * The sums of one record in the order they happen, each with what it covers (UX audit Z7-09, owner 16 November 2026):
 * the TED estimate, the offers, the notice's awarded value, this record's own figure (the head's), and for a framework
 * its call-offs as declared and as the totals count them. Exact values; the head's figure is the bold row.
 */

export interface SumRow {
  key: string;
  label: ReactNode;
  /** What the figure covers, one short line. */
  scope?: ReactNode;
  value: ReactNode;
  /** One more short line under the value (a multiple of the ceiling), in the amber ink when `warn`. */
  aside?: ReactNode;
  warn?: boolean;
  /** The head's own figure. */
  main?: boolean;
}

export default function RecordSums({ title, rows, note }: { title: string; rows: SumRow[]; note?: ReactNode }) {
  return <div className="record-sums">
    <h3>{title}</h3>
    <ol>
      {rows.map((r) => <li key={r.key} className={r.main ? "is-main" : undefined}>
        <span className="record-sum-label">{r.label}</span>
        {r.scope && <span className="record-sum-scope">{r.scope}</span>}
        <span className="record-sum-value">{r.value}{r.aside && <small className={r.warn ? "is-warn" : undefined}>{r.aside}</small>}</span>
      </li>)}
    </ol>
    {note && <p className="record-sums-note">{note}</p>}
  </div>;
}
