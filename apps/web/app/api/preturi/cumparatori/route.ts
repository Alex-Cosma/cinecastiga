import { NextResponse } from "next/server";
import { PRICE_BUYER_COLUMNS } from "@/lib/price-columns";
import { readFilters } from "@/lib/table-filters/codec";
import { getPriceBuyerFacet } from "@/lib/unit-prices";

export const runtime = "nodejs";
/** Never stored by a browser or a proxy: the answer depends on who asks. */
const headers = { "Cache-Control": "private, no-store" };

/**
 * GET /api/preturi/cumparatori?optiuni=<column>&produs=…&ambalaj=…&an=…[&toate=1][&cauta=…] plus the columns'
 * parameters (lib/price-columns.ts): one funnel of a product's buyers under the other filters. The rows are rendered
 * by /preturi/[produs] itself.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const get = (key: string) => url.searchParams.get(key);
  const key = get("optiuni") ?? "";
  if (!PRICE_BUYER_COLUMNS.some((c) => c.key === key)) return NextResponse.json({ ok: false, error: "coloană necunoscută" }, { status: 400, headers });
  const sp = Object.fromEntries(["produs", "ambalaj", "an", "toate"].map((k) => [k, get(k) ?? undefined]));
  try {
    const facet = await getPriceBuyerFacet(sp, key, readFilters(PRICE_BUYER_COLUMNS, get), (get("cauta") ?? "").slice(0, 80));
    if (!facet) return NextResponse.json({ ok: false, error: "produs necunoscut" }, { status: 400, headers });
    return NextResponse.json({ ok: true, facet }, { headers });
  } catch (e) {
    console.error("preturi facet", { key, sp }, e);
    return NextResponse.json({ ok: false, error: "Opțiunile nu au putut fi încărcate." }, { status: 500, headers });
  }
}
