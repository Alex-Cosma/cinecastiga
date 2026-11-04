"use client";

import { useEffect, useState } from "react";
import { createLatestRequest } from "@/lib/latest-request";
import type { Facet } from "@/lib/table-filters/types";

/**
 * A funnel's options, asked only while it is open (`url` null when closed). The last answer stays shown while a
 * new one (a search, another filter) is on its way; only the latest request may answer.
 */
export function useFacet(url: string | null) {
  const [requests] = useState(createLatestRequest);
  const [answer, setAnswer] = useState<{ url: string; facet: Facet | null; error: boolean } | null>(null);
  useEffect(() => {
    if (url === null) return;
    return requests.run(async (signal) => {
      const response = await fetch(url, { signal });
      const data = await response.json() as { ok: boolean; facet?: Facet };
      if (!response.ok || !data.ok || !data.facet) throw new Error("facet");
      return data.facet;
    }, (facet) => setAnswer({ url, facet, error: false }), (error) => {
      // The reader gets a plain sentence; the technical cause stays in the console.
      console.error("table facet", url, error);
      setAnswer((last) => ({ url, facet: last?.facet ?? null, error: true }));
    });
  }, [requests, url]);
  return { facet: url === null ? null : answer?.facet ?? null, loading: url !== null && answer?.url !== url, error: answer?.url === url && answer.error };
}
