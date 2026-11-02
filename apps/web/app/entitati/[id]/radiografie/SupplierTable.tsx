"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { DepPage, DepRow, DepSort } from "@/lib/radiografie";
import { shortName } from "@/lib/radiografie-fmt";
import { formatInt, formatRon } from "@/lib/format";
import { useEntityTable } from "../useEntityTable";
import { recordWords, sharePct } from "./supplier-words";

/**
 * The relation table under the chart (owner, 2 November 2026, mockup B „Față în față”): every supplier of the
 * authority, contracts and direct acquisitions, paged from the server and sorted on any column. The two shares
 * face each other around one line: on the left how much the supplier weighs for the authority, on the right how
 * much the authority weighs for the firm. A row selects its supplier in the chart; its name opens the firm's page.
 */
interface Resp extends Partial<DepPage> { ok: boolean; error?: string }

const LABEL: Record<DepSort, string> = { value: "valoare", here: "ponderea în autoritate", life: "ponderea în portofoliul firmei", recs: "înregistrări", name: "nume" };
const PILL: Record<DepSort, string> = { value: "Valoare", here: "Din autoritate", life: "În portofoliul firmei", recs: "Înregistrări", name: "Furnizor" };

function Chevron() {
  return <svg className="rv-sortmark" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Duel({ row }: { row: DepRow }) {
  return <span className="rv-duel">
    <span className="l"><b>{sharePct(row.shareHere)}</b><i style={{ width: `${Math.max(row.shareHere * 100, 0.8)}%` }} /></span>
    <span className="axis" aria-hidden="true" />
    <span className="rr"><i style={{ width: `${Math.max(row.shareLife * 100, 0.8)}%` }} /><b>{sharePct(row.shareLife)}</b></span>
  </span>;
}

export default function SupplierTable({ authorityId, suppliers, maxValue, selectedId, onSelect }: {
  authorityId: string;
  /** every supplier of the authority */
  suppliers: number;
  /** the largest supplier's value: the value bars' common scale across pages */
  maxValue: number;
  selectedId: string | undefined;
  onSelect: (row: DepRow) => void;
}) {
  const [sort, setSort] = useState<DepSort>("value");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  // The search asks the server once the typing pauses.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(typed.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [typed]);
  const params = new URLSearchParams({ id: authorityId, sort, dir, page: String(page) });
  if (search) params.set("q", search);
  const { data, loading, error, retry } = useEntityTable<Resp>(`/api/radiografie/furnizori?${params.toString()}`);
  const rows = data?.rows ?? [];
  const total = data?.total ?? suppliers;
  const pages = Math.max(1, Math.ceil(total / 10));
  const stale = loading && rows.length > 0;
  const sortBy = (key: DepSort) => {
    if (sort === key) setDir(dir === "desc" ? "asc" : "desc");
    else { setSort(key); setDir(key === "name" ? "asc" : "desc"); }
    setPage(1);
  };
  const ariaSort = (key: DepSort) => (sort === key ? (dir === "asc" ? "ascending" : "descending") : "none");
  const head = (key: DepSort, label: string) => (
    <button type="button" className="rv-th" data-on={sort === key || undefined} data-dir={sort === key ? dir : undefined} onClick={() => sortBy(key)}>{label}<Chevron /></button>
  );
  const go = (n: number) => { if (!loading && n >= 1 && n <= pages) setPage(n); };

  return (
    <div className="rv-ranking">
      <h2>Toți furnizorii</h2>
      <div className="rv-rank-top">
        <label className="rv-search">
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="m10.5 10.5 3.3 3.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          <input type="search" value={typed} placeholder="Caută furnizorul…" aria-label="Caută furnizorul" onChange={(e) => setTyped(e.target.value)} />
        </label>
        <p className="rv-rank-count" role="status">
          {loading && !rows.length ? "Se încarcă furnizorii…" : <><b>{search ? `${formatInt(total)} din ${formatInt(suppliers)}` : formatInt(suppliers)} {suppliers === 1 ? "furnizor" : "furnizori"}</b> · după {LABEL[sort]} {dir === "desc" ? "↓" : "↑"}</>}
        </p>
        <p className="rv-legend" aria-hidden="true"><span><i className="rv-sw-ct" />contracte prin proceduri</span><span><i className="rv-sw-da" />achiziții directe</span></p>
      </div>
      {/* On a phone the columns' order comes from these buttons. */}
      <div className="rv-sortpills" role="group" aria-label="Ordonează furnizorii">
        {(["value", "here", "life", "recs", "name"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={sort === k} onClick={() => sortBy(k)}>{PILL[k]}{sort === k ? (dir === "desc" ? " ↓" : " ↑") : ""}</button>
        ))}
      </div>
      <div className="rv-rank-wrap" aria-busy={loading}>
        <table className={`rv-rank${stale ? " is-stale" : ""}`} aria-label="Furnizorii autorității">
          <thead>
            <tr>
              <th scope="col" className="c-name" aria-sort={ariaSort("name")}>{head("name", "Furnizor")}</th>
              {/* one column, two sorts: the header reports whichever of the two orders the rows */}
              <th scope="col" className="c-duel" aria-sort={sort === "here" || sort === "life" ? ariaSort(sort) : "none"}>
                <span className="rv-duelhead">
                  <span>{head("here", "← Din autoritate")}</span>
                  <span className="axis" aria-hidden="true" />
                  <span>{head("life", "În portofoliul firmei →")}</span>
                </span>
              </th>
              <th scope="col" className="c-val" aria-sort={ariaSort("value")}>{head("value", "Valoare")}</th>
              <th scope="col" className="c-recs" aria-sort={ariaSort("recs")}>{head("recs", "Înregistrări")}</th>
            </tr>
          </thead>
          <tbody inert={stale || undefined}>
            {loading && !rows.length && Array.from({ length: 10 }, (_, i) => <tr key={i} className="rv-ghost" aria-hidden="true"><td colSpan={4}><span /></td></tr>)}
            {error && <tr><td colSpan={4} className="rv-rank-empty"><span>{error}</span> <button type="button" onClick={retry}>Reîncearcă</button></td></tr>}
            {!loading && !error && rows.length === 0 && (
              <tr><td colSpan={4} className="rv-rank-empty"><span>{search ? `Niciun furnizor cu „${search}”.` : "Niciun furnizor."}</span>{search && <button type="button" onClick={() => setTyped("")}>Șterge căutarea</button>}</td></tr>
            )}
            {!error && rows.map((r) => (
              <tr key={r.id} aria-selected={selectedId === r.id} onClick={() => onSelect(r)}>
                <td className="c-name"><Link href={`/entitati/${r.id}`} onClick={(e) => e.stopPropagation()}>{shortName(r.name)}</Link></td>
                <td className="c-duel">
                  <button type="button" className="rv-pick" aria-label={`Arată în grafic: ${shortName(r.name)}, ${sharePct(r.shareHere)} din autoritate, ${sharePct(r.shareLife)} din portofoliul firmei`}
                    onClick={(e) => { e.stopPropagation(); onSelect(r); }}><Duel row={r} /></button>
                </td>
                <td className="c-val">
                  <span className="v">{formatRon(r.all)}</span>
                  <span className="rv-stack" style={{ width: `${Math.max(4, maxValue > 0 ? (r.all / maxValue) * 100 : 0)}%` }} title={`${formatRon(r.here)} din contracte · ${formatRon(r.daHere)} din achiziții directe`}>
                    <i style={{ flexGrow: r.here }} /><i style={{ flexGrow: r.daHere }} />
                  </span>
                </td>
                <td className="c-recs"><span className="v">{formatInt(r.n + r.nDa)}</span><span className="sub">{recordWords(r)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="rv-pager" aria-label="Paginarea furnizorilor">
          <button type="button" aria-disabled={loading || page <= 1} onClick={() => go(page - 1)}>‹ anterioare</button>
          <span>pagina {formatInt(page)} din {formatInt(pages)}</span>
          <button type="button" aria-disabled={loading || page >= pages} onClick={() => go(page + 1)}>următoare ›</button>
        </nav>
      )}
    </div>
  );
}
