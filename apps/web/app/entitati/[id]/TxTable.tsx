"use client";

import { useState } from "react";
import Link from "next/link";
import { formatRonFull, formatInt, formatCalendarDate, cleanName } from "@/lib/format";
import { FLAG_META } from "@/lib/flags";
import { daUrl, awardUrl } from "@/lib/elicitatie";
import { useTip } from "../../intreaba/blocks";
import type { DaTx } from "@/lib/marts";
import { useEntityTable } from "./useEntityTable";

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
  const [src, setSrc] = useState<"all" | "da" | "contracts">("all");
  const [excluded, setExcluded] = useState(false);
  const tip = useTip();
  const p = new URLSearchParams({ id: entityId, rol: role, page: String(page), sort, dir });
  if (excluded) p.set("excluse", "1");
  if (years.length > 0) p.set("an", years.join(","));
  if (flag) p.set("sem", flag);
  if (src !== "all") p.set("tip", src);
  const { data, loading, error, retry } = useEntityTable<Resp>(`/api/entity-tx?${p.toString()}`);

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

  const showTip = src === "all";
  const nCols = showTip ? 8 : 7;
  return (
    <div>
      {tip.el}
      {/* channel toggle — same control as the search drill's stream toggle */}
      <div className="ask-streamtoggle">
        {(
          [
            ["all", "toate sursele"],
            ["da", "achiziții directe"],
            ["contracts", "contracte"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            className={src === k ? "on" : ""}
            onClick={() => { setSrc(k); setExcluded(false); if (k === "contracts") setFlag(null); setPage(1); }}
          >
            {l}
          </button>
        ))}
      </div>
      <label className="data-exclusion-toggle"><input type="checkbox" checked={excluded} onChange={e => { setExcluded(e.target.checked); setFlag(null); setSrc("da"); setPage(1); }} /> Arată achizițiile directe excluse din total</label>
      {excluded && <p className="note">Valori nule, nepozitive sau peste 2 milioane lei. Înregistrările rămân verificabile, dar nu sunt adăugate totalului afișat.</p>}
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
            onClick={() => {
              const next = flag === f ? null : f;
              setFlag(next);
              // flags mark DA rows only — selecting one narrows to that channel
              if (next) { setSrc("da"); setExcluded(false); }
              setPage(1);
            }}
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
      <div className="ask-detmeta" role="status">
        {loading ? "Se încarcă înregistrările…" : error ? "Înregistrările nu au putut fi încărcate." : <>{formatInt(total)} înregistrări{src === "all" ? " (ambele canale)" : ""} · pagina {page} din {formatInt(pages)}</>}
      </div>
      <div className="ask-tablewrap" aria-busy={loading}>
        <table className="ask-table ask-drill">
          <thead>
            <tr>
              <th className="col-date sortable" onClick={() => sortBy("date")} title="sortează">
                Data{sort === "date" ? (dir === "desc" ? " ▾" : " ▴") : ""}
              </th>
              {showTip && <th className="col-src">Tip</th>}
              <th>{isAuth ? "Furnizor" : "Autoritate"}</th>
              <th className="col-cpv">Obiect (CPV)</th>
              <th
                className="col-value num sortable"
                onClick={() => sortBy("value")}
                title="sortează"
              >
                Închidere{sort === "value" ? (dir === "desc" ? " ▾" : " ▴") : ""}
              </th>
              <th
                className="col-gap sortable"
                onClick={() => sortBy("gap")}
                title="publicare → finalizare"
              >
                Interval{sort === "gap" ? (dir === "desc" ? " ▾" : " ▴") : ""}
              </th>
              <th className="col-flags">Semnale</th>
              <th className="col-links">Sursă</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 10 }, (_, i) => (
                <tr key={`ghost-${i}`} className="tx-ghost">
                  {Array.from({ length: nCols }, (_, j) => (
                    <td key={j}>
                      <span className="gh" />
                    </td>
                  ))}
                </tr>
              ))}
            {error && (
              <tr>
                <td colSpan={nCols} className="county">
                  {error} <button type="button" onClick={retry}>Reîncearcă</button>
                </td>
              </tr>
            )}
            {!loading && !error && !data?.rows?.length && <tr><td colSpan={nCols} className="county">Nicio înregistrare pentru filtrele alese.</td></tr>}
            {!loading && data?.rows?.map((t, i) => (
              // consortium contracts come as one row per member with the same contract id
              <tr key={`${t.src}-${t.sicapDaId}-${t.partnerId ?? i}`}>
                <td title={t.src === "contract" ? "Data semnării" : "Data finalizării"}>{formatCalendarDate(t.finalizationDate)}</td>
                {showTip && (
                  <td>
                    <span
                      className={`ask-srctag ${t.src === "contract" ? "contracts" : "da"}`}
                      title={
                        t.src === "contract"
                          ? "contract atribuit prin procedură"
                          : "achiziție directă"
                      }
                    >
                      {t.src === "contract" ? "contract" : "directă"}
                    </span>
                    {t.singleBidder === true ? " 1 ofertant" : ""}
                  </td>
                )}
                <td className="clip" {...tip.bindClip(cleanName(t.partnerName))}>
                  {t.partnerId ? (
                    <Link href={`/entitati/${t.partnerId}`}>{cleanName(t.partnerName)}</Link>
                  ) : (
                    (t.partnerName ?? "—")
                  )}
                </td>
                <td className="clip" {...tip.bindClip(t.cpvName ?? t.cpvCode)}>
                  {t.cpvName ?? t.cpvCode ?? "—"}
                </td>
                <td className={`num${t.valueSuspect ? " val-suspect" : ""}`}>
                  {formatRonFull(t.closingValue)}
                  {t.valueSuspect && (
                    <span
                      className="val-warn"
                      {...tip.bind(
                        "valoare de verificat",
                        t.estimatedValueRon
                          ? `estimat: ${formatRonFull(t.estimatedValueRon)}`
                          : undefined,
                        t.closingValue != null && t.closingValue > 2000000
                          ? "Depășește plafonul analitic de 2 milioane lei și este exclusă din total. Verifică valoarea și unitatea de măsură în sursă."
                          : "Valoarea diferă de estimare de cel puțin 100 de ori. Dacă este pozitivă și de cel mult 2 milioane lei, rămâne inclusă în total. Verifică valoarea și unitatea de măsură în sursă.",
                      )}
                    >
                      {" "}
                      ⚠
                    </span>
                  )}
                </td>
                <td>{gapLabel(t.gapMinutes)}</td>
                <td className="clip">
                  {t.daFlags.map((f) => (
                    <span className="flag-badge sm" key={f} title={FLAG_META[f]?.short}>
                      {FLAG_META[f]?.title ?? f}
                    </span>
                  ))}
                </td>
                <td>
                  {t.src === "contract" ? (
                    t.natId ? (
                      <Link href={`/contracte/${t.natId}`}>detalii →</Link>
                    ) : t.caNoticeId ? (
                      <a href={awardUrl(t.caNoticeId)} target="_blank" rel="noopener noreferrer">
                        anunț ↗
                      </a>
                    ) : (
                      "—"
                    )
                  ) : (
                    <a href={daUrl(t.sicapDaId)} target="_blank" rel="noopener noreferrer">
                      sursa ↗
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="ask-pager">
          <button type="button" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>
            ‹ anterioare
          </button>
          <button type="button" disabled={loading || page >= pages} onClick={() => setPage(page + 1)}>
            următoare ›
          </button>
        </div>
      )}
    </div>
  );
}
