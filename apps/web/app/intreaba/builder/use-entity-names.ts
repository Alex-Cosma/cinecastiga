"use client";

import { useEffect, useRef, useState } from "react";
import { unnamedEntityIds } from "../../../lib/ask/filters/describe";
import type { QueryPopulation } from "../../../lib/ask/population";

/**
 * The names of the institutions and firms an old link's precise selection
 * lists without labels (unnamedEntityIds), for the (?) of its chip: looked up
 * after the draft is drawn (GET /api/entity-names), never before the answer,
 * and once per id. Until they come, or if the lookup fails, the (?) counts them.
 */
export function useEntityNames(population: QueryPopulation | undefined): Readonly<Record<string, string>> {
  const key = unnamedEntityIds(population).join(",");
  const [names, setNames] = useState<Record<string, string>>({});
  // Ids answered (named or not): not asked again.
  const answered = useRef(new Set<string>());
  useEffect(() => {
    const missing = key ? key.split(",").filter((id) => !answered.current.has(id)) : [];
    if (!missing.length) return;
    const ctrl = new AbortController();
    fetch(`/api/entity-names?ids=${missing.join(",")}`, { signal: ctrl.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data: { names?: Record<string, string> } = await response.json();
        if (ctrl.signal.aborted) return;
        for (const id of missing) answered.current.add(id);
        if (data.names && Object.keys(data.names).length) setNames((current) => ({ ...current, ...data.names }));
      })
      .catch(() => { /* The (?) keeps counting; the next draft asks again. */ });
    return () => ctrl.abort();
  }, [key]);
  return names;
}
