"use client";

import { useState } from "react";
import Link from "next/link";
import type { SplitPair } from "@/lib/marts";
import { cleanName, formatInt, formatRon } from "@/lib/format";
import { useEntityTable } from "./useEntityTable";

type Response = { ok: boolean; rows: SplitPair[]; total: number; page: number; error?: string };

export default function SplitPairsTable({ entityId, isAuth }: { entityId: string; isAuth: boolean }) {
  const [requestedPage, setPage] = useState(1);
  const { data, loading, error, retry } = useEntityTable<Response>(
    `/api/entity-splits?id=${entityId}&rol=${isAuth ? "autoritate" : "furnizor"}&page=${requestedPage}`,
  );
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const pages = Math.max(1, Math.ceil(total / 10));
  return (
    <div className="split-pairs">
      <p className="split-pairs-status" role="status">
        {loading ? "Se încarcă grupurile…" : error ? "Lista nu a putut fi încărcată." :
          total ? `${formatInt((page - 1) * 10 + 1)}–${formatInt(Math.min(page * 10, total))} din ${formatInt(total)} grupuri · ordonate după valoarea totală` : "Niciun grup disponibil."}
      </p>
      {error && <p className="split-pairs-status" role="alert">{error} <button type="button" className="btn" onClick={retry}>Reîncearcă</button></p>}
      <div className="split-pairs-scroll" role="region" aria-label="Grupuri de achiziții sub prag" tabIndex={0} aria-busy={loading}>
        <table className="rank">
          <thead><tr><th scope="col">{isAuth ? "Furnizor" : "Autoritate"}</th><th scope="col">An</th><th scope="col">Achiziții</th><th scope="col" className="num">Total vs prag</th></tr></thead>
          <tbody>
            {loading ? Array.from({ length: 10 }, (_, i) => <tr className="split-pairs-placeholder" key={i} aria-hidden="true"><td colSpan={4}><span /></td></tr>) : !error && data?.rows.map(s => (
              <tr key={s.flagId}>
                <td>{s.partnerId ? <Link prefetch={false} href={`/entitati/${s.partnerId}`}>{cleanName(s.partnerName)}</Link> : (s.partnerName ?? "—")}</td>
                <td>{s.year}<div className="county">CPV {s.cpvClass ?? "—"} · {s.purchaseType ?? "tip necunoscut"}</div></td>
                <td><a href={`/semnale/${s.flagId}`} target="_blank" rel="noopener noreferrer" title="Deschide lista achizițiilor (tab nou)">{s.count} ↗</a></td>
                <td className="num">{formatRon(s.totalRon)} <span className="county">· {(s.totalRon / s.ceiling).toFixed(1).replace(".", ",")}× pragul de {formatInt(s.ceiling)} lei</span></td>
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
