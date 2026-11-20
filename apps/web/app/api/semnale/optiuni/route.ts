import { NextResponse } from "next/server";
import { getSignalFacet, parseSignalState, signalColumns } from "@/lib/signals";

/**
 * GET /api/semnale/optiuni?<the list's address, as /semnale's>&optiuni=<column>[&cauta=…] — one funnel of /semnale
 * (owner, 20 November 2026): that column's options in the list its view, pattern, role, county and other filters leave.
 * `{ ok, facet }`. A large list counts within 4 s and finishes in the background (lib/table-filters/server/query.ts).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams);
  const key = params["optiuni"] ?? "";
  const state = { ...parseSignalState(params), entity: null };
  if (!signalColumns(state).some((c) => c.key === key)) return NextResponse.json({ ok: false, error: "coloană necunoscută" }, { status: 400 });
  const term = (params["cauta"] ?? "").slice(0, 80);
  try {
    const facet = await getSignalFacet(state, key, { ...(term ? { term } : {}), budgetMs: 4000, cache: `semnale:${state.view}:${state.code}:${state.role}:${state.county ?? ""}` });
    return NextResponse.json({ ok: true, facet }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    // The technical cause goes to the server log, never to the reader.
    console.error("semnale-optiuni", { key, view: state.view, code: state.code }, e);
    return NextResponse.json({ ok: false, error: "Opțiunile nu au putut fi încărcate acum." }, { status: 500 });
  }
}
