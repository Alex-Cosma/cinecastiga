import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { NEWER_VERSION_LINK, parseSpec, unimplementedSpecKeys, validateSpec, type AskSpec, type SpecError } from "@/lib/ask/spec";
import { localityScopeError } from "@/lib/ask/question-ui";
import { aborted, FACET_SLOTS, facetCounts, facetRequest, inFacetSlot, locate, rowFacts, type FacetFailure } from "@/lib/ask/facets";
import { barFacts, mapFacts, mixFacts, podiumFacts } from "@/lib/ask/answer-facts";
import { comparePeers, pairFacts } from "@/lib/ask/compare-engine";
import { networkFacts, type NetworkFacts } from "@/lib/ask/network-facts";
import type { ComparePeersResult, PairResult } from "@/lib/ask/compare-shared";
import type { BarsResult, FacetCounts, LocateResult, MixResult, PodiumResult, RowsResult } from "@/lib/ask/facet-parts";
import type { MapFacts } from "@/lib/ask/map-facts";
import { devlog } from "@/lib/devlog";

/**
 * POST /api/ask/facets — the counts of a builder's window and "Unde e …?"
 * (plan §2.5, kit R5 and component 20).
 *   { spec, part }      → { ok, part, unit, options, rest, total, checkpoint, tookMs }
 *   { spec, part: "locate", q } → { ok, part, total, measure, matches, checkpoint, tookMs }
 *   { spec, part: "mix" }  → stat's „Din care” (lib/ask/answer-facts.ts): { ok, part, kind, procedure, size, offers, total, … }
 *   { spec, part: "bars" } → an evolution's bar facts: { ok, part, max, above, checkpoint, tookMs }
 *   { spec, part: "pair" } → a comparison's pair for its windows (lib/ask/compare-engine.ts): { ok, part, years, domains, general, kinds, counties, … }
 *   { spec, part: "compare-peers" } → the suggestions of "Cu cine comparăm?": { ok, part, label, tip, peers, … };
 *     the second entity is not chosen yet, so only the shape of the spec and its first entity are checked.
 *   { spec, part: "network" } → a network's whole relation where its answer was bounded (lib/ask/network-facts.ts): { ok, part, data, … }
 *   { spec, part: "winners" } → F5, the counts of a ranking's chips „Firme noi”, „Principalul lor client public”, „O firmă ia peste jumătate”
 *   { spec, part: "rows", ids } → F5, the facts of the rows shown (at most 50 ids): { ok, part, facts, checkpoint, tookMs }
 *   { spec, part: "map" } → F5, a map's county facts (lib/ask/map-facts.ts): { ok, part, counties, seat, share, checkpoint, tookMs }
 *   { spec, part: "podium", ids } → the facts of "Cine conduce?" by value for its places (lib/ask/answer-facts.ts): { ok, part, places, … }
 *   over the 8 s limit  → { ok: false, timeout: true }: the window shows its options without numbers.
 * POST, not GET: a precise selection reaches 64 KB, and a person's key (name,
 * birth date and place) stays out of the access logs. Its own pool of
 * FACET_SLOTS connections, so counts never wait for an answer's connection or
 * hold one; a closed window aborts the request, which cancels its query.
 */

const g = globalThis as unknown as { __seapFacetSql?: DbSql };
function db(): DbSql {
  if (!g.__seapFacetSql) g.__seapFacetSql = createDb(undefined, { max: FACET_SLOTS }).sql;
  return g.__seapFacetSql;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as typeof body;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return NextResponse.json({ ok: false, error: "Body invalid (JSON)." }, { status: 400 });
  }
  const asked = facetRequest(body);
  if ("error" in asked) return NextResponse.json({ ok: false, error: asked.error }, { status: 400 });
  // A key this release reads but does not apply is refused here too (plan F0a).
  const v = asked.part === "compare-peers" ? peersSpec(body.spec) : validateSpec(body.spec, { refuseNewer: NEWER_VERSION_LINK });
  if ("error" in v) return NextResponse.json({ ok: false, error: v.error }, { status: v.newer ? 422 : 400 });
  const localityError = localityScopeError(v);
  if (localityError) return NextResponse.json({ ok: false, error: localityError }, { status: 400 });
  const signal = req.signal;
  try {
    const result = await inFacetSlot<FacetCounts | LocateResult | MixResult | BarsResult | PodiumResult | PairResult | ComparePeersResult | NetworkFacts | RowsResult | MapFacts | FacetFailure>(signal, () => asked.part === "locate"
      ? locate(db(), v, asked.q!, { signal })
      : asked.part === "rows" ? rowFacts(db(), v, asked.ids!, { signal })
      : asked.part === "mix" ? mixFacts(db(), v, { signal })
        : asked.part === "bars" ? barFacts(db(), v, { signal })
        : asked.part === "map" ? mapFacts(db(), v, { signal })
          : asked.part === "pair" ? pairFacts(db(), v, { signal })
            : asked.part === "compare-peers" ? comparePeers(db(), v, { signal })
              : asked.part === "network" ? networkFacts(db(), v)
                : asked.part === "podium" ? podiumFacts(db(), v, Array.isArray(body.ids) ? body.ids.map(String) : [], { signal })
                : facetCounts(db(), v, asked.part, { signal }));
    if ("timeout" in result) return NextResponse.json({ ok: false, timeout: true }, { headers: { "cache-control": "no-store" } });
    // A count that waits on the marts stage (PRECOMPUTE.md): the options without numbers, as past the limit.
    if ("precompute" in result) return NextResponse.json({ ok: false, timeout: true, precompute: result.precompute }, { headers: { "cache-control": "no-store" } });
    if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
    devlog("facets", { part: asked.part, tookMs: result.tookMs });
    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    // The window closed: nobody reads the answer.
    if (signal.aborted || aborted(e)) return new NextResponse(null, { status: 499 });
    const msg = e instanceof Error ? e.message : String(e);
    devlog("facets", { part: asked.part, ok: false, error: msg });
    return NextResponse.json({ ok: false, error: "Numerele nu au putut fi calculate." }, { status: 500 });
  }
}

/** "Cu cine comparăm?" opens before the second entity exists: the spec's shape, a key this release applies, a first entity. */
function peersSpec(raw: unknown): AskSpec | (SpecError & { newer?: true }) {
  const spec = parseSpec(raw);
  if ("error" in spec) return spec;
  if (unimplementedSpecKeys(spec).length) return { error: NEWER_VERSION_LINK, newer: true };
  const f = spec.filters;
  return f.authorityId || f.authorityName || f.supplierId || f.supplierName ? spec : { error: "Alege întâi prima entitate." };
}
