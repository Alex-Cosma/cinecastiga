"use client";

import { useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { filterParams, readFilters, withValue, writeFilters } from "@/lib/table-filters/codec";
import { URL_TABLES, type UrlTableName } from "@/lib/table-filters/tables";
import type { FilterState, FilterValue } from "@/lib/table-filters/types";
import { usePendingRegion } from "@/components/ghost/client";
import { useFacetNames } from "./useFacetNames";

/**
 * A server-rendered table's column filters: the address is the state. A change replaces the address (no scroll, the
 * page number dropped) and the server draws the rows again; `pending` while it does. `scope` holds the fixed
 * parameters a funnel's request needs (the notice whose records these are). Inside a PendingRegion (the table's
 * section, with its pager and links) the change is the region's: the whole table stays in place dimmed, with the
 * floating status; elsewhere the hook keeps its own transition (`inRegion` false) and UrlFilters dims the table itself.
 */
export function useUrlFilters(table: UrlTableName, scope: Readonly<Record<string, string>> = {}) {
  const { columns, endpoint, reset } = URL_TABLES[table];
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const region = usePendingRegion();
  const [ownPending, startTransition] = useTransition();
  const search = params.toString();
  const state = useMemo(() => readFilters(columns, (k) => params.get(k)), [columns, search]); // eslint-disable-line react-hooks/exhaustive-deps -- `params` changes with `search`
  const facetUrl = (key: string, current: FilterState, term = "") => {
    const p = filterParams(columns, current, new URLSearchParams({ ...scope, optiuni: key }));
    if (term) p.set("cauta", term);
    return `${endpoint}?${p.toString()}`;
  };
  const { labels, learn } = useFacetNames(columns, state, facetUrl);
  const replace = (next: FilterState) => {
    const kept = new URLSearchParams(search);
    for (const key of reset) kept.delete(key);
    const query = writeFilters(columns, kept.toString(), next);
    const href = `${pathname}${query}`;
    if (region) region.go(href, { replace: true, scroll: false });
    else startTransition(() => router.replace(href, { scroll: false }));
  };
  return {
    columns,
    state,
    labels,
    learn,
    pending: region ? region.pending : ownPending,
    inRegion: region !== null,
    facetUrl,
    set: (key: string, value: FilterValue | null) => replace(withValue(state, key, value)),
    replace,
  };
}
