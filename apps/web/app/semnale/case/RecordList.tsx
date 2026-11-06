"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import EntityName from "@/components/EntityName";
import { formatCalendarDate, formatInt } from "@/lib/format";

/**
 * A case's acquisitions (a group, a year's December, the records with a partner): code, date, title, sum and the source
 * links, sortable by date, title and sum (owner, 6 November 2026). Past 18, the first 15 show and the rest open on
 * request, in the chosen order.
 */
export interface RecordRow {
  key: string;
  code: string;
  date: string | null;
  title: string;
  href: string;
  /** Null: the sum is not published. */
  value: number | null;
  valueText: string;
  seap: string | null;
  ted: string | null;
  /** The other patterns the same acquisition is in, named. */
  also: string[];
  /** The side the row names (the set-aside acquisitions are with other partners). */
  party: { id: string | null; name: string; role: "authority" | "supplier" } | null;
}

type Key = "date" | "title" | "value";
type Sort = { key: Key; dir: 1 | -1 };

const SHOWN = 15;
/** A sum's first click puts the largest first; a date's, the latest; a title's, A to Z. */
const FIRST: Record<Key, 1 | -1> = { date: -1, title: 1, value: -1 };
const WORD: Record<Key, string> = { date: "dată", title: "titlu", value: "sumă" };

function compare(a: RecordRow, b: RecordRow, { key, dir }: Sort): number {
  if (key === "title") return dir * a.title.localeCompare(b.title, "ro", { sensitivity: "base" });
  const x = key === "date" ? a.date : a.value, y = key === "date" ? b.date : b.value;
  // Missing dates and unpublished sums stay at the end, whichever the direction.
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  return dir * (x < y ? -1 : x > y ? 1 : 0);
}

export default function RecordList({ rows, empty }: { rows: readonly RecordRow[]; empty: string }) {
  // The records come oldest first: that is the order until a column is chosen.
  const [sort, setSort] = useState<Sort>({ key: "date", dir: 1 });
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => [...rows].sort((a, b) => compare(a, b, sort)), [rows, sort]);
  if (!rows.length) return <p className="sgc-none">{empty}</p>;
  const fold = rows.length > SHOWN + 3 && !all;
  const shown = fold ? sorted.slice(0, SHOWN) : sorted;
  const head = (key: Key, label: string) => {
    const on = sort.key === key;
    const next: Sort = on ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: FIRST[key] };
    return (
      <button type="button" className={`sgc-sort${on ? " on" : ""}`} onClick={() => setSort(next)}
        aria-label={`Ordonează după ${WORD[key]}, ${next.dir === 1 ? (key === "title" ? "de la A la Z" : "crescător") : (key === "title" ? "de la Z la A" : "descrescător")}`}>
        {label}
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" className={on ? (sort.dir === 1 ? "up" : "down") : ""}>
          {on ? <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            : <path d="M3 4 5 2 7 4M3 6 5 8 7 6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      </button>
    );
  };
  return <>
    <div className="sgc-rec sgc-rec-h">
      <span className="sgc-code">Cod</span>
      <span className="sgc-date">{head("date", "Data")}</span>
      <span className="sgc-what">{head("title", "Titlu")}</span>
      <span className="sgc-val">{head("value", "Sumă")}</span>
      <span className="sgc-src" />
    </div>
    <ul className="sgc-recs">
      {shown.map((r) => (
        <li key={r.key} className="sgc-rec">
          <span className="sgc-code">{r.code}</span>
          <span className="sgc-date">{r.date ? formatCalendarDate(r.date) : "fără dată"}</span>
          <span className="sgc-what">
            <Link href={r.href} prefetch={false}>{r.title}</Link>
            {r.also.map((c) => <span key={c} className="sgc-also">și la „{c}”</span>)}
            {r.party && <small className="sgc-cp"><EntityName id={r.party.id} role={r.party.role}>{r.party.name}</EntityName></small>}
          </span>
          <span className="sgc-val">{r.valueText}</span>
          <span className="sgc-src">
            {r.seap && <a href={r.seap} target="_blank" rel="noreferrer">SEAP ↗</a>}
            {r.ted && <a href={r.ted} target="_blank" rel="noreferrer">TED ↗</a>}
          </span>
        </li>
      ))}
    </ul>
    {fold && <button type="button" className="sgc-more-btn" onClick={() => setAll(true)}>Arată toate cele {formatInt(rows.length)}</button>}
  </>;
}
