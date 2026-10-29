"use client";

import { useEffect, useState } from "react";
import type { RowsResult } from "../../../lib/ask/facet-parts";
import { questionKey, type QuestionSpec } from "../../../lib/ask/question-ui";
import type { AskSpec } from "../../../lib/ask/spec";
import type { WinnerFacts } from "../../../lib/ask/winners";

/*
 * F5, the facts of a ranking's rows on screen (plan §4.2 P8, final table §3.3–§3.7): asked of POST /api/ask/facets
 * (part `rows`, the ids shown) once the rows are drawn, so they never delay the answer; aborted when the rows or the
 * question change. Kept in the page for five minutes. A limit passed or an error: no facts (the rows stay as they are).
 */

const KEPT_MS = 300_000;
const kept = new Map<string, { facts: Record<string, WinnerFacts>; at: number }>();

export function useRowFacts(spec: AskSpec | null, ids: readonly string[]): Record<string, WinnerFacts> | null {
  const key = spec && ids.length ? `${questionKey(spec as unknown as QuestionSpec)}|${ids.join(",")}` : null;
  const known = () => { const hit = key ? kept.get(key) : undefined; return hit && Date.now() - hit.at <= KEPT_MS ? hit.facts : null; };
  const [facts, setFacts] = useState<Record<string, WinnerFacts> | null>(known);
  useEffect(() => {
    const now = known();
    setFacts(now);
    if (!spec || !key || now) return;
    const controller = new AbortController();
    void fetch("/api/ask/facets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec, part: "rows", ids }),
      signal: controller.signal,
    }).then(async (r) => (await r.json().catch(() => null)) as ({ ok: boolean } & RowsResult) | null).then((answer) => {
      if (controller.signal.aborted || !answer?.ok) return;
      kept.set(key, { facts: answer.facts, at: Date.now() });
      setFacts(answer.facts);
    }).catch(() => {});
    return () => controller.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- `spec` and `ids` change with `key` only
  return facts;
}
