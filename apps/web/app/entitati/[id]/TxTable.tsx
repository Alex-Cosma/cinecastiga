"use client";

import { useChangedMark } from "../../../components/motion/changed";
import { useSortedColumn } from "../../../components/motion/rows";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ENTITY_TABLE_EVENT, ENTITY_YEAR_EVENT } from "./entity-top";
import { formatRonFull, formatExactDecimal, formatCalendarDate, cleanName } from "@/lib/format";
import { FLAG_META, flagRecordLabel } from "@/lib/flags";
import { daUrl, awardUrl } from "@/lib/elicitatie";
import { useTip } from "../../intreaba/use-tip";
import type { DaTx } from "@/lib/marts";
import { txColumns } from "@/lib/entity-tx-columns";
import { filterParams, readFilters, writeFilters } from "@/lib/table-filters/codec";
import { chipsOf } from "@/lib/table-filters/describe";
import type { ColumnDef, FilterState, FilterValue } from "@/lib/table-filters/types";
import ColumnFilter from "@/components/table-filters/ColumnFilter";
import FilterBand from "@/components/table-filters/FilterBand";
import { useTableFilters } from "@/components/table-filters/useTableFilters";
import { useEntityTable } from "./useEntityTable";
import { consortiumGroups, contractKindLabel, republishedContractKeys, txRowKey } from "./tx-rows";
import { emptyState, statusLine } from "./tx-filters";
import { consortiumExplanation, consortiumPhrase, consortiumPhraseParts, consortiumShareLabel, isConsortium } from "@/lib/consortium";
import EntityName from "@/components/EntityName";
import { G, Ghost } from "@/components/ghost/Ghost";
import { FloatStatus } from "@/components/ghost/client";
import Pager from "./Pager";

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
  /** The table's rows (a consortium contract is one row on an institution's table). */
  groups?: number;
  error?: string;
}

