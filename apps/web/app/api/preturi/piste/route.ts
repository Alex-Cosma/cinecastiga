import { NextResponse } from "next/server";
import { getStripLeads } from "@/lib/unit-prices";

export const runtime = "nodejs";
/** Never stored by a browser or a proxy: the answer depends on who asks. */
const headers = { "Cache-Control": "private, no-store" };

/**
 * GET /api/preturi/piste?produs=<family>&ambalaj=<pack>[&an=<year>][&judet=<county>][&ordine=multiplu]
 * The lead rows of one strip of /preturi, loaded when the strip opens (the list no longer ships the rows of closed
 * strips): `{ ok: true, leads: PriceLead[], total, suppliers }` (StripLeads, lib/unit-prices.ts), the largest
 * STRIP_LEADS by lei above the median (by the multiple first with `ordine=multiplu`). The parameters are the strip's
 * own, as on /preturi.
 */
export async function GET(req: Request) {
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
