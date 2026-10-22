"use client";

import { useEffect, useRef, useState } from "react";
import { createLatestRequest } from "@/lib/latest-request";

/**
 * The previous response supplies stable controls, but never selectable stale rows.
 * `initial` is a response the server already rendered for `initial.url` (the
 * first page); it is shown without fetching it again. Any other URL, a later
 * return to it after another page, or a retry fetches as usual.
 */
export function useEntityTable<T extends { ok: boolean; error?: string }>(url: string, initial?: { url: string; data: T }) {
  const [latest] = useState(createLatestRequest);
  const [pending, setPending] = useState(initial?.url !== url);
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ url: string; data: T | null; error: string | null } | null>(
    initial ? { url: initial.url, data: initial.data, error: null } : null,
  );
  const shown = useRef(response);
  shown.current = response;
  useEffect(() => {
    if (attempt === 0 && shown.current?.url === url && shown.current.data && shown.current.data === initial?.data) {
      setPending(false);
      return;
    }
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
    // `initial` is server data for the first render only; it never triggers a fetch.
  }, [latest, url, attempt]);
  const loading = pending || response?.url !== url;
  return { data: response?.data ?? null, loading, error: loading ? null : response?.error,
    retry: () => { setPending(true); setAttempt((previous) => previous + 1); } };
}
