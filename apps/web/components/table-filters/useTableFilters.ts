"use client";

import { useCallback, useEffect, useState } from "react";
import { activeOnly, withValue, writeFilters } from "@/lib/table-filters/codec";
import type { Labels } from "@/lib/table-filters/describe";
import type { Facet, FilterState, FilterValue, TableColumns } from "@/lib/table-filters/types";
import { createLatestRequest } from "@/lib/latest-request";

/**
 * A table's column filters in the browser: the state, kept in the address (it can be reloaded or sent; the page's
 * other parameters stay), and the names learned from the funnels' answers, so a chip says „ROTACO”, not its id. A
 * value that arrives with the address, before its funnel has been opened, is named by asking that funnel once.
 */
export function useTableFilters(columns: TableColumns, initial: FilterState, facetUrl: (key: string, state: FilterState) => string) {
  const [state, setState] = useState<FilterState>(() => activeOnly(initial));
  const [labels, setLabels] = useState<Labels>({});

  useEffect(() => {
    const search = writeFilters(columns, window.location.search, state);
    if (search !== window.location.search) history.replaceState(history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
  }, [columns, state]);

  const learn = useCallback((key: string, facet: Facet) => {
    if (facet.kind !== "options" && facet.kind !== "pick") return;
    setLabels((known) => ({ ...known, [key]: { ...known[key], ...Object.fromEntries(facet.options.map((o) => [o.value, o.label])) } }));
  }, []);

  // A pick value from the address is named by its funnel (the server puts the chosen values first).
  const [requests] = useState(createLatestRequest);
  const unnamed = columns.filter((c) => {
    const value = state[c.key];
    return c.kind === "pick" && value?.kind === "pick" && value.values.some((v) => !labels[c.key]?.[v]);
  }).map((c) => c.key);
  const unnamedKey = unnamed.join(",");
  useEffect(() => {
    const key = unnamedKey.split(",")[0];
    if (!key) return;
    return requests.run(async (signal) => {
      const response = await fetch(facetUrl(key, state), { signal });
      const data = await response.json() as { ok: boolean; facet?: Facet };
      if (!data.ok || !data.facet) throw new Error("facet");
      return data.facet;
    }, (facet) => learn(key, facet), () => {
      // A name it cannot get stays the stored value; the filter itself still applies.
      setLabels((known) => ({ ...known, [key]: { ...known[key], ...Object.fromEntries((state[key] as { values: string[] }).values.map((v) => [v, known[key]?.[v] ?? v])) } }));
    });
  }, [unnamedKey]); // eslint-disable-line react-hooks/exhaustive-deps -- `state` and `facetUrl` are read when the unnamed set changes

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
