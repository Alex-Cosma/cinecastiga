"use client";

import { useEffect, useState } from "react";
import type { PeerDialogData } from "../../../lib/ask/peer-groups-shared";
import { focalRole, type QuestionSpec } from "../../../lib/ask/question-ui";

/*
 * "Față de cine?" reads its rows and sizes for the entity of a distribution
 * (GET /api/ask/peers) when the entity or an old link's county or kind
 * changes: the window's "→ N", the sentence's bounds ("cu 52–207 mii de
 * locuitori") and the default tick of a new question (final distribution §4.2).
 * One request per entity and group; the last answer stays while the next one
 * comes, and a page keeps what it read.
 */

export interface PeerDialogState { data: PeerDialogData | null; loading: boolean; error: string | null }

const cache = new Map<string, PeerDialogData>();

/** The request for a draft, or null when it is not a distribution of one identified entity. */
export function peerDialogQuery(spec: Pick<QuestionSpec, "block" | "filters" | "dim" | "peers">): string | null {
  if (spec.block !== "distribution") return null;
  const role = focalRole(spec as QuestionSpec);
  const id = spec.filters[role === "authority" ? "authorityId" : "supplierId"];
  if (id === undefined || !/^[1-9]\d{0,17}$/.test(String(id))) return null;
  const params = new URLSearchParams({ role, id: String(id) });
  if (typeof spec.filters.county === "string" && spec.filters.county) params.set("county", spec.filters.county);
  if (role === "authority" && typeof spec.filters.authorityKind === "string" && spec.filters.authorityKind) params.set("kind", spec.filters.authorityKind);
  if (spec.peers?.activity) params.set("activity", "1");
  return params.toString();
}

export function usePeerDialog(spec: Pick<QuestionSpec, "block" | "filters" | "dim" | "peers">): PeerDialogState {
  const query = peerDialogQuery(spec);
  const [state, setState] = useState<PeerDialogState>(() => ({ data: query ? cache.get(query) ?? null : null, loading: false, error: null }));
  useEffect(() => {
    if (!query) { setState({ data: null, loading: false, error: null }); return; }
    const hit = cache.get(query);
    if (hit) { setState({ data: hit, loading: false, error: null }); return; }
    const ctrl = new AbortController();
    setState((current) => ({ data: current.data, loading: true, error: null }));
    fetch(`/api/ask/peers?${query}`, { signal: ctrl.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({ ok: false })) as { ok?: boolean; data?: PeerDialogData; error?: string };
        if (ctrl.signal.aborted) return;
        if (!body.ok || !body.data) { setState({ data: null, loading: false, error: body.error ?? "Grupul nu a putut fi calculat acum." }); return; }
        cache.set(query, body.data);
        setState({ data: body.data, loading: false, error: null });
      })
      .catch(() => { if (!ctrl.signal.aborted) setState((current) => ({ data: current.data, loading: false, error: "Grupul nu a putut fi calculat acum." })); });
    return () => ctrl.abort();
  }, [query]);
  return state;
}
