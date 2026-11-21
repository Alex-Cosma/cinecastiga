"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { formatRon} from "@/lib/format";
import { titleName } from "../../../lib/tidy-name";
import { useTip } from "../../intreaba/use-tip";
import type { Partner } from "@/lib/marts";
import { useEntityTable } from "./useEntityTable";
import { consortiumRankingNote } from "@/lib/consortium";
import Term from "@/components/Term";
import { G, Ghost, rankWidth } from "@/components/ghost/Ghost";
import { FloatStatus } from "@/components/ghost/client";
import Pager from "./Pager";
import TableLink from "./TableLink";
import { countWords, wholeShare } from "@/lib/ask/answer-text";

/**
 * "Principalele autorități / Principalii furnizori" — paginated counterparty
 * list (10/page, both channels, winner-split basis); each row's records open in the table below, on this page (UX audit
 * Z5-12, 16 November 2026: no longer Întreabă's drawer, which the table's head still offers).
 * Another page keeps the shown rows in place, dimmed, under a floating status (owner, 6 November 2026); ghost rows only
 * when there are none to keep (a retry after an error).
 */

interface Resp {
  ok: boolean;
  rows?: Partner[];
  total?: number;
  error?: string;
}

export default function PartnersTable({
  entityId,
  role,
  isAuth,
  initial,
}: {
  entityId: string;
  /** Kept for the callers; the rows no longer build Întreabă links. */
  entityName?: string;
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
        {stale ? countWords(shownTotal, "partener", "parteneri") : loading ? "Se încarcă partenerii…" : error ? "Partenerii nu au putut fi încărcați." : countWords(total, "partener", "parteneri")}
      </p>
      {loading && rows.length === 0 ? <PartnersGhost /> :
      <div className={`bars ent-partners${paged ? " is-paged" : ""}${stale ? " g-stale" : ""}`} aria-busy={loading} inert={stale || undefined} data-chart>
        {error && <p className="county">{error} <button type="button" onClick={retry}>Reîncearcă</button></p>}
        {!loading && !error && rows.length === 0 && <p className="county">Niciun partener înregistrat.</p>}
        {!error && rows.map((p, i) => (
          <div className="bar-row ent-tip" key={p.partnerId}>
            <div className="bar-label" {...tip.bindClip(titleName(p.partnerName))}>
              {p.partnerId !== "0" ? <Link prefetch={false} href={`/entitati/${p.partnerId}`}>{p.partnerName ? titleName(p.partnerName) : `Entitate #${p.partnerId}`}</Link> : <span>Partener neidentificat</span>}
              {/* Beside the name, not in the value column, so every row's bar and value stay aligned (owner, 4 November 2026). */}
              {p.nConsortium > 0 && <Term tip hold="box" title="În consorțiu" text={consortiumRankingNote(p.nConsortium)} className="cons-tag">în consorțiu</Term>}
            </div>
            <div className="bar-track">
              <div className="bar-fill cm-x" style={{ width: `${Math.min(100, p.pct * 100)}%`, "--i": i } as CSSProperties} />
            </div>
            <div className="bar-val">
              <span className="v">{formatRon(p.totalRon)} · {wholeShare(p.pct)}</span>
            </div>
            <div className="bar-go">
              {/* The partner's records in the table below, on this page (UX audit Z5-12); one word for them (Z5-07). */}
              {p.partnerId !== "0" ? (
                <TableLink href={`?${isAuth ? "furnizor" : "autoritate"}=${p.partnerId}#achizitii`} filter={{ partener: { kind: "pick", values: [p.partnerId] } }}>
                  {countWords(p.n, "înregistrare", "înregistrări")} →
                </TableLink>
              ) : (
                <span className="county">{countWords(p.n, "înregistrare", "înregistrări")}</span>
              )}
            </div>
          </div>
        ))}
      </div>}
      {stale && <FloatStatus>Se încarcă partenerii…</FloatStatus>}
      <Pager page={page} pages={pages} busy={loading} onPage={turn} label="Paginile partenerilor" />
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
