"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FloatStatus } from "@/components/ghost/client";
import type { UrlTableName } from "@/lib/table-filters/tables";
import ColumnFilter from "./ColumnFilter";
import FilterBand from "./FilterBand";
import { useUrlFilters } from "./useUrlFilters";

/*
 * The funnels and the band of a server-rendered table (owner decision of 4 November 2026): client islands in its
 * header, each reading and writing the address (useUrlFilters), so the page stays a server page.
 */

/**
 * While a filter of a table outside any PendingRegion waits for the server: the old table stays in place, dimmed (its
 * section, or the table itself), with the floating status (owner, 6 November 2026). Inside a region the region does it.
 */
function useOwnWait(pending: boolean, inRegion: boolean) {
  const ref = useRef<HTMLSpanElement & HTMLDivElement>(null);
  const waiting = pending && !inRegion;
  useEffect(() => {
    const box = waiting ? ref.current?.closest<HTMLElement>("section, table") : null;
    if (!box) return;
    box.classList.add("g-stale");
    box.setAttribute("aria-busy", "true");
    return () => { box.classList.remove("g-stale"); box.removeAttribute("aria-busy"); };
  }, [waiting]);
  return { ref, status: waiting ? createPortal(<FloatStatus>Se încarcă rezultatele…</FloatStatus>, document.body) : null };
}

/** One column's funnel; `label` is drawn before it when the header holds several. */
export function UrlFunnel({ table, column, label, align = "start", scope }: {
  table: UrlTableName; column: string; label?: string; align?: "start" | "end"; scope?: Record<string, string>;
}) {
  const filters = useUrlFilters(table, scope);
  const wait = useOwnWait(filters.pending, filters.inRegion);
  const def = filters.columns.find((c) => c.key === column);
  if (!def) return null;
  return (
    <span className="th-filter" ref={wait.ref}>
      {label}
      <ColumnFilter
        column={def}
        value={filters.state[column]}
        onChange={(value) => filters.set(column, value)}
        facetUrl={(term) => filters.facetUrl(column, filters.state, term)}
        onFacet={(facet) => filters.learn(column, facet)}
        align={align}
      />
      {wait.status}
    </span>
  );
}

/** The applied filters above the table; nothing when none. */
export function UrlFilterBand({ table, scope }: { table: UrlTableName; scope?: Record<string, string> }) {
  const filters = useUrlFilters(table, scope);
  const wait = useOwnWait(filters.pending, filters.inRegion);
  return (
    <div ref={wait.ref}>
      <FilterBand columns={filters.columns} state={filters.state} labels={filters.labels} onChange={filters.replace} />
      {wait.status}
    </div>
  );
}
