"use client";

import { useEffect, useState } from "react";
import { createLatestRequest } from "@/lib/latest-request";

/** The previous response supplies stable controls, but never selectable stale rows. */
export function useEntityTable<T extends { ok: boolean; error?: string }>(url: string) {
  const [latest] = useState(createLatestRequest);
  const [pending, setPending] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ url: string; data: T | null; error: string | null } | null>(null);
  useEffect(() => {
    setPending(true);
    return latest.run(async (signal) => {
      const result = await fetch(url, { signal });
      const data = await result.json() as T;
      if (!result.ok || !data.ok) throw new Error(data.error || "Datele nu au putut fi încărcate. Încearcă din nou.");
      return data;
    }, (data) => { setResponse({ url, data, error: null }); setPending(false); }, (error) => {
      setResponse({ url, data: null, error: error instanceof Error ? error.message : "Datele nu au putut fi încărcate." });
      setPending(false);
    });
  }, [latest, url, attempt]);
  const loading = pending || response?.url !== url;
  return { data: response?.data ?? null, loading, error: loading ? null : response?.error,
    retry: () => { setPending(true); setAttempt((previous) => previous + 1); } };
}
