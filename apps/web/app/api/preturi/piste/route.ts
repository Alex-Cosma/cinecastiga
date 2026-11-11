import { NextResponse } from "next/server";
import { priceAdminFor } from "@/lib/price-access";
import { getStripLeads } from "@/lib/unit-prices";

export const runtime = "nodejs";
/** Never stored by a browser or a proxy: the answer depends on who asks. */
const headers = { "Cache-Control": "private, no-store" };

/**
 * GET /api/preturi/piste?produs=<family>&ambalaj=<pack>[&an=<year>][&judet=<county>][&ordine=multiplu]
 * The lead rows of one strip of /preturi, loaded when the strip opens (the list no longer ships the rows of closed
 * strips): `{ ok: true, leads: PriceLead[], total, suppliers }` (StripLeads, lib/unit-prices.ts), the largest
 * STRIP_LEADS by lei above the median (by the multiple first with `ordine=multiplu`). The parameters are the strip's
 * own, as on /preturi. Administrators only (owner, 11 November 2026): anyone else gets a 404 before anything is read.
 */
export async function GET(req: Request) {
  if (!(await priceAdminFor(req.headers))) return NextResponse.json({ ok: false, error: "Pagina nu există." }, { status: 404, headers });
  const url = new URL(req.url);
  const sp = Object.fromEntries(["produs", "ambalaj", "an", "judet", "ordine"].map((k) => [k, url.searchParams.get(k) ?? undefined]));
  try {
    const leads = await getStripLeads(sp);
    if (!leads) return NextResponse.json({ ok: false, error: "produs necunoscut" }, { status: 400, headers });
    return NextResponse.json({ ok: true, ...leads }, { headers });
  } catch (e) {
    console.error("preturi piste", sp, e);
    return NextResponse.json({ ok: false, error: "Rândurile nu au putut fi încărcate." }, { status: 500, headers });
  }
}
