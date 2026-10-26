"use client";

import { useEffect, useMemo, useState } from "react";
import { facetSpec, type CountPart, type FacetCounts, type FacetView } from "../../../lib/ask/facet-parts";
import { questionKey, type QuestionSpec } from "../../../lib/ask/question-ui";

/*
 * The counts of an open window (kit R5, plan §2.5): asked of POST
 * /api/ask/facets when the window opens, never with the answer, so a count
 * never delays it. The request leaves the window's own key out of the draft
 * (facetSpec, as the server does) and is aborted when the window closes or
 * the draft changes; the server then drops it or cancels its query. Counts
 * already read are kept in the page for five minutes, so reopening a window
 * shows them at once. A timeout, a count the marts stage will precompute or
 * an error leaves the options without numbers.
 */

const KEPT_MS = 300_000;
const kept = new Map<string, { counts: FacetCounts; at: number }>();
const NONE: FacetView = { status: "none" };

/** The draft a part asks about, and its key in the page's memory. */
export function facetAsk(draft: QuestionSpec, part: CountPart): { spec: QuestionSpec; key: string } {
  const spec = facetSpec(draft, part);
  return { spec, key: `${part}|${questionKey(spec)}` };
}

/** What the page already knows of a key: the counts read, else loading (or nothing to ask). */
function known(key: string | null): FacetView {
  const hit = key ? kept.get(key) : undefined;
  return hit && Date.now() - hit.at <= KEPT_MS ? { status: "ready", counts: hit.counts } : key ? { status: "loading" } : NONE;
}

/** Tests: forget the counts kept in the page. */
export function forgetPageFacets(): void { kept.clear(); }

/** The counts of `part` on the draft, while a window that shows them is open (null: none asked). */
export function useFacet(draft: QuestionSpec, part: CountPart | null): FacetView {
  const asked = useMemo(() => part ? facetAsk(draft, part) : null, [draft, part]);
  const key = asked?.key ?? null;
  const [view, setView] = useState<FacetView>(() => known(key));
  useEffect(() => {
    const now = known(key);
    setView(now);
    if (!asked || !part || now.status !== "loading") return;
    const controller = new AbortController();
    void fetch("/api/ask/facets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: asked.spec, part }),
      signal: controller.signal,
    }).then(async (r) => (await r.json().catch(() => null)) as ({ ok: boolean } & FacetCounts) | null).then((answer) => {
      if (controller.signal.aborted) return;
      if (!answer?.ok) { setView(NONE); return; }
      const { ok: _ok, ...counts } = answer;
      kept.set(asked.key, { counts, at: Date.now() });
      setView({ status: "ready", counts });
    }).catch(() => { if (!controller.signal.aborted) setView(NONE); });
    return () => controller.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- `asked` changes with `key` only
  return view;
}
