"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ENTITY_YEAR_EVENT } from "./entity-top";
import { formatRonFull, formatExactDecimal, formatInt, formatCalendarDate, cleanName } from "@/lib/format";
import { FLAG_META, flagLabel } from "@/lib/flags";
import { daUrl, awardUrl } from "@/lib/elicitatie";
import { useTip } from "../../intreaba/blocks";
import type { DaTx, TxYearCounts } from "@/lib/marts";
import { useEntityTable } from "./useEntityTable";
import { contractKindLabel, republishedContractKeys, txRowKey } from "./tx-rows";
import {
  EMPTY_SELECTION, channelForced, channelOf, emptyState, rowFlag, selectionSearch, statusLine, yearOptions,
  type EmptyExit, type TxSelection, type TxSrc,
} from "./tx-filters";
import { consortiumExplanation, consortiumPhrase, consortiumPhraseParts, consortiumShareLabel, isConsortium } from "@/lib/consortium";
import EntityName from "@/components/EntityName";
import Term from "@/components/Term";

/**
 * The entity page's transaction table, redesigned to the drill-table standard:
 * 10 rows/page, sortable columns (▾/▴), year + flag filters that fetch in
 * place (no page reload), an explicit active-filter banner, and a SEAP source
 * link per row. Lands at #achizitii from the flag cards' "vezi achizițiile".
 *
 * Critique of 2 November 2026 (the owner kept every mockup's "after"): the selection the rows come from is the one
 * the controls, the „Filtrat:” band, the status line and the address show; the year list counts each year's records;
 * an empty table says why; a new page keeps the old rows dimmed in place and starts under the sticky header.
 */

interface Resp {
  ok: boolean;
  rows?: DaTx[];
  total?: number;
  error?: string;
}

interface CountsResp {
  ok: boolean;
  counts?: TxYearCounts;
  error?: string;
}

const FORCED_TITLE = "Semnalele și înregistrările excluse sunt doar achiziții directe.";

