"use client";

import type { UrlTableName } from "@/lib/table-filters/tables";
import ColumnFilter from "./ColumnFilter";
import FilterBand from "./FilterBand";
import { useUrlFilters } from "./useUrlFilters";

/*
 * The funnels and the band of a server-rendered table (owner decision of 4 November 2026): client islands in its
 * header, each reading and writing the address (useUrlFilters), so the page stays a server page.
 */

/** One column's funnel; `label` is drawn before it when the header holds several. */
export function UrlFunnel({ table, column, label, align = "start", scope }: {
  table: UrlTableName; column: string; label?: string; align?: "start" | "end"; scope?: Record<string, string>;
}) {
  const filters = useUrlFilters(table, scope);
  const def = filters.columns.find((c) => c.key === column);
  if (!def) return null;
  return (
    <span className="th-filter">
      {label}
      <ColumnFilter
        column={def}
        value={filters.state[column]}
        onChange={(value) => filters.set(column, value)}
        facetUrl={(term) => filters.facetUrl(column, filters.state, term)}
        onFacet={(facet) => filters.learn(column, facet)}
        align={align}
      />
    </span>
  );
}

/** The applied filters above the table; nothing when none. */
export function UrlFilterBand({ table, scope }: { table: UrlTableName; scope?: Record<string, string> }) {
  const filters = useUrlFilters(table, scope);
  return (
    <div aria-busy={filters.pending || undefined} className={filters.pending ? "tf-band-pending" : undefined}>
      <FilterBand columns={filters.columns} state={filters.state} labels={filters.labels} onChange={filters.replace} />
    </div>
  );
}