export default function TxTable({
  entityId,
  role,
  isAuth,
  initial = {},
  first,
  count,
  initialPage = 1,
  askHref,
}: {
  entityId: string;
  role: "furnizor" | "autoritate";
  isAuth: boolean;
  /** The filters the page's address carries (lib/entity-tx-columns.ts). */
  initial?: FilterState;
  /** Page 1 under those filters, sorted by value, as the server rendered it: shown without fetching it again. */
  first?: { rows: DaTx[]; total: number; groups?: number } | null | undefined;
  /** The entity's records in this role (the "Achiziții" tab's count): how many ghost rows a page without filters has. */
  count?: number | undefined;
  /** The page the address asks for (`?p=`; UX audit Z5-29), the one `first` holds. */
  initialPage?: number;
  /** The same records in Întreabă's drawer (captures, follows, its own CSV). */
  askHref?: string;
}) {
  const columns = txColumns(isAuth);
  // The address as the browser has it now: Back to this page restores the server's first answer, whose parameters
  // predate the filters and the page written to the address since (UX audit, 16 November 2026).
  const address = useSearchParams();
  const [start] = useState(() => {
    if (!address || address.toString() === "") return { filters: initial, page: initialPage };
    const p = address.get("p") ?? "";
    return { filters: readFilters(columns, (key) => address.get(key)), page: /^[1-9]\d{0,5}$/.test(p) ? Number(p) : 1 };
  });
  const [page, setPage] = useState(start.page);
  // An address that filters the table (or asks for one of its pages) opens on it (UX audit Z5-28, 16 November 2026), as
  // the map's links do with #achizitii: the reader sees at once why the table shows what it shows. Only a fresh open at
  // the page's top; Back keeps the reader's place.
  useEffect(() => {
    if (window.location.hash || window.scrollY > 0 || (Object.keys(start.filters).length === 0 && start.page === 1)) return;
    document.getElementById("achizitii")?.scrollIntoView({ block: "start" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, at the first paint
  // The page is in the address (UX audit Z5-29, 16 November 2026), without a history entry per page: Back after a
  // record's „detalii →” returns to the same page of the table.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (page > 1) url.searchParams.set("p", String(page)); else url.searchParams.delete("p");
    if (url.search !== window.location.search) history.replaceState(history.state, "", `${url.pathname}${url.search.replaceAll("%2C", ",")}${url.hash}`);
  }, [page]);
  const [sort, setSort] = useState<"value" | "date">("value");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const tip = useTip();
  const status = useRef<HTMLDivElement>(null);
  const facetUrl = (key: string, state: FilterState, term = "") => {
    const p = filterParams(columns, state, new URLSearchParams({ id: entityId, rol: role, optiuni: key }));
    if (term) p.set("cauta", term);
    return `/api/entity-tx?${p.toString()}`;
  };
  const filters = useTableFilters(columns, start.filters, facetUrl);
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
    // A partner's records or a channel of the ledger (UX audit Z5-12): those filters alone.
    const show = (e: Event) => {
      const next = (e as CustomEvent<FilterState>).detail;
      if (!next || typeof next !== "object") return;
      filters.replace(next);
      setPage(1);
    };
    window.addEventListener(ENTITY_YEAR_EVENT, pick);
    window.addEventListener(ENTITY_TABLE_EVENT, show);
    return () => { window.removeEventListener(ENTITY_YEAR_EVENT, pick); window.removeEventListener(ENTITY_TABLE_EVENT, show); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- `filters.replace` only sets state

  const p = filterParams(columns, filters.state, new URLSearchParams({ id: entityId, rol: role, page: String(page), sort, dir }));
  const url = `/api/entity-tx?${p.toString()}`;
  // The server's first page serves only the selection it was read for (after Back the address may ask another).
  const [seed] = useState(() => (first && start.page === initialPage && writeFilters(columns, "", start.filters) === writeFilters(columns, "", initial)
    ? { url, data: { ok: true, rows: first.rows, total: first.total, groups: first.groups ?? first.total } satisfies Resp } : undefined));
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
  // 10 rows a page, a consortium contract one row (owner, 20 November 2026): the pages count rows, not records.
  const groups = data?.groups ?? total;
  const pages = Math.max(1, Math.ceil(groups / 10));
  const rows = data?.rows ?? [];
  // A new order is seen in its column once its rows are here (M-16); the rows take it at once.
  const table = useRef<HTMLTableElement>(null);
  useSortedColumn(table, `${sort}:${dir}`, sort === "date" ? "tbody td.c-date" : "tbody td.c-val", !loading && rows.length > 0);
  // An address whose page is past the end (fewer records since) opens the last one.
  useEffect(() => { if (!loading && !error && data && page > pages) setPage(pages); }, [loading, error, data, page, pages]);
  // While a new page loads, the old rows stay where they are, dimmed and out of reach; ghost rows only before the first.
  const stale = loading && rows.length > 0;
  // The status line keeps the shown rows' words while others load (the floating status says it is loading), so it
  // neither changes length nor is read out twice.
  const line = loading ? null : error ? "Înregistrările nu au putut fi încărcate." : statusLine(total, filters.state, groups);
  // A year or a filter that changes how many records there are marks the line once (M-05); a page turn does not.
  useChangedMark(status, loading || error ? null : total, entityId);
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
      <div className="tx-head">
        <div className={`ask-detmeta${stale ? " g-stale" : ""}`} role="status" ref={status} tabIndex={-1}>
          {line ?? (stale ? shownLine : "Se încarcă înregistrările…")}
          {/* The page is shown by the pager under the table (owner, 17 November 2026: less repeated text); a screen
              reader still hears it here, where a page turn puts the focus. */}
          {line !== null && !error && pages > 1 && <span className="d-sr-only"> · pagina {page} din {pages}</span>}
        </div>
        {/* The selection shown, as a file; Întreabă's drawer for captures and follows (UX audit Z5-12). */}
        <div className="tx-tools">
          {/* The export is Complet's; Întreabă stays in both modes (owner, 18 November 2026). */}
          <a href={`/api/entity-tx/csv?${filterParams(columns, filters.state, new URLSearchParams({ id: entityId, rol: role, sort, dir })).toString()}`} download data-only="complet">Descarcă CSV</a>
          {askHref && <a href={askHref}>Deschide în Întreabă <span aria-hidden="true">↗</span></a>}
        </div>
      </div>
      <div className={`ask-tablewrap${stale ? " g-stale" : ""}`} aria-busy={loading}>
        <table ref={table} className="ask-table ask-drill ent-tx" aria-label="Toate înregistrările">
          <thead>
            <tr>
              {/* Sorting and filtering are buttons in the header, their state on it (keyboard and screen readers). */}
              <th scope="col" className="col-date sortable" aria-sort={sortState("date")}>
                <span className="th-filter">
                  <button type="button" className="th-sort" onClick={() => sortBy("date")}>
                    Data{sort === "date" && <> <span className={`mo-sort-arrow${dir === "asc" ? " is-up" : ""}`} aria-hidden="true">▾</span></>}
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
                    Valoare{sort === "value" && <> <span className={`mo-sort-arrow${dir === "asc" ? " is-up" : ""}`} aria-hidden="true">▾</span></>}
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
            {!error && (isAuth ? consortiumGroups(rows) : rows.map((t) => [t])).map((group) => {
              const t = group[0]!, i = rows.indexOf(t);
              // The table rounds to the leu (owner, 2 November 2026); the exact value, to the ban, on hover.
              const exact = t.closingValueExact && /\.\d*[1-9]/.test(t.closingValueExact) ? `${formatExactDecimal(t.closingValueExact)} lei` : undefined;
              const flagged = t.daFlags.length > 0 || t.singleBidder === true;
              // A consortium contract's member records on one row, every member named (UX audit Z5-11); a lone member
              // record keeps „consorțiu cu …”.
              const members = group.length > 1 ? group : null;
              return (
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
                {members ? (
                <td className="clip c-party" {...tip.bindClip(members.map((m) => cleanName(m.partnerName)).join(" · "))}>
                  <span className="tx-members">
                    {members.map((m, k) => <span key={m.partnerId ?? k}>{m.partnerId
                      ? <EntityName id={m.partnerId} role="supplier">{cleanName(m.partnerName)}</EntityName>
                      : (m.partnerName ?? "—")}</span>)}
                  </span>
                </td>
                ) : (
                <td className="clip c-party" {...tip.bindClip(cleanName(t.partnerName))}>
                  {t.partnerId ? (
                    <Link prefetch={false} href={`/entitati/${t.partnerId}`}>{cleanName(t.partnerName)}</Link>
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
                )}
                <td className="clip c-cpv" {...tip.bindClip(t.cpvName ?? t.cpvCode)}>
                  {t.cpvName ?? t.cpvCode ?? "—"}
                  {/* What was bought, as SICAP publishes it (UX audit Z5-06): one line, whole on hover. */}
                  {t.src === "da" && t.title && <span className="tx-title" title={t.title}>{t.title}</span>}
                </td>
                <td className={`num c-val${t.valueSuspect ? " val-suspect" : ""}`}>
                  {/* The value and its warning together: on a phone's card they sit at the right of its first line (Z5-24). */}
                  <span className="c-val-main">
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
                  </span>
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
                  {/* The contract's number in the source is not shown here (owner, 19 November 2026; it was Complet's from 18
                      November): the row leads to the contract's page, which has it. */}
                  {group.some((m) => republished.has(txRowKey(m, rows.indexOf(m)))) ? (
                    <span className="c-no c-dup" title="Același număr, aceeași dată, aceeași valoare și același partener apar și sub alt anunț de atribuire. Deschide detaliile ca să compari anunțurile.">
                      apare și sub alt anunț
                    </span>
                  ) : null}
                  {/* Every row leads to its page on the site, its SEAP source smaller beside it (UX audit Z5-06). */}
                  {t.src === "contract" ? (
                    t.natId ? (
                      <>
                        <Link prefetch={false} href={`/contracte/${t.natId}`}>detalii →</Link>
                        {t.caNoticeId && <a className="tx-seap" href={awardUrl(t.caNoticeId)} target="_blank" rel="noopener noreferrer">SEAP ↗</a>}
                      </>
                    ) : t.caNoticeId ? (
                      <a href={awardUrl(t.caNoticeId)} target="_blank" rel="noopener noreferrer">
                        anunț ↗
                      </a>
                    ) : (
                      "—"
                    )
                  ) : (
                    <>
                      <Link prefetch={false} href={`/achizitii/${t.sicapDaId}`}>detalii →</Link>
                      <a className="tx-seap" href={daUrl(t.sicapDaId)} target="_blank" rel="noopener noreferrer">SEAP ↗</a>
                    </>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>}
        </table>
      </div>
      {stale && <FloatStatus>Se încarcă înregistrările…</FloatStatus>}
      <Pager page={page} pages={pages} busy={loading} onPage={goPage} label="Paginile înregistrărilor" />
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
