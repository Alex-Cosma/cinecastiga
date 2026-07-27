"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatRonFull, formatInt, cleanName } from "@/lib/format";
import { FLAG_META } from "@/lib/flags";
import { daUrl } from "@/lib/elicitatie";
import type { DaTx } from "@/lib/marts";

/**
 * The entity page's transaction table, redesigned to the drill-table standard:
 * 10 rows/page, sortable columns (▾/▴), year + flag filters that fetch in
 * place (no page reload), an explicit active-filter banner, and a SEAP source
 * link per row. Lands at #achizitii from the flag cards' "vezi achizițiile".
 */

interface Resp {
  ok: boolean;
  rows?: DaTx[];
  total?: number;
  years?: string[];
  error?: string;
}

const SORTS: { key: "date" | "value" | "gap"; label: string; num?: boolean }[] = [
  { key: "date", label: "Data" },
  { key: "value", label: "Închidere", num: true },
  { key: "gap", label: "Interval" },
];

function gapLabel(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} zile`;
}

export default function TxTable({
  entityId,
  role,
  isAuth,
  flags,
  initialFlag,
}: {
  entityId: string;
  role: "furnizor" | "autoritate";
  isAuth: boolean;
  flags: string[];
  initialFlag?: string | undefined;
}) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"value" | "date" | "gap">("value");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [years, setYears] = useState<string[]>([]);
  const [yearsOpen, setYearsOpen] = useState(false);
  const [flag, setFlag] = useState<string | null>(initialFlag ?? null);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ id: entityId, rol: role, page: String(page), sort, dir });
    if (years.length > 0) p.set("an", years.join(","));
    if (flag) p.set("sem", flag);
    try {
      const r = await fetch(`/api/entity-tx?${p.toString()}`);
      setData((await r.json()) as Resp);
    } catch (e) {
      setData({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  }, [entityId, role, page, sort, dir, years, flag]);
  useEffect(() => {
    void load();
  }, [load]);

  const sortBy = (key: "value" | "date" | "gap") => {
    if (sort === key) setDir(dir === "desc" ? "asc" : "desc");
    else {
      setSort(key);
      setDir(key === "gap" ? "asc" : "desc");
    }
    setPage(1);
  };
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 10));
  const allYears = data?.years ?? [];
  const toggleYear = (y: string) => {
    setYears(years.includes(y) ? years.filter((x) => x !== y) : [...years, y]);
    setPage(1);
  };

  return (
    <div>
      <div className="txf">
        {/* years scale unbounded (a new one every January) → multi-select dropdown */}
        <div className="txf-dd">
          <button type="button" className={years.length > 0 ? "on" : ""} onClick={() => setYearsOpen(!yearsOpen)}>
            an: {years.length > 0 ? [...years].sort().join(", ") : "toți"} ▾
          </button>
          {yearsOpen && (
            <div className="txf-panel" onMouseLeave={() => setYearsOpen(false)}>
              <label>
                <input
                  type="checkbox"
                  checked={years.length === 0}
                  onChange={() => { setYears([]); setPage(1); }}
                />
                toți anii
              </label>
              {allYears.map((y) => (
                <label key={y}>
                  <input type="checkbox" checked={years.includes(y)} onChange={() => toggleYear(y)} />
                  {y}
                </label>
              ))}
            </div>
          )}
        </div>
        {flags.length > 0 && <span className="txf-lab">semnal:</span>}
        {flags.map((f) => (
          <button
            key={f}
            type="button"
            className={flag === f ? "on" : ""}
            title={FLAG_META[f]?.short}
            onClick={() => { setFlag(flag === f ? null : f); setPage(1); }}
          >
            {FLAG_META[f]?.title ?? f}
          </button>
        ))}
      </div>
      {(flag || years.length > 0) && (
        <div className="txf-active">
          Filtrat:
          {years.length > 0 && <> {years.length === 1 ? "anul" : "anii"} <b>{[...years].sort().join(", ")}</b></>}
          {flag && <> semnalul <b>„{FLAG_META[flag]?.title ?? flag}”</b></>}
          {" · "}
          <button type="button" onClick={() => { setFlag(null); setYears([]); setPage(1); }}>
            ✕ scoate filtrele
          </button>
        </div>
      )}
      <p className="hint">
        {formatInt(total)} achiziții · pagina {page} din {formatInt(pages)} · fiecare rând trimite
        la pagina oficială e-licitatie.ro.
        {loading && data && <span className="tx-upd"> se actualizează…</span>}
      </p>
      <div className="tx-scroll">
        {/* stale-while-revalidate: old rows stay (dimmed) during fetch — the
            table never collapses, so content below never jumps */}
        <table className={`rank tx-table${loading && data ? " tx-loading" : ""}`}>
          <thead>
            <tr>
              <th className="sortable" onClick={() => sortBy("date")} title="sortează">
                Data{sort === "date" ? (dir === "desc" ? " ▾" : " ▴") : ""}
              </th>
              <th>{isAuth ? "Furnizor" : "Autoritate"}</th>
              <th>Obiect (CPV)</th>
              <th className="sortable" style={{ textAlign: "right" }} onClick={() => sortBy("value")} title="sortează">
                Închidere{sort === "value" ? (dir === "desc" ? " ▾" : " ▴") : ""}
              </th>
              <th className="sortable" onClick={() => sortBy("gap")} title="publicare → finalizare">
                Interval{sort === "gap" ? (dir === "desc" ? " ▾" : " ▴") : ""}
              </th>
              <th>Semnale</th>
              <th>Sursă</th>
            </tr>
          </thead>
          <tbody>
            {!data &&
              loading &&
              Array.from({ length: 10 }, (_, i) => (
                <tr key={`ghost-${i}`} className="tx-ghost">
                  {Array.from({ length: 7 }, (_, j) => (
                    <td key={j}>
                      <span className="gh" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && data?.ok === false && (
              <tr>
                <td colSpan={7} className="county">
                  {data.error}
                </td>
              </tr>
            )}
            {data?.rows?.map((t) => (
                <tr key={t.sicapDaId}>
                  <td className="county">{t.finalizationDate ?? "—"}</td>
                  <td>
                    {t.partnerId ? (
                      <Link href={`/entitati/${t.partnerId}`}>{cleanName(t.partnerName)}</Link>
                    ) : (
                      (t.partnerName ?? "—")
                    )}
                  </td>
                  <td className="county">{t.cpvName ?? t.cpvCode ?? "—"}</td>
                  <td className="num">{formatRonFull(t.closingValue)}</td>
                  <td className="county">{gapLabel(t.gapMinutes)}</td>
                  <td>
                    {t.daFlags.map((f) => (
                      <span className="flag-badge sm" key={f} title={FLAG_META[f]?.short}>
                        {FLAG_META[f]?.title ?? f}
                      </span>
                    ))}
                  </td>
                  <td>
                    <a href={daUrl(t.sicapDaId)} target="_blank" rel="noopener noreferrer">
                      {t.daCode ?? "vezi"} ↗
                    </a>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Anterior
          </button>
          <span className="note">
            Pagina {page} din {formatInt(pages)}
          </span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Următor →
          </button>
        </div>
      )}
    </div>
  );
}
