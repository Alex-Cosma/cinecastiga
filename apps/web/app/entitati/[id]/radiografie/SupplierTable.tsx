"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RADIOGRAFIE_COLUMNS } from "@/lib/radiografie-columns";
import { filterParams, isActive, readFilters } from "@/lib/table-filters/codec";
import type { FilterState, FilterValue } from "@/lib/table-filters/types";
import ColumnFilter from "@/components/table-filters/ColumnFilter";
import FilterBand from "@/components/table-filters/FilterBand";
import FunnelGhost from "@/components/table-filters/FunnelGhost";
import { G, Ghost, rankWidth } from "@/components/ghost/Ghost";
import { useTableFilters } from "@/components/table-filters/useTableFilters";
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
 * Filtered by its column funnels (owner, 4 November 2026): the supplier (which replaced the search box), the value and
 * the records; on a phone, whose cards have no header, the funnels sit in a row of their own.
 */
interface Resp extends Partial<DepPage> { ok: boolean; error?: string }

const LABEL: Record<DepSort, string> = { value: "valoare", here: "ponderea în autoritate", life: "câștigurile publice ale firmei venite de aici", recs: "înregistrări", name: "nume" };
const PILL: Record<DepSort, string> = { value: "Valoare", here: "Din autoritate", life: "Cât din câștigurile publice ale firmei vin de aici", recs: "Înregistrări", name: "Furnizor" };

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

/* ---- ghosts (owner, 6 November 2026: "ghost data loading"): the table's own cells, decorative widths ---- */

/** The first page's ten rows (on a phone, its cards) while it loads: name, the two shares, the value, the records. */
export function SupplierRowsGhost() {
  return <Ghost as="tbody" name="rv-rows" wait="client">
    <G.Rows n={10} as="tr" className="rv-g-row" cells={(i) => <>
      <td className="c-name"><G.Line w={rankWidth(i, 74, 5, 40)} />{i % 4 === 3 && <G.Line w="34%" only="phone" />}</td>
      <td className="c-duel"><span className="rv-duel">
        <span className="l"><b><G.Line inline w="4ch" /></b><G.Block w={`${Math.max(4, 22 - i * 2)}%`} h="10px" r="3px" /></span>
        <span className="axis" />
        <span className="rr"><G.Block w={`${[70, 64, 18, 66, 26, 30, 62, 58, 40, 46][i] ?? 40}%`} h="10px" r="3px" /><b><G.Line inline w="4ch" /></b></span>
      </span></td>
      <td className="c-val"><span className="v"><G.Line inline w="11ch" /></span><span className="rv-stack" style={{ width: `${Math.max(16, 96 - i * 8)}%` }}><G.Block w="100%" h="6px" r="0" /></span></td>
      <td className="c-recs"><span className="v"><G.Line inline w="3ch" /></span><span className="sub"><G.Line inline w="12ch" /></span></td>
    </>} />
  </Ghost>;
}

