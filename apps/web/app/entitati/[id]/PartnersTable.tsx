"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { formatRon, formatInt, cleanName } from "@/lib/format";
import { encodeSpec } from "@/lib/ask/permalink";
import { pairSpec } from "@/lib/ask/site-links";
import { useTip } from "../../intreaba/use-tip";
import type { Partner } from "@/lib/marts";
import { useEntityTable } from "./useEntityTable";
import { consortiumRankingNote } from "@/lib/consortium";
import Term from "@/components/Term";
import { G, Ghost, rankWidth } from "@/components/ghost/Ghost";
import { FloatStatus } from "@/components/ghost/client";

/**
 * "Principalele autorități / Principalii furnizori" — paginated counterparty
 * list (10/page, both channels, winner-split basis) with a per-row deep link
 * into the search drill: exact ids + names, all sources, rows auto-opened.
 * Another page keeps the shown rows in place, dimmed, under a floating status (owner, 6 November 2026); ghost rows only
 * when there are none to keep (a retry after an error).
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
  return `/?spec=${encodeURIComponent(encodeSpec(pairSpec(authority, supplier)))}&drill=1`;
}

export default function PartnersTable({
  entityId,
  entityName,
  role,
  isAuth,
  initial,
}: {
  entityId: string;
  entityName: string;
  role: "furnizor" | "autoritate";
  isAuth: boolean;
  /** Page 1 as rendered by the server (also feeds "Pe scurt"), so it is not fetched twice. */
  initial?: { rows: Partner[]; total: number };
}) {
  const [page, setPage] = useState(1);
  // Another page's rows are new: they enter shorter and together (owner, 6 November 2026); the first page's bars grow
  // top to bottom when the list first comes into view.
  const [paged, setPaged] = useState(false);
  const turn = (to: number) => { setPaged(true); setPage(to); };
  const tip = useTip();
  const urlFor = (n: number) => `/api/entity-partners?${new URLSearchParams({ id: entityId, rol: role, page: String(n) }).toString()}`;
  const [first] = useState(() => (initial ? { url: urlFor(1), data: { ok: true, rows: initial.rows, total: initial.total } as Resp } : undefined));
  const { data, loading, error, retry } = useEntityTable<Resp>(urlFor(page), first);

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 10));
  const rows = data?.rows ?? [];
  const stale = loading && rows.length > 0;
  // The count keeps its words while another page loads: they do not change with the page.
  const [shownTotal, setShownTotal] = useState(total);
  if (!loading && total !== shownTotal) setShownTotal(total);

  return (
    <div>
      {tip.el}
      <p className={`hint${stale ? " g-stale" : ""}`} role="status">
        {stale ? <>{formatInt(shownTotal)} parteneri · ambele canale</> : loading ? "Se încarcă partenerii…" : error ? "Partenerii nu au putut fi încărcați." : <>{formatInt(total)} parteneri · ambele canale</>}
      </p>
      {loading && rows.length === 0 ? <PartnersGhost /> :
      <div className={`bars ent-partners${paged ? " is-paged" : ""}${stale ? " g-stale" : ""}`} aria-busy={loading} inert={stale || undefined} data-chart>
        {error && <p className="county">{error} <button type="button" onClick={retry}>Reîncearcă</button></p>}
        {!loading && !error && rows.length === 0 && <p className="county">Niciun partener înregistrat.</p>}
        {!error && rows.map((p, i) => (
          <div className="bar-row ent-tip" key={p.partnerId}>
            <div className="bar-label" {...tip.bindClip(cleanName(p.partnerName))}>
              {p.partnerId !== "0" ? <Link href={`/entitati/${p.partnerId}`}>{p.partnerName ? cleanName(p.partnerName) : `Entitate #${p.partnerId}`}</Link> : <span>Partener neidentificat</span>}
              {/* Beside the name, not in the value column, so every row's bar and value stay aligned (owner, 4 November 2026). */}
              {p.nConsortium > 0 && <Term tip title="În consorțiu" text={consortiumRankingNote(p.nConsortium)} className="cons-tag">în consorțiu</Term>}
            </div>
            <div className="bar-track">
              <div className="bar-fill cm-x" style={{ width: `${Math.min(100, p.pct * 100)}%`, "--i": i } as CSSProperties} />
            </div>
            <div className="bar-val">
              <span className="v">{formatRon(p.totalRon)} · {Math.round(p.pct * 100)}%</span>
            </div>
            <div className="bar-go">
              {p.partnerId !== "0" && p.partnerName ? (
                <a
                  href={pairSearchUrl(
                    { id: entityId, name: entityName },
                    { id: p.partnerId, name: p.partnerName },
                    isAuth,
                  )}
                >
                  {formatInt(p.n)} {p.n === 1 ? "tranzacție" : "tranzacții"} →
                </a>
              ) : (
                <span className="county">{formatInt(p.n)} {p.n === 1 ? "tranzacție" : "tranzacții"}</span>
              )}
            </div>
          </div>
        ))}
      </div>}
      {stale && <FloatStatus>Se încarcă partenerii…</FloatStatus>}
      {pages > 1 && (
        <div className="pager">
          {/* aria-disabled, not disabled: the focused button keeps the focus while the next page loads */}
          <button type="button" aria-disabled={loading || page <= 1} onClick={() => { if (!loading && page > 1) turn(page - 1); }}>
            ← Anterior
          </button>
          <span className="note">
            Pagina {page} din {formatInt(pages)}
          </span>
          <button type="button" aria-disabled={loading || page >= pages} onClick={() => { if (!loading && page < pages) turn(page + 1); }}>
            Următor →
          </button>
        </div>
      )}
    </div>
  );
}

/** Ten rows of the list before its first answer: the real row, label, track and value classes. Shown after 120 ms. */
function PartnersGhost() {
  return (
    <Ghost className="bars ent-partners" name="entity-partners" wait="client">
      <G.Rows n={10} as="div" className="bar-row" cells={(i) => <>
        <div className="bar-label"><G.Line w={rankWidth(i, 86, 5, 48)} /></div>
        <div className="bar-track g-quiet" />
        <div className="bar-val"><G.Line w="96px" inline /></div>
        <div className="bar-go"><G.Line w="88px" inline /></div>
      </>} />
    </Ghost>
  );
}
