"use client";

import { formatInt } from "@/lib/format";
import "./pager.css";

/**
 * The one pager of an entity's pages (UX audit Z5-29 and Z5-41, 16 November 2026): the records table, the partners,
 * Radiografie's suppliers and Legături's lists say „‹ anterioare · pagina 2 din 7 · următoare ›”, at the list's left.
 * aria-disabled, not disabled: a focused button keeps the focus while the next page loads.
 */
export default function Pager({ page, pages, busy = false, onPage, label }: {
  page: number; pages: number; busy?: boolean; onPage: (page: number) => void; label: string;
}) {
  if (pages < 2 && page <= 1) return null;
  const go = (n: number) => { if (!busy && n >= 1 && n <= pages) onPage(n); };
  return (
    <nav className="ent-pager" aria-label={label}>
      <button type="button" aria-disabled={busy || page <= 1} onClick={() => go(page - 1)}>‹ anterioare</button>
      <span className="ent-pager-pos">pagina {formatInt(page)} din {formatInt(Math.max(1, pages))}</span>
      <button type="button" aria-disabled={busy || page >= pages} onClick={() => go(page + 1)}>următoare ›</button>
    </nav>
  );
}