export default function TxTable({
  entityId,
  role,
  isAuth,
  flags,
  initial = EMPTY_SELECTION,
  excludedDa,
}: {
  entityId: string;
  role: "furnizor" | "autoritate";
  isAuth: boolean;
  flags: string[];
  /** The selection the page's address carries (?canal, ?an, ?sem, ?excluse). */
  initial?: TxSelection;
  /** Direct acquisitions outside the total: no „Arată excluse” when there are none. */
  excludedDa: number;
}) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"value" | "date">("value");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [sel, setSel] = useState<TxSelection>(initial);
  const [yearsOpen, setYearsOpen] = useState(false);
  const tip = useTip();
  const yearsBox = useRef<HTMLDivElement>(null);
  const yearsButton = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const update = (next: Partial<TxSelection>) => { setSel((s) => ({ ...s, ...next })); setPage(1); };
  const forced = channelForced(sel);
  const channel = channelOf(sel);

  // A year of the top's chart (EntityYears): that year alone, every channel, no other filter.
  useEffect(() => {
    const pick = (e: Event) => {
      const year = (e as CustomEvent<string>).detail;
      if (!/^\d{4}$/.test(year)) return;
      setSel({ ...EMPTY_SELECTION, years: [year] }); setPage(1);
    };
    window.addEventListener(ENTITY_YEAR_EVENT, pick);
    return () => window.removeEventListener(ENTITY_YEAR_EVENT, pick);
  }, []);
  // The address keeps the selection, so it can be reloaded or sent (the page's other parameters stay).
  useEffect(() => {
    const search = selectionSearch(window.location.search, sel);
    if (search !== window.location.search) history.replaceState(history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
  }, [sel]);
  // The years' panel closes on a tap or click outside it and on Escape, which gives the focus back to its button.
  useEffect(() => {
    if (!yearsOpen) return;
    const outside = (e: Event) => { if (!yearsBox.current?.contains(e.target as Node)) setYearsOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { setYearsOpen(false); yearsButton.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [yearsOpen]);

  const p = new URLSearchParams({ id: entityId, rol: role, page: String(page), sort, dir });
  if (sel.excluded) p.set("excluse", "1");
  if (sel.years.length > 0) p.set("an", sel.years.join(","));
  if (sel.flag) p.set("sem", sel.flag);
  if (channel !== "all") p.set("tip", channel);
  const { data, loading, error, retry } = useEntityTable<Resp>(`/api/entity-tx?${p.toString()}`);
  // The records per year of each channel change only with a signal or the excluded records.
  const cp = new URLSearchParams({ id: entityId, rol: role, doar: "ani" });
  if (sel.flag) cp.set("sem", sel.flag);
  if (sel.excluded) cp.set("excluse", "1");
  const counts = useEntityTable<CountsResp>(`/api/entity-tx?${cp.toString()}`).data?.counts ?? null;

  const sortBy = (key: "value" | "date") => {
    if (sort === key) setDir(dir === "desc" ? "asc" : "desc");
    else {
      setSort(key);
      setDir("desc");
    }
    setPage(1);
  };
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 10));
  const rows = data?.rows ?? [];
  // While a new page loads, the old rows stay where they are, dimmed and out of reach; ghost rows only before the first.
  const stale = loading && rows.length > 0;
  const toggleYear = (y: string) => update({ years: sel.years.includes(y) ? sel.years.filter((x) => x !== y) : [...sel.years, y].sort() });
  // A new page starts under the sticky header and tabs, where the reader left the old one's first row, not at its
  // end (a phone's cards are much taller than the rows that stood in for them).
  const goPage = (n: number) => {
    if (loading || n < 1 || n > pages) return;
    setPage(n);
    const line = status.current;
    if (!line) return;
    const covered = (document.querySelector(".site-header")?.getBoundingClientRect().height ?? 0)
      + (document.querySelector(".subnav")?.getBoundingClientRect().height ?? 0);
    const top = line.getBoundingClientRect().top;
    if (top >= covered) return;
    window.scrollTo({ top: top + window.scrollY - covered - 12, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    line.focus({ preventScroll: true });
  };
  const exitTo = (kind: EmptyExit["kind"]) => {
    if (kind === "years") update({ years: [] });
    else if (kind === "src") update({ src: "all" });
    else if (kind === "flag") update({ flag: null });
    else if (kind === "excluded") update({ excluded: false });
    else update(EMPTY_SELECTION);
  };

  const chipFlags = [...new Set([...flags.filter(rowFlag), ...(sel.flag ? [sel.flag] : [])])];
  const options = counts ? yearOptions(counts, channel, sel.years) : null;
  const sortedYears = [...sel.years].sort();
  const pieces: { key: string; text: ReactNode; clear?: () => void; clearLabel?: string; title?: string }[] = [];
  if (sel.years.length > 0 || sel.flag || sel.excluded) {
    if (channel !== "all") pieces.push(forced
      ? { key: "src", text: <b>achiziții directe</b>, title: FORCED_TITLE }
      : { key: "src", text: <b>{channel === "da" ? "achiziții directe" : "contracte"}</b>, clear: () => update({ src: "all" }), clearLabel: "Înapoi la toate sursele" });
    if (sel.years.length > 0) pieces.push({ key: "years", text: <>{sel.years.length === 1 ? "anul" : "anii"} <b>{sortedYears.join(", ")}</b></>, clear: () => update({ years: [] }), clearLabel: "Scoate anii" });
    if (sel.excluded) pieces.push({ key: "excluded", text: <b>excluse din total</b>, clear: () => update({ excluded: false }), clearLabel: "Înapoi la total" });
    if (sel.flag) pieces.push({ key: "flag", text: <>semnalul <b>„{flagLabel(sel.flag)}”</b></>, clear: () => update({ flag: null }), clearLabel: "Scoate semnalul" });
  }

  const showTip = channel === "all";
  const republished = republishedContractKeys(rows);
  const nCols = showTip ? 7 : 6;
  const empty = !loading && !error && rows.length === 0 ? emptyState(sel, counts) : null;
  return (
    <div>
      {tip.el}
      {/* channel toggle — same control as the search drill's stream toggle */}
      <div className="ask-streamtoggle" role="group" aria-label="Sursa înregistrărilor">
        {(
          [
            ["all", "toate sursele"],
            ["da", "achiziții directe"],
            ["contracts", "contracte"],
          ] as const
        ).map(([k, l]) => {
          const blocked = forced && k !== "da";
          return (
            <button
              key={k}
              type="button"
              className={channel === k ? "on" : ""}
              aria-pressed={channel === k}
              aria-disabled={blocked || undefined}
              title={blocked ? FORCED_TITLE : undefined}
              onClick={() => { if (!blocked) update({ src: k as TxSrc }); }}
            >
              {l}
            </button>
          );
        })}
      </div>
      {(excludedDa > 0 || sel.excluded) && (
        <div className="tx-excluded ent-tip">
          <label className="data-exclusion-toggle"><input type="checkbox" checked={sel.excluded} onChange={(e) => update({ excluded: e.target.checked, flag: e.target.checked ? null : sel.flag })} /> Arată excluse din total</label>
          <Term tip id="excluse-total" />
        </div>
      )}
      <div className="txf">
        {/* years scale unbounded (a new one every January) → multi-select dropdown */}
        <div className="txf-dd" ref={yearsBox}>
          <button ref={yearsButton} type="button" className={sel.years.length > 0 ? "on" : ""} aria-expanded={yearsOpen} aria-controls={panelId} onClick={() => setYearsOpen(!yearsOpen)}>
            an: {sel.years.length > 0 ? sortedYears.join(", ") : "toți"} ▾
          </button>
          {yearsOpen && (
            <div className="txf-panel" id={panelId} role="group" aria-label="Anii înregistrărilor">
              <label>
                <input type="checkbox" checked={sel.years.length === 0} onChange={() => update({ years: [] })} />
                toți anii
              </label>
              {options === null ? <span className="txf-wait">Se încarcă anii…</span> : options.map((o) => (
                <label key={o.year} className={o.disabled ? "off" : undefined}>
                  <input type="checkbox" checked={sel.years.includes(o.year)} disabled={o.disabled} onChange={() => toggleYear(o.year)} />
                  {o.year}
                  <span className="n">{formatInt(o.n)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        {chipFlags.length > 0 && <span className="txf-lab">semnal:</span>}
        {chipFlags.map((f) => (
          <button
            key={f}
            type="button"
            className={sel.flag === f ? "on" : ""}
            aria-pressed={sel.flag === f}
            title={FLAG_META[f]?.short}
            onClick={() => {
              const next = sel.flag === f ? null : f;
              // flags mark DA rows only — selecting one narrows to that channel, and the band says so
              update({ flag: next, excluded: next ? false : sel.excluded });
            }}
          >
            {flagLabel(f)}
          </button>
        ))}
      </div>
      {pieces.length > 0 && (
        <div className="txf-active">
          <span className="txf-lab-act">Filtrat:</span>
          {pieces.map((piece, i) => (
            <span key={piece.key} className="txf-piece" title={piece.title}>
              {i > 0 && <span className="txf-sep" aria-hidden="true">·</span>}
              {piece.text}
              {piece.clear && <button type="button" className="txf-x" aria-label={piece.clearLabel} onClick={piece.clear}>✕</button>}
            </span>
          ))}
          <span className="txf-sep" aria-hidden="true">·</span>
          <button type="button" className="txf-all" onClick={() => update(EMPTY_SELECTION)}>Scoate toate</button>
        </div>
      )}
      <div className="ask-detmeta" role="status" ref={status} tabIndex={-1}>
        {loading ? "Se încarcă înregistrările…" : error ? "Înregistrările nu au putut fi încărcate." : statusLine(total, page, pages, channel)}
      </div>
      <div className="ask-tablewrap" aria-busy={loading}>
        <table className={`ask-table ask-drill ent-tx${stale ? " tx-loading" : ""}`} aria-label="Toate achizițiile și contractele">
          <thead>
            <tr>
              {/* Sorting is a button in the header, with its state on the header (keyboard and screen readers). */}
              <th scope="col" className="col-date sortable" aria-sort={sort === "date" ? (dir === "desc" ? "descending" : "ascending") : "none"}>
                <button type="button" className="th-sort" onClick={() => sortBy("date")}>
                  Data{sort === "date" ? (dir === "desc" ? " ▾" : " ▴") : ""}
                </button>
              </th>
              {showTip && <th scope="col" className="col-src">Tip</th>}
              <th scope="col">{isAuth ? "Furnizor" : "Autoritate"}</th>
              <th scope="col" className="col-cpv">Obiect (CPV)</th>
              <th scope="col" className="col-value num sortable" aria-sort={sort === "value" ? (dir === "desc" ? "descending" : "ascending") : "none"}>
                <button type="button" className="th-sort" onClick={() => sortBy("value")}>
                  Valoare{sort === "value" ? (dir === "desc" ? " ▾" : " ▴") : ""}
                </button>
              </th>
              <th scope="col" className="col-flags">Semnale</th>
              <th scope="col" className="col-links">Sursă</th>
            </tr>
          </thead>
          <tbody inert={stale || undefined}>
            {loading && rows.length === 0 &&
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
                <td colSpan={nCols} className="tx-empty">
                  <button type="button" onClick={retry}>Reîncearcă</button>
                </td>
              </tr>
            )}
            {empty && (
              <tr>
                <td colSpan={nCols} className="tx-empty">
                  <span>{empty.text}</span>
                  {empty.exits.map((x) => <button key={x.kind} type="button" onClick={() => exitTo(x.kind)}>{x.label}</button>)}
                </td>
              </tr>
            )}
            {!error && rows.map((t, i) => {
              // The table rounds to the leu (owner, 2 November 2026); the exact value, to the ban, on hover.
              const exact = t.closingValueExact && /\.\d*[1-9]/.test(t.closingValueExact) ? `${formatExactDecimal(t.closingValueExact)} lei` : undefined;
              const flagged = t.daFlags.length > 0 || t.singleBidder === true;
              return (
              // consortium contracts come as one row per member with the same contract id
              <tr key={txRowKey(t, i)}>
                <td className="c-date" title={t.src === "contract" ? "Data semnării" : "Data finalizării"}>{t.src === "contract" && !t.finalizationDate ? "Dată sursă improbabilă" : formatCalendarDate(t.finalizationDate)}</td>
                {showTip && (
                  <td className="c-src">
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
                  </td>
                )}
                <td className="clip c-party" {...tip.bindClip(cleanName(t.partnerName))}>
                  {t.partnerId ? (
                    <Link href={`/entitati/${t.partnerId}`}>{cleanName(t.partnerName)}</Link>
                  ) : (
                    (t.partnerName ?? "—")
                  )}
                  {isConsortium(t.nWinners) && (
                    <span className="cons-line">
                      {t.consortiumMembers
                        ? consortiumPhraseParts(t.consortiumMembers.map((m) => ({ ...m, name: cleanName(m.name) })), t.nWinners).map((part, k) =>
                            typeof part === "string" ? part : <EntityName key={k} id={part.id} role="supplier">{part.name}</EntityName>)
                        : consortiumPhrase(t.consortiumOthers.map(cleanName), t.nWinners)}
                    </span>
                  )}
                </td>
                <td className="clip c-cpv" {...tip.bindClip(t.cpvName ?? t.cpvCode)}>
                  {t.cpvName ?? t.cpvCode ?? "—"}
                </td>
                <td className={`num c-val${t.valueSuspect ? " val-suspect" : ""}`}>
                  <span title={exact}>{formatRonFull(t.closingValue)}</span>
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
                  {isConsortium(t.nWinners) && (
                    <span className="cons-line" title={consortiumExplanation(t.nWinners)}>
                      {consortiumShareLabel(t.nWinners, t.contractValueFull != null ? formatRonFull(t.contractValueFull) : null)}
                    </span>
                  )}
                  {(() => {
                    const kind = contractKindLabel(t.financialKind);
                    return kind ? <span className="cons-line kind-line" title={kind.title}>{kind.text}</span> : null;
                  })()}
                </td>
                {/* The leads of the row: its signals, and a single bidder for a contract in every view (critique of 2 November 2026). */}
                <td className="c-flags" data-empty={flagged ? undefined : "1"}>
                  {t.daFlags.map((f) => (
                    <span className="flag-badge sm" key={f} title={FLAG_META[f]?.short}>
                      {flagLabel(f)}
                    </span>
                  ))}
                  {t.singleBidder === true && <span className="flag-badge sm neutral" title="O singură ofertă raportată în sursă">1 ofertant</span>}
                </td>
                <td className="c-links">
                  {t.src === "contract" && t.daCode?.trim() ? (
                    <span className="c-no" title={`Numărul contractului în sursă: ${t.daCode.trim()}`}>nr. {t.daCode.trim()}</span>
                  ) : null}
                  {republished.has(txRowKey(t, i)) ? (
                    <span className="c-no c-dup" title="Același număr, aceeași dată, aceeași valoare și același partener apar și sub alt anunț de atribuire. Deschide detaliile ca să compari anunțurile.">
                      apare și sub alt anunț
                    </span>
                  ) : null}
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
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="ask-pager">
          {/* aria-disabled, not disabled: the focused button keeps the focus while the next page loads */}
          <button type="button" aria-disabled={loading || page <= 1} onClick={() => goPage(page - 1)}>
            ‹ anterioare
          </button>
          <span className="ask-pager-pos">pagina {formatInt(page)} din {formatInt(pages)}</span>
          <button type="button" aria-disabled={loading || page >= pages} onClick={() => goPage(page + 1)}>
            următoare ›
          </button>
        </div>
      )}
    </div>
  );
}
