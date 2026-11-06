"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ENTITY_YEAR_EVENT } from "./entity-top";
import { formatRonFull, formatExactDecimal, formatInt, formatCalendarDate, cleanName } from "@/lib/format";
import { FLAG_META, flagRecordLabel } from "@/lib/flags";
import { daUrl, awardUrl } from "@/lib/elicitatie";
import { useTip } from "../../intreaba/use-tip";
import type { DaTx } from "@/lib/marts";
import { txColumns } from "@/lib/entity-tx-columns";
import { filterParams } from "@/lib/table-filters/codec";
import { chipsOf } from "@/lib/table-filters/describe";
import type { ColumnDef, FilterState, FilterValue } from "@/lib/table-filters/types";
import ColumnFilter from "@/components/table-filters/ColumnFilter";
import FilterBand from "@/components/table-filters/FilterBand";
import { useTableFilters } from "@/components/table-filters/useTableFilters";
import { useEntityTable } from "./useEntityTable";
import { contractKindLabel, republishedContractKeys, txRowKey } from "./tx-rows";
import { emptyState, statusLine } from "./tx-filters";
import { consortiumExplanation, consortiumPhrase, consortiumPhraseParts, consortiumShareLabel, isConsortium } from "@/lib/consortium";
import EntityName from "@/components/EntityName";
import { G, Ghost } from "@/components/ghost/Ghost";
import { FloatStatus } from "@/components/ghost/client";

/**
 * The entity page's records table, to the drill-table standard: 10 rows a page, sortable dates and values, a SEAP
 * source link per row. Lands at #achizitii from the signal cards' „Vezi în tabel”.
 *
 * Filters (owner decision of 4 November 2026): a funnel in each filterable header whose options are the values of the
 * rows the other filters leave; above the table only the applied filters, each with its ✕. They replace the source
 * switch, the year list, the signal chips and the „Arată excluse” box (now a type, in the Tip funnel). The selection
 * the rows come from is the one the funnels, the band, the status line and the address show; an empty table says why
 * and offers to take each filter out.
 *
 * Loading (owner, 6 November 2026): page 1 comes with the server's page (`first`), so the table is there at the first
 * paint and the page never grows under the reader. A sort, a filter or another page keeps the old rows in place, dimmed,
 * with a floating status; ghost rows only when there is nothing to show (no server page, a retry after an error).
 */

interface Resp {
  ok: boolean;
  rows?: DaTx[];
  total?: number;
  error?: string;
}