/** The whole table for the route's ghost: its heading, controls and header as quiet replicas, the rows, the pager. */
export function SupplierTableGhost() {
  const th = (label: string, on = false) => <span className="rv-th" data-on={on || undefined} data-dir={on ? "desc" : undefined}>{label}<Chevron /></span>;
  return (
    <div className="rv-ranking" aria-hidden="true">
      <h2>Toți furnizorii</h2>
      <div className="rv-rank-top">
        <p className="rv-rank-count"><G.Line inline w="22ch" /></p>
        <p className="rv-legend"><span><i className="rv-sw-ct" />contracte prin proceduri</span><span><i className="rv-sw-da" />achiziții directe</span></p>
      </div>
      <div className="rv-sortpills">{(["value", "here", "life", "recs", "name"] as const).map((k) => <span key={k} className="rv-pill-g" data-on={k === "value" || undefined}>{PILL[k]}{k === "value" ? " ↓" : ""}</span>)}</div>
      <div className="rv-filterpills">{RADIOGRAFIE_COLUMNS.map((c) => <span key={c.key} className="rv-filterpill">{c.label}<FunnelGhost /></span>)}</div>
      <div className="rv-rank-wrap">
        <table className="rv-rank">
          <thead>
            <tr inert>
              <th scope="col" className="c-name"><span className="th-filter">{th("Furnizor")}<FunnelGhost /></span></th>
              <th scope="col" className="c-duel"><span className="rv-duelhead"><span>{th("← Din autoritate")}</span><span className="axis" /><span>{th("Cât din câștigurile publice ale firmei vin de aici →")}</span></span></th>
              <th scope="col" className="c-val"><span className="th-filter">{th("Valoare", true)}<FunnelGhost /></span></th>
              <th scope="col" className="c-recs"><span className="th-filter">{th("Înregistrări")}<FunnelGhost /></span></th>
            </tr>
          </thead>
          <SupplierRowsGhost />
        </table>
      </div>
      <div className="rv-pager"><G.Block w="7.4em" h="44px" /><span><G.Line inline w="14ch" /></span><G.Block w="7.4em" h="44px" /></div>
    </div>
  );
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
  const address = useSearchParams();
  const facetUrl = (key: string, state: FilterState, term = "") => {
    const p = filterParams(RADIOGRAFIE_COLUMNS, state, new URLSearchParams({ id: authorityId, optiuni: key }));
    if (term) p.set("cauta", term);
    return `/api/radiografie/furnizori?${p.toString()}`;
  };
  const [initial] = useState(() => readFilters(RADIOGRAFIE_COLUMNS, (k) => address.get(k)));
  const filters = useTableFilters(RADIOGRAFIE_COLUMNS, initial, facetUrl);
  const filtered = Object.values(filters.state).some(isActive);
  const update = (next: FilterState) => { filters.replace(next); setPage(1); };
  const params = filterParams(RADIOGRAFIE_COLUMNS, filters.state, new URLSearchParams({ id: authorityId, sort, dir, page: String(page) }));
  const { data, loading, error, retry } = useEntityTable<Resp>(`/api/radiografie/furnizori?${params.toString()}`);
  const funnel = (key: string, align: "start" | "end" = "start") => (
    <ColumnFilter
      column={RADIOGRAFIE_COLUMNS.find((c) => c.key === key)!}
      value={filters.state[key]}
      onChange={(value: FilterValue | null) => { filters.set(key, value); setPage(1); }}
      facetUrl={(term) => facetUrl(key, filters.state, term)}
      onFacet={(facet) => filters.learn(key, facet)}
      align={align}
    />
  );
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
      <FilterBand columns={RADIOGRAFIE_COLUMNS} state={filters.state} labels={filters.labels} onChange={update} />
      <div className="rv-rank-top">
        <p className="rv-rank-count" role="status">
          {/* Unfiltered, the count is the server's own: only a filtered count waits for the first page. */}
          {loading && !rows.length && filtered ? <><span className="g-sr">Se încarcă furnizorii…</span><Ghost as="span" name="rv-count" wait="client"><G.Line inline w="22ch" /></Ghost></> : <><b>{filtered ? `${formatInt(total)} din ${formatInt(suppliers)}` : formatInt(suppliers)} {suppliers === 1 ? "furnizor" : "furnizori"}</b> · după {LABEL[sort]} {dir === "desc" ? "↓" : "↑"}</>}
        </p>
        <p className="rv-legend" aria-hidden="true"><span><i className="rv-sw-ct" />contracte prin proceduri</span><span><i className="rv-sw-da" />achiziții directe</span></p>
      </div>
      {/* On a phone the columns' order comes from these buttons. */}
      <div className="rv-sortpills" role="group" aria-label="Ordonează furnizorii">
        {(["value", "here", "life", "recs", "name"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={sort === k} onClick={() => sortBy(k)}>{PILL[k]}{sort === k ? (dir === "desc" ? " ↓" : " ↑") : ""}</button>
        ))}
      </div>
      <div className="rv-filterpills" role="group" aria-label="Filtrează furnizorii">
        {RADIOGRAFIE_COLUMNS.map((c) => <span key={c.key} className="rv-filterpill">{c.label}{funnel(c.key)}</span>)}
      </div>
      <div className="rv-rank-wrap" aria-busy={loading}>
        <table className={`rv-rank${stale ? " is-stale" : ""}`} aria-label="Furnizorii autorității">
          <thead>
            <tr>
              <th scope="col" className="c-name" aria-sort={ariaSort("name")}><span className="th-filter">{head("name", "Furnizor")}{funnel("furnizor")}</span></th>
              {/* one column, two sorts: the header reports whichever of the two orders the rows */}
              <th scope="col" className="c-duel" aria-sort={sort === "here" || sort === "life" ? ariaSort(sort) : "none"}>
                <span className="rv-duelhead">
                  <span>{head("here", "← Din autoritate")}</span>
                  <span className="axis" aria-hidden="true" />
                  <span>{head("life", "Cât din câștigurile publice ale firmei vin de aici →")}</span>
                </span>
              </th>
              <th scope="col" className="c-val" aria-sort={ariaSort("value")}><span className="th-filter">{head("value", "Valoare")}{funnel("valoare", "end")}</span></th>
              <th scope="col" className="c-recs" aria-sort={ariaSort("recs")}><span className="th-filter">{head("recs", "Înregistrări")}{funnel("inregistrari", "end")}</span></th>
            </tr>
          </thead>
          {loading && !rows.length && !error ? <SupplierRowsGhost /> : <tbody inert={stale || undefined}>
            {error && <tr><td colSpan={4} className="rv-rank-empty"><span>{error}</span> <button type="button" onClick={retry}>Reîncearcă</button></td></tr>}
            {!loading && !error && rows.length === 0 && (
              <tr><td colSpan={4} className="rv-rank-empty"><span>{filtered ? "Niciun furnizor cu filtrele alese." : "Niciun furnizor."}</span>{filtered && <button type="button" onClick={() => update({})}>Scoate filtrele</button>}</td></tr>
            )}
            {!error && rows.map((r) => (
              <tr key={r.id} aria-selected={selectedId === r.id} onClick={() => onSelect(r)}>
                <td className="c-name"><Link href={`/entitati/${r.id}`} onClick={(e) => e.stopPropagation()}>{shortName(r.name)}</Link></td>
                <td className="c-duel">
                  <button type="button" className="rv-pick" aria-label={`Arată în grafic: ${shortName(r.name)}, ${sharePct(r.shareHere)} din autoritate, ${sharePct(r.shareLife)} din câștigurile publice ale firmei`}
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
          </tbody>}
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
