import { NextResponse } from "next/server";
import { getTedFacet } from "@/lib/ted-awards";
import { TED_COLUMNS } from "@/lib/ted-columns";
import { readFilters } from "@/lib/table-filters/codec";

/**
 * GET /api/ted-awards?optiuni=<column>[&cauta=…] plus the columns' parameters (lib/ted-columns.ts): one funnel of
 * /supra-prag's award table under the other filters. The rows are rendered by the page itself.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const get = (key: string) => url.searchParams.get(key);
  const key = get("optiuni") ?? "";
  if (!TED_COLUMNS.some((c) => c.key === key)) return NextResponse.json({ ok: false, error: "coloană necunoscută" }, { status: 400 });
  const filters = readFilters(TED_COLUMNS, get);
  const term = (get("cauta") ?? "").slice(0, 80);
  try {
    return NextResponse.json({ ok: true, facet: await getTedFacet(key, filters, term ? { term } : {}) });
  } catch (e) {
    console.error("ted-awards facet", { key, filters }, e);
    return NextResponse.json({ ok: false, error: "Opțiunile nu au putut fi încărcate." }, { status: 500 });
  }
}
