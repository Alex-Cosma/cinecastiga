"use client";

import { useCallback, useEffect, useState } from "react";
import type { Labels } from "@/lib/table-filters/describe";
import type { Facet, FilterState, TableColumns } from "@/lib/table-filters/types";
import { createLatestRequest } from "@/lib/latest-request";

/**
 * The names of a table's chosen values, so a chip says „ROTACO”, not its id: learned from every funnel's answer, and
 * for a value that arrives with the address before its funnel was opened, asked from that funnel once (the server puts
 * the chosen values first). A column's fixed labels need no asking.
 */
export function useFacetNames(columns: TableColumns, state: FilterState, facetUrl: (key: string, state: FilterState) => string) {
  const [labels, setLabels] = useState<Labels>({});
  const learn = useCallback((key: string, facet: Facet) => {
    if (facet.kind !== "options" && facet.kind !== "pick") return;
    setLabels((known) => ({ ...known, [key]: { ...known[key], ...Object.fromEntries(facet.options.map((o) => [o.value, o.label])) } }));
  }, []);

  const [requests] = useState(createLatestRequest);
  const unnamed = columns.filter((c) => {
    const value = state[c.key];
    return (value?.kind === "pick" || value?.kind === "options") && value.values.some((v) => !c.labels?.[v] && !labels[c.key]?.[v]);
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

  return { labels, learn };
}
