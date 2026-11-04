"use client";

import { useEffect, useState } from "react";
import { activeOnly, withValue, writeFilters } from "@/lib/table-filters/codec";
import type { FilterState, FilterValue, TableColumns } from "@/lib/table-filters/types";
import { useFacetNames } from "./useFacetNames";

/**
 * A client table's column filters: the state in the browser, mirrored in the address (it can be reloaded or sent; the
 * page's other parameters stay), and the names of the chosen values. A table that shares its page with another one
 * using the same parameters keeps its filters out of the address (`address: false`). A server-rendered table uses
 * useUrlFilters instead.
 */
export function useTableFilters(
  columns: TableColumns,
  initial: FilterState,
  facetUrl: (key: string, state: FilterState) => string,
  { address = true }: { address?: boolean } = {},
) {
  const [state, setState] = useState<FilterState>(() => activeOnly(initial));
  const { labels, learn } = useFacetNames(columns, state, facetUrl);

  useEffect(() => {
    if (!address) return;
    const search = writeFilters(columns, window.location.search, state);
    if (search !== window.location.search) history.replaceState(history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
  }, [address, columns, state]);

  return {
    state,
    labels,
    learn,
    set: (key: string, value: FilterValue | null) => setState((s) => withValue(s, key, value)),
    replace: (next: FilterState) => setState(activeOnly(next)),
    clearAll: () => setState({}),
  };
}

export type TableFilters = ReturnType<typeof useTableFilters>;