export default function TxTable({
  entityId,
  role,
  isAuth,
  initial = {},
  first,
  count,
}: {
  entityId: string;
  role: "furnizor" | "autoritate";
  isAuth: boolean;
  /** The filters the page's address carries (lib/entity-tx-columns.ts). */
  initial?: FilterState;
  /** Page 1 under those filters, sorted by value, as the server rendered it: shown without fetching it again. */
  first?: { rows: DaTx[]; total: number } | null | undefined;
  /** The entity's records in this role (the "Achiziții" tab's count): how many ghost rows a page without filters has. */
  count?: number | undefined;
}) {
  const columns = txColumns(isAuth);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"value" | "date">("value");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const tip = useTip();
  const status = useRef<HTMLDivElement>(null);
  const facetUrl = (key: string, state: FilterState, term = "") => {
    const p = filterParams(columns, state, new URLSearchParams({ id: entityId, rol: role, optiuni: key }));
    if (term) p.set("cauta", term);
    return `/api/entity-tx?${p.toString()}`;
  };
  const filters = useTableFilters(columns, initial, facetUrl);
  const update = (next: FilterState) => { filters.replace(next); setPage(1); };
  const setColumn = (key: string) => (value: FilterValue | null) => { filters.set(key, value); setPage(1); };

  // A year of the top's chart (EntityYears): that year alone, no other filter.
  useEffect(() => {
    const pick = (e: Event) => {
      const year = (e as CustomEvent<string>).detail;
      if (!/^\d{4}$/.test(year)) return;
      filters.replace({ data: { kind: "dates", years: [year], from: null, to: null } });
      setPage(1);
    };
    window.addEventListener(ENTITY_YEAR_EVENT, pick);
    return () => window.removeEventListener(ENTITY_YEAR_EVENT, pick);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- `filters.replace` only sets state

  const p = filterParams(columns, filters.state, new URLSearchParams({ id: entityId, rol: role, page: String(page), sort, dir }));
  const url = `/api/entity-tx?${p.toString()}`;
  const [seed] = useState(() => (first ? { url, data: { ok: true, rows: first.rows, total: first.total } satisfies Resp } : undefined));
  const { data, loading, error, retry } = useEntityTable<Resp>(url, seed);

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
  // The status line keeps the shown rows' words while others load (the floating status says it is loading), so it
  // neither changes length nor is read out twice.
  const line = loading ? null : error ? "Înregistrările nu au putut fi încărcate." : statusLine(total, page, pages, filters.state);
  const [shownLine, setShownLine] = useState(line);
  if (line !== null && line !== shownLine) setShownLine(line);
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

  const column = (key: string): ColumnDef => columns.find((c) => c.key === key)!;
  const funnel = (key: string, align: "start" | "end" = "start") => (
    <ColumnFilter
      column={column(key)}
      value={filters.state[key]}
      onChange={setColumn(key)}
      facetUrl={(term) => facetUrl(key, filters.state, term)}
      onFacet={(facet) => filters.learn(key, facet)}
      align={align}
    />
  );
  const sortState = (key: "value" | "date") => (sort === key ? (dir === "desc" ? "descending" : "ascending") : "none");
  const republished = republishedContractKeys(rows);
  const nCols = 7;
  const empty = !loading && !error && rows.length === 0 ? emptyState(chipsOf(columns, filters.state, filters.labels)) : null;
  return (
    <div>
      {tip.el}
      <FilterBand columns={columns} state={filters.state} labels={filters.labels} onChange={update} />
      <div className={`ask-detmeta${stale ? " g-stale" : ""}`} role="status" ref={status} tabIndex={-1}>
        {line ?? (stale ? shownLine : "Se încarcă înregistrările…")}
      </div>
      <div className={`ask-tablewrap${stale ? " g-stale" : ""}`} aria-busy={loading}>
        <table className="ask-table ask-drill ent-tx" aria-label="Toate achizițiile și contractele">
          <thead>
            <tr>
              {/* Sorting and filtering are buttons in the header, their state on it (keyboard and screen readers). */}
              <th scope="col" className="col-date sortable" aria-sort={sortState("date")}>
                <span className="th-filter">
                  <button type="button" className="th-sort" onClick={() => sortBy("date")}>
                    Data{sort === "date" ? (dir === "desc" ? " ▾" : " ▴") : ""}
                  </button>
                  {funnel("data")}
                </span>
              </th>
              <th scope="col" className="col-src"><span className="th-filter">Tip{funnel("tip")}</span></th>
              <th scope="col"><span className="th-filter">{isAuth ? "Furnizor" : "Autoritate"}{funnel("partener")}</span></th>
              <th scope="col" className="col-cpv"><span className="th-filter">Obiect (CPV){funnel("cpv")}</span></th>
              <th scope="col" className="col-value num sortable" aria-sort={sortState("value")}>
                <span className="th-filter">
                  <button type="button" className="th-sort" onClick={() => sortBy("value")}>
                    Valoare{sort === "value" ? (dir === "desc" ? " ▾" : " ▴") : ""}
                  </button>
                  {funnel("valoare", "end")}
                </span>
              </th>
              <th scope="col" className="col-flags"><span className="th-filter">Semnale{funnel("semnale", "end")}</span></th>
              <th scope="col" className="col-links">Sursă</th>
            </tr>
          </thead>
          {loading && rows.length === 0 ? <TxGhostRows n={Object.keys(filters.state).length === 0 && count !== undefined ? Math.max(1, Math.min(10, count)) : 10} /> :
          <tbody inert={stale || undefined}>
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
                  {empty.exits.map((x) => (
                    <button key={x.id} type="button" onClick={() => update(x.without)}>Fără {x.lead ? `${x.lead} ` : ""}{x.value}</button>
                  ))}
                  {empty.exits.length > 1 && <button type="button" onClick={() => update({})}>Scoate toate</button>}
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
                <td className="c-src">
                  <span
                    className={`ask-srctag ${t.src === "contract" ? "contracts" : "da"}`}
                    title={t.src === "contract" ? "contract atribuit prin procedură" : "achiziție directă"}
                  >
                    {t.src === "contract" ? "contract" : "directă"}
                  </span>
                </td>
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
                      {flagRecordLabel(f)}
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
          </tbody>}
        </table>
      </div>
      {stale && <FloatStatus>Se încarcă înregistrările…</FloatStatus>}
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

/**
 * The rows before the first answer (no server page, or a retry after an error): the real row and cell classes, with
 * the lines of a typical record (two or three on a desktop, a phone's card of about 185 px; measured on four entities).
 * Shown after 120 ms, so a quick answer never flashes it; the status line above says it is loading.
 */
function TxGhostRows({ n }: { n: number }) {
  return (
    <Ghost as="tbody" name="entity-tx" wait="client">
      <G.Rows n={n} as="tr" cells={(i) => <>
        <td className="c-date"><G.Line w="76%" /></td>
        <td className="c-src"><G.Line w="64px" inline /></td>
        <td className="c-party"><G.Line w={i % 3 === 1 ? "58%" : "88%"} /><G.Line w={i % 3 === 0 ? "76%" : "46%"} only="not-phone" />
          {i % 3 === 0 && <G.Line w="30%" only="not-phone" />}</td>
        <td className="c-cpv"><G.Line w="82%" /><G.Line w="48%" only="phone" /></td>
        <td className="num c-val"><G.Line w="70%" inline /></td>
        <td className="c-flags" data-empty="1" />
        <td className="c-links"><G.Line w="64%" /><G.Line w="42%" only="phone" /></td>
      </>} />
    </Ghost>
  );
}
