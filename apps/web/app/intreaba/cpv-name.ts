"use client";

import { useEffect, useState } from "react";
import { readableCpvName } from "../../lib/entity-summary";
import { isCpvCodeTerm } from "../../lib/ask/cpv-label";

/** A CPV code (a division to a full code), not words. */
export const isCpvCode = isCpvCodeTerm;

const known = new Map<string, string>();

/**
 * The name this page knows for a term: a code's, kept from the answer that
 * brought it (/api/ask `cpvName`, already readable) or from an earlier
 * lookup; nothing for words.
 */
export function knownCpvName(term: string | undefined, served?: string | null): string | undefined {
  const code = term && isCpvCode(term) ? term : null;
  if (!code) return undefined;
  if (served && !known.has(code)) known.set(code, served);
  return known.get(code);
}

/**
 * The catalogue name of a CPV code a question names ("45" → "Lucrări de
 * construcții"), with ș and ț, so the answer's title says what the builder's
 * sentence says (G7). The answer brings it (`served`), so a fresh page's
 * title never says "CPV 45" first (S4); otherwise asked once per code and
 * page (/api/cpv/label). Until it arrives, for words, or when the lookup
 * fails, nothing: the title then says "CPV 45", as the sentence does.
 */
export function useCpvName(term: string | undefined, served?: string | null): string | undefined {
  const code = term && isCpvCode(term) ? term : null;
  const name = knownCpvName(term, served);
  // Only a re-render once a looked-up name is known: the name itself is the page's map.
  const [, setFound] = useState(0);
  useEffect(() => {
    if (!code || known.has(code)) return;
    const ctrl = new AbortController();
    fetch(`/api/cpv/label?code=${encodeURIComponent(code)}`, { signal: ctrl.signal })
      .then(async (response) => response.ok ? ((await response.json()) as { name?: string | null }).name ?? null : null)
      .then((found) => {
        if (!found) return;
        known.set(code, readableCpvName(found));
        if (!ctrl.signal.aborted) setFound((n) => n + 1);
      })
      .catch(() => { /* The code stays readable as "CPV 45". */ });
    return () => ctrl.abort();
  }, [code]);
  return name;
}
