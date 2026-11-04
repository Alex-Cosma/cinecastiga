"use client";

import { useMemo, useState } from "react";
import { activeOnly, withValue } from "@/lib/table-filters/codec";
import type { Labels } from "@/lib/table-filters/describe";
import { filterRows, memoryFacet, type Readers } from "@/lib/table-filters/memory";
import type { Facet, FilterState, FilterValue, TableColumns } from "@/lib/table-filters/types";

/**
 * A table's column filters over rows the browser already holds (the admin's journal and proxies): the state, the rows
 * it keeps, each funnel's facet counted in place, and the names of the chosen values from `labelOf`. `source` may
 * depend on the filters (the journal reads its separate list of failures when only failures are asked for), and on
 * the funnel being counted (the proxies' state funnel counts the retired ones the table leaves out until chosen).
 */
export function useMemoryFilters<R>(
  columns: TableColumns,
  source: readonly R[] | ((state: FilterState, funnel?: string) => readonly R[]),
  readers: Readers<R>,
  labelOf?: (key: string, value: string) => string | undefined,
) {
  const [state, setState] = useState<FilterState>({});
  const rows = typeof source === "function" ? source(state) : source;
  const kept = useMemo(() => filterRows(readers, rows, state), [readers, rows, state]);
  const labels = useMemo<Labels>(() => Object.fromEntries(columns.map((c) => {
    const value = state[c.key];
    const values = value && (value.kind === "options" || value.kind === "pick") ? value.values : [];
    return [c.key, Object.fromEntries(values.map((v) => [v, c.labels?.[v] ?? labelOf?.(c.key, v) ?? v]))];
  })), [columns, state, labelOf]);
  const facet = (key: string, term: string): Facet =>
    memoryFacet(columns, readers, typeof source === "function" ? source(state, key) : source, key, state, { term, labelOf: (v) => labelOf?.(key, v) });
  return {
    state,
    rows: kept,
    labels,
    facet,
    set: (key: string, value: FilterValue | null) => setState((s) => withValue(s, key, value)),
    replace: (next: FilterState) => setState(activeOnly(next)),
  };
}
