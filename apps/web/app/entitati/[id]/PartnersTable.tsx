"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatRon, formatInt, cleanName } from "@/lib/format";
import { encodeSpec } from "@/lib/ask/permalink";
import { useTip } from "../../intreaba/blocks";
import type { Partner } from "@/lib/marts";

/**
 * "Principalele autorități / Principalii furnizori" — paginated counterparty
 * list (10/page, both channels, winner-split basis) with a per-row deep link
 * into the search drill: exact ids + names, all sources, rows auto-opened.
 */

interface Resp {
  ok: boolean;
  rows?: Partner[];
  total?: number;
  error?: string;
}

function pairSearchUrl(
  self: { id: string; name: string },
  partner: { id: string; name: string | null },
  isAuth: boolean,
): string {
  const authority = isAuth ? self : { id: partner.id, name: cleanName(partner.name) };
  const supplier = isAuth ? { id: partner.id, name: cleanName(partner.name) } : self;
  const spec = {
    block: "stat",
    measure: "value",
    filters: {
      authorityName: authority.name,
      supplierName: supplier.name,
      authorityId: Number(authority.id),
      supplierId: Number(supplier.id),
    },
  };
  return `/?spec=${encodeURIComponent(encodeSpec(spec))}&drill=1`;
}

export default function PartnersTable({
  entityId,
  entityName,
  role,
  isAuth,
}: {
  entityId: string;
  entityName: string;
  role: "furnizor" | "autoritate";
  isAuth: boolean;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const tip = useTip();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/entity-partners?id=${entityId}&rol=${role}&page=${page}`);
      setData((await r.json()) as Resp);
    } catch (e) {
      setData({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  }, [entityId, role, page]);
  useEffect(() => {
    void load();
  }, [load]);

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 10));

  return (
    <div>
      {tip.el}
      <p className="hint">
        {formatInt(total)} parteneri · ambele canale (directe + contracte) · fiecare rând se
        deschide în căutare cu filtrele puse.
        {loading && data && <span className="tx-upd"> se actualizează…</span>}
      </p>
      <div className={`bars${loading && data ? " tx-loading" : ""}`}>
        {!data &&
          loading &&
          Array.from({ length: 10 }, (_, i) => (
            <div className="bar-row tx-ghost" key={`g-${i}`}>
              <div className="bar-label">
                <span className="gh" />
              </div>
              <div className="bar-track" />
              <div className="bar-val">
                <span className="gh" />
              </div>
            </div>
          ))}
        {!loading && data?.ok === false && <p className="county">{data.error}</p>}
        {data?.rows?.map((p) => (
          <div className="bar-row" key={p.partnerId}>
            <div className="bar-label" {...tip.bindClip(cleanName(p.partnerName))}>
              <Link href={`/entitati/${p.partnerId}`}>{cleanName(p.partnerName)}</Link>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${Math.min(100, p.pct * 100)}%` }} />
            </div>
            <div className="bar-val">
              {formatRon(p.totalRon)} · {Math.round(p.pct * 100)}%
            </div>
            <div className="bar-go">
              {p.partnerId !== "0" && p.partnerName ? (
                <a
                  href={pairSearchUrl(
                    { id: entityId, name: entityName },
                    { id: p.partnerId, name: p.partnerName },
                    isAuth,
                  )}
                  target="_blank"
                  rel="noopener"
                >
                  {formatInt(p.n)} tranzacții ↗
                </a>
              ) : (
                <span className="county">{formatInt(p.n)} tranzacții</span>
              )}
            </div>
          </div>
        ))}
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
