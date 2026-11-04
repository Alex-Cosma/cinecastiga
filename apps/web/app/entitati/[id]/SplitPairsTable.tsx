"use client";

import { useState } from "react";
import Link from "next/link";
import type { SplitPair } from "@/lib/entity-splits";
import { splitColumns } from "@/lib/entity-splits-columns";
import { cleanName, formatInt, formatRon } from "@/lib/format";
import { filterParams, isActive } from "@/lib/table-filters/codec";
import type { FilterState, FilterValue } from "@/lib/table-filters/types";
import ColumnFilter from "@/components/table-filters/ColumnFilter";
import FilterBand from "@/components/table-filters/FilterBand";
import { useTableFilters } from "@/components/table-filters/useTableFilters";
import { useEntityTable } from "./useEntityTable";

type Response = { ok: boolean; rows: SplitPair[]; total: number; page: number; error?: string };

/**
 * The repeated-purchases groups of an entity, in its signal card: 10 a page, largest total first, filtered by the
 * column funnels (owner, 4 November 2026). The records table below uses the same address parameters, so these
 * filters stay out of the address.
 */
export default function SplitPairsTable({ entityId, isAuth }: { entityId: string; isAuth: boolean }) {
  const columns = splitColumns(isAuth);
  const rol = isAuth ? "autoritate" : "furnizor";
  const [requestedPage, setPage] = useState(1);
  const facetUrl = (key: string, state: FilterState, term = "") => {
    const p = filterParams(columns, state, new URLSearchParams({ id: entityId, rol, optiuni: key }));
    if (term) p.set("cauta", term);
    return `/api/entity-splits?${p.toString()}`;
  };
  const filters = useTableFilters(columns, {}, facetUrl, { address: false });
  const filtered = Object.values(filters.state).some(isActive);
  const update = (next: FilterState) => { filters.replace(next); setPage(1); };
  const params = filterParams(columns, filters.state, new URLSearchParams({ id: entityId, rol, page: String(requestedPage) }));
  const { data, loading, error, retry } = useEntityTable<Response>(`/api/entity-splits?${params.toString()}`);
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const pages = Math.max(1, Math.ceil(total / 10));
  const funnel = (key: string, align: "start" | "end" = "start") => (
    <ColumnFilter
      column={columns.find((c) => c.key === key)!}
      value={filters.state[key]}
      onChange={(value: FilterValue | null) => { filters.set(key, value); setPage(1); }}
      facetUrl={(term) => facetUrl(key, filters.state, term)}
      onFacet={(facet) => filters.learn(key, facet)}
      align={align}
    />
  );
  return (
    <div className="split-pairs">
      <FilterBand columns={columns} state={filters.state} labels={filters.labels} onChange={update} />
      <p className="split-pairs-status" role="status">
        {loading ? "Se încarcă grupurile…" : error ? "Lista nu a putut fi încărcată." :
          total ? `${formatInt((page - 1) * 10 + 1)}–${formatInt(Math.min(page * 10, total))} din ${formatInt(total)} grupuri · ordonate după valoarea totală`
            : filtered ? "Niciun grup cu filtrele alese." : "Niciun grup disponibil."}
        {!loading && !error && !total && filtered && <> <button type="button" className="btn" onClick={() => update({})}>Scoate filtrele</button></>}
      </p>
      {error && <p className="split-pairs-status" role="alert">{error} <button type="button" className="btn" onClick={retry}>Reîncearcă</button></p>}
      <div className="split-pairs-scroll" role="region" aria-label="Grupuri de achiziții sub prag" tabIndex={0} aria-busy={loading}>
        <table className="rank split-pairs-table">
          <thead><tr>
            <th scope="col"><span className="th-filter">{isAuth ? "Furnizor" : "Autoritate"}{funnel("partener")}</span></th>
            <th scope="col"><span className="th-filter">An{funnel("an")}<span className="th-sep" aria-hidden="true">·</span>Tip{funnel("tip")}</span></th>
            <th scope="col"><span className="th-filter">Achiziții{funnel("achizitii")}</span></th>
            <th scope="col" className="num"><span className="th-filter">Total vs prag{funnel("total", "end")}</span></th>
          </tr></thead>
          <tbody>
            {loading ? Array.from({ length: 10 }, (_, i) => <tr className="split-pairs-placeholder" key={i} aria-hidden="true"><td colSpan={4}><span /></td></tr>) : !error && data?.rows.map(s => (
              <tr key={s.flagId}>
                <td className="c-party">{s.partnerId ? <Link prefetch={false} href={`/entitati/${s.partnerId}`}>{cleanName(s.partnerName)}</Link> : (s.partnerName ?? "—")}</td>
                <td className="c-year">{s.year}<div className="county">CPV {s.cpvClass ?? "—"} · {s.purchaseType ?? "tip necunoscut"}</div></td>
                <td className="c-count" data-label="Achiziții"><Link prefetch={false} href={`/semnale/${s.flagId}`} title="Deschide lista achizițiilor">{s.count} →</Link></td>
                <td className="num c-total">{formatRon(s.totalRon)} <span className="county">· {(s.totalRon / s.ceiling).toFixed(1).replace(".", ",")}× pragul de {formatInt(s.ceiling)} lei</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && <nav className="pager" aria-label="Paginarea grupurilor sub prag">
        <button type="button" disabled={loading || Boolean(error) || page <= 1} onClick={() => setPage(page - 1)}>← Anterior</button>
        <span className="note">Pagina {formatInt(page)} din {formatInt(pages)}</span>
        <button type="button" disabled={loading || Boolean(error) || page >= pages} onClick={() => setPage(page + 1)}>Următor →</button>
      </nav>}
    </div>
  );
}
