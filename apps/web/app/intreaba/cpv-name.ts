"use client";

import { useEffect, useState } from "react";
import { readableCpvName } from "@/lib/entity-summary";

/** A CPV code (a division to a full code), not words. */
export const isCpvCode = (term: string) => /^(?:\d{2,8}|\d{8}-\d)$/.test(term.replace(/\s+/g, ""));

const known = new Map<string, string>();

/**
 * The catalogue name of a CPV code a question names ("45" → "Lucrări de
 * construcții"), with ș and ț, so the answer's title says what the builder's
 * sentence says (G7). Asked once per code and page (/api/cpv/label); until it
 * arrives, for words, or when the lookup fails, nothing: the title then says
 * "CPV 45", as the sentence does.
 */
export function useCpvName(term: string | undefined): string | undefined {
  const code = term && isCpvCode(term) ? term : null;
  const [name, setName] = useState(code ? known.get(code) : undefined);
  useEffect(() => {
    setName(code ? known.get(code) : undefined);
    if (!code || known.has(code)) return;
    const ctrl = new AbortController();
    fetch(`/api/cpv/label?code=${encodeURIComponent(code)}`, { signal: ctrl.signal })
      .then(async (response) => response.ok ? ((await response.json()) as { name?: string | null }).name ?? null : null)
      .then((found) => {
        if (!found) return;
        known.set(code, readableCpvName(found));
        if (!ctrl.signal.aborted) setName(known.get(code));
      })
      .catch(() => { /* The code stays readable as "CPV 45". */ });
    return () => ctrl.abort();
  }, [code]);
  return name;
}
