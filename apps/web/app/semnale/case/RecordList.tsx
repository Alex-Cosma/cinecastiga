"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import EntityName from "@/components/EntityName";
import { formatCalendarDate, formatInt } from "@/lib/format";
import { compareRecordRows, RECORD_DEFAULT_SORT, RECORDS_SHOWN, type RecordRow, type RecordSort, type RecordSortKey } from "@/lib/record-rows";

export type { RecordRow } from "@/lib/record-rows";

/**
 * A case's acquisitions (a group, a year's December, the records with a partner): code, date, title, sum and the source
 * links, sortable by date, title and sum (owner, 6 November 2026). Past 18, the first 15 show and the rest open on
 * request, in the chosen order. A long list (`source`) arrives as its first rows only; its orders and further rows come
 * from the server, 50 at a time (owner, 12 November 2026).
 */
const FIRST: Record<RecordSortKey, 1 | -1> = { date: -1, title: 1, value: -1 };
const WORD: Record<RecordSortKey, string> = { date: "dată", title: "titlu", value: "sumă" };

type Paged = { rows: RecordRow[]; total: number; page: number; pages: number };

export default function RecordList({ rows, empty, total, source }: {
  rows: readonly RecordRow[]; empty: string;
  /** A server-paged list: all its rows, and the address of its pages (without the order and page). */
  total?: number; source?: string;
}) {
  const [sort, setSort] = useState<RecordSort>(RECORD_DEFAULT_SORT);
  const [all, setAll] = useState(false);
  const server = !!source && (total ?? rows.length) > rows.length;
  const [paged, setPaged] = useState<Paged | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const sorted = useMemo(() => [...rows].sort((a, b) => compareRecordRows(a, b, sort)), [rows, sort]);
  if (!rows.length) return <p className="sgc-none">{empty}</p>;

  async function load(next: RecordSort, page: number) {
    setBusy(true); setError("");
    try {
      const r = await fetch(`${source}&ordine=${next.key}&sens=${next.dir}&pagina=${page}`, { cache: "no-store" });
      const body = await r.json() as Paged & { error?: string };
      if (!r.ok) throw new Error(body.error ?? "Nu am putut citi înregistrările. Încearcă din nou.");
      setSort(next);
      setPaged((prev) => page > 0 && prev ? { ...body, rows: [...prev.rows, ...body.rows] } : body);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const count = server ? total! : rows.length;
  const fold = !server && rows.length > RECORDS_SHOWN + 3 && !all;
  const shown = server ? (paged?.rows ?? rows) : fold ? sorted.slice(0, RECORDS_SHOWN) : sorted;
  const head = (key: RecordSortKey, label: string) => {
    const on = sort.key === key;
    const next: RecordSort = on ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: FIRST[key] };
    return (
      <button type="button" className={`sgc-sort${on ? " on" : ""}`} disabled={busy} onClick={() => server ? void load(next, 0) : setSort(next)}
        aria-label={`Ordonează după ${WORD[key]}, ${next.dir === 1 ? (key === "title" ? "de la A la Z" : "crescător") : (key === "title" ? "de la Z la A" : "descrescător")}`}>
        {label}
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" className={on ? (sort.dir === 1 ? "up" : "down") : ""}>
          {on ? <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            : <path d="M3 4 5 2 7 4M3 6 5 8 7 6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      </button>
    );
  };
  const more = server && shown.length < count;
  return <>
    <div className="sgc-rec sgc-rec-h" aria-busy={busy}>
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
    {error && <p className="sgc-none" role="alert">{error}</p>}
    {fold && <button type="button" className="sgc-more-btn" onClick={() => setAll(true)}>Arată toate cele {formatInt(rows.length)}</button>}
    {more && <button type="button" className="sgc-more-btn" disabled={busy} onClick={() => void load(sort, paged ? paged.page + 1 : 0)}>
      {busy ? "Se încarcă…" : `Arată mai multe · ${formatInt(shown.length)} din ${formatInt(count)}`}
    </button>}
  </>;
}
