"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComparePeersResult, PairResult } from "../../../lib/ask/compare-shared";
import { questionKey, type QuestionSpec } from "../../../lib/ask/question-ui";

/*
 * F4, a comparison's facts for its windows (final compare §5 "Indicii înainte
 * de rulare", plan §2.5 part=pair and part=compare-peers): asked of POST
 * /api/ask/facets when a window that reads them opens, for the pair the draft
 * names, never an earlier answer's. Kept in the page for five minutes; aborted
 * when the window closes or the pair changes. Until they arrive the window
 * works without them (the conditional presets and suggestions are missing).
 */

const KEPT_MS = 300_000;
type Part = "pair" | "compare-peers";
const kept = new Map<string, { value: PairResult | ComparePeersResult; at: number }>();

/** Tests: forget what the page kept. */
export function forgetPagePairs(): void { kept.clear(); }

/** The draft a part asks about: the pair (without „Doar clienții comuni”, beside the answer) or, for the suggestions, the first entity. */
export function pairAsk(draft: QuestionSpec, part: Part): { spec: QuestionSpec; key: string } | null {
  if (draft.block !== "compare") return null;
  const f = draft.filters;
  const authority = Boolean(f.authorityId || f.authorityName), firm = Boolean(f.supplierId || f.supplierName);
  if (!authority && !firm) return null;
  if (part === "compare-peers") {
    const own = authority ? { authorityId: f.authorityId, authorityName: f.authorityName } : { supplierId: f.supplierId, supplierName: f.supplierName };
    const filters = Object.fromEntries(Object.entries(own).filter(([, v]) => v !== undefined && v !== ""));
    const spec = { block: "compare", measure: "value", filters } as unknown as QuestionSpec;
    return { spec, key: `${part}|${questionKey(spec)}` };
  }
  if (!(f.compareWith || f.compareWithId)) return null;
  const filters = { ...f };
  delete filters.sharedPartners;
  const spec = { ...draft, filters };
  return { spec, key: `${part}|${questionKey(spec)}` };
}

/** A comparison's facts while a window that reads them is open (`open` false: none asked); null until they arrive or without them. */
function usePart<T extends PairResult | ComparePeersResult>(draft: QuestionSpec, part: Part, open: boolean): T | null {
  const asked = useMemo(() => open ? pairAsk(draft, part) : null, [draft, part, open]);
  const key = asked?.key ?? null;
  const known = () => { const hit = key ? kept.get(key) : undefined; return hit && Date.now() - hit.at <= KEPT_MS ? hit.value as T : null; };
  const [value, setValue] = useState<T | null>(known);
  useEffect(() => {
    const now = known();
    setValue(now);
    if (!asked || now) return;
    const controller = new AbortController();
    void fetch("/api/ask/facets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: asked.spec, part }),
      signal: controller.signal,
    }).then(async (r) => (await r.json().catch(() => null)) as ({ ok: boolean } & T) | null).then((answer) => {
      if (controller.signal.aborted || !answer?.ok) return;
      const { ok: _ok, ...result } = answer;
      kept.set(asked.key, { value: result as unknown as T, at: Date.now() });
      setValue(result as unknown as T);
    }).catch(() => {});
    return () => controller.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- `asked` changes with `key` only
  return value;
}

/** The pair's years, common domains, general codes and clients (part=pair). */
export const usePairFacts = (draft: QuestionSpec, open: boolean): PairResult | null => usePart<PairResult>(draft, "pair", open);
/** The suggestions of "Cu cine comparăm?" (part=compare-peers), lazily, never blocking the search. */
export const useComparePeers = (draft: QuestionSpec, open: boolean): ComparePeersResult | null => usePart<ComparePeersResult>(draft, "compare-peers", open);
