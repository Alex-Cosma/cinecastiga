import { NextResponse } from "next/server";
import { getNoticeLotsFacet } from "@/lib/notice-lots";
import { LOT_COLUMNS } from "@/lib/notice-lots-columns";
import { readFilters } from "@/lib/table-filters/codec";

/**
 * GET /api/anunturi/loturi?caid=<ca_notice_id>&optiuni=<column>[&cauta=…] plus the columns' parameters
 * (lib/notice-lots-columns.ts): one funnel of an award notice's records. The rows are rendered by the page.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const get = (key: string) => url.searchParams.get(key);
  const caid = get("caid") ?? "";
  const key = get("optiuni") ?? "";
  if (!/^\d{1,18}$/.test(caid) || !LOT_COLUMNS.some((c) => c.key === key)) return NextResponse.json({ ok: false, error: "Selecție invalidă." }, { status: 400 });
  const term = (get("cauta") ?? "").slice(0, 80);
  try {
    return NextResponse.json({ ok: true, facet: await getNoticeLotsFacet(caid, key, readFilters(LOT_COLUMNS, get), term ? { term } : {}) });
  } catch (e) {
    console.error("notice lots facet", { caid, key }, e);
    return NextResponse.json({ ok: false, error: "Opțiunile nu au putut fi încărcate." }, { status: 500 });
  }
}
