"use client";

import { useEffect, useMemo, useState } from "react";
import { useTableFilters } from "../../components/table-filters/useTableFilters";
import { createLatestRequest } from "../../lib/latest-request";
import { encodeSpec } from "../../lib/ask/permalink";
import { SCATTER_LIST_PAGE_SIZE, scatterListColumns } from "../../lib/ask/scatter-list-columns";
import type { ScatterData, ScatterListRow } from "../../lib/ask/scatter-shared";
import { filterParams, isActive } from "../../lib/table-filters/codec";
import type { FilterState } from "../../lib/table-filters/types";
import type { AskSpec } from "../../lib/ask/spec";
import { listTotal, type AnyListRow } from "./scatter-answer";

/**
 * The risk map's list (owner, 19 November 2026, variant B): the whole list, 10 a page, a funnel on each column, read
 * from the server a page at a time (/api/ask/scatter-list). Page 1 without filters is the answer's own first rows, so
 * nothing is asked until the reader turns a page or filters. A stored scatter-2 keeps the rows it was stored with:
 * they are paged in the browser, without funnels. The filters and the page are the screen's, not the question's: a
 * link carries the question alone.
 */
interface PageAnswer { url: string; rows: ScatterListRow[]; total: number; all: number; page: number }

export function useScatterList(spec: AskSpec, data: ScatterData) {
  const server = data.version !== 2 && !data.group.small;
  const columns = useMemo(() => scatterListColumns(data.role), [data.role]);
  const base = useMemo(() => `/api/ask/scatter-list?spec=${encodeURIComponent(encodeSpec(spec))}`, [spec]);
  const facetUrl = (key: string, state: FilterState, term = "") => {
    const p = filterParams(columns, state, new URLSearchParams({ optiuni: key }));
    if (term) p.set("cauta", term);
    return `${base}&${p.toString()}`;
  };
  const filters = useTableFilters(columns, {}, facetUrl, { address: false });
  const [page, setPage] = useState(1);
  const filtered = Object.values(filters.state).some(isActive);
  // Another answer (the strip's order or signal, another question): its own list, from the start.
  const [answered, setAnswered] = useState(data);
  if (answered !== data) { setAnswered(data); setPage(1); if (filtered) filters.replace({}); }

  const own = page === 1 && !filtered;
  const url = server && !own ? `${base}&${filterParams(columns, filters.state, new URLSearchParams({ pagina: String(page) })).toString()}` : null;
  const [requests] = useState(createLatestRequest);
  const [answer, setAnswer] = useState<PageAnswer | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (url === null) return;
    setFailed(null);
    return requests.run(async (signal) => {
      const response = await fetch(url, { signal });
      const body = await response.json() as { ok: boolean; rows?: ScatterListRow[]; total?: number; all?: number; page?: number; error?: string };
      if (!body.ok || !body.rows) throw new Error(body.error ?? "list");
      return { url, rows: body.rows, total: body.total ?? 0, all: body.all ?? 0, page: body.page ?? 1 };
    }, setAnswer, (error) => { console.error("scatter list", url, error); setFailed(url); });
  }, [requests, url, attempt]);

  const all = listTotal(data);
  if (!server) {
    // The stored rows (or a small group's whole list), paged here.
    const rows: readonly AnyListRow[] = data.list, pages = Math.max(1, Math.ceil(rows.length / SCATTER_LIST_PAGE_SIZE)), at = Math.min(page, pages);
    return { server, columns, filters, facetUrl, page: at, pages, setPage, rows: rows.slice((at - 1) * SCATTER_LIST_PAGE_SIZE, at * SCATTER_LIST_PAGE_SIZE),
      total: rows.length, all: rows.length, filtered: false, loading: false, error: false, retry: () => undefined };
  }
  const fresh = url !== null && answer?.url === url ? answer : null;
  // While a page is on its way the last rows stay (the answer's own at first), so the list never empties.
  const rows: readonly AnyListRow[] = own ? data.list.slice(0, SCATTER_LIST_PAGE_SIZE) : fresh?.rows ?? answer?.rows ?? data.list.slice(0, SCATTER_LIST_PAGE_SIZE);
  const total = own ? all : fresh?.total ?? answer?.total ?? all;
  const at = own ? 1 : fresh?.page ?? page;
  return { server, columns, filters, facetUrl, page: at, pages: Math.max(1, Math.ceil(total / SCATTER_LIST_PAGE_SIZE)), setPage, rows, total, all,
    filtered, loading: url !== null && !fresh && failed !== url, error: url !== null && failed === url, retry: () => setAttempt((n) => n + 1) };
}

export type ScatterList = ReturnType<typeof useScatterList>;
