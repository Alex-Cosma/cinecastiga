import { NextResponse } from "next/server";
import { getRadiografieFacet, getRadiografieSuppliers, type DepSort } from "@/lib/radiografie";
import { RADIOGRAFIE_COLUMNS } from "@/lib/radiografie-columns";
import { readFilters } from "@/lib/table-filters/codec";

/**
 * GET /api/radiografie/furnizori — the radiography's relation table: every supplier of an authority over both
 * channels, 10 a page. ?id&sort=value|here|life|recs|name&dir=asc|desc&page plus the columns' parameters
 * (lib/radiografie-columns.ts: furnizor, valoare, inregistrari). With &optiuni=<column>[&cauta=…]: that funnel's
 * options under the other filters, no rows.
 */
const SORTS: readonly DepSort[] = ["value", "here", "life", "recs", "name"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const get = (key: string) => url.searchParams.get(key);
  const id = get("id") ?? "";
  if (!/^\d+$/.test(id)) return NextResponse.json({ ok: false, error: "id invalid" }, { status: 400 });
  const filters = readFilters(RADIOGRAFIE_COLUMNS, get);
  const facetKey = get("optiuni");
  if (facetKey !== null && !RADIOGRAFIE_COLUMNS.some((c) => c.key === facetKey)) {
    return NextResponse.json({ ok: false, error: "coloană necunoscută" }, { status: 400 });
  }
  const sortParam = get("sort") as DepSort | null;
  const sort: DepSort = sortParam && SORTS.includes(sortParam) ? sortParam : "value";
  const dir = get("dir") === "asc" ? "asc" : "desc";
  const page = Number(get("page"));
  try {
    if (facetKey !== null) {
      const term = (get("cauta") ?? "").slice(0, 80);
      return NextResponse.json({ ok: true, facet: await getRadiografieFacet(id, facetKey, filters, term ? { term } : {}) });
    }
    const data = await getRadiografieSuppliers(id, { sort, dir, page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1, filters });
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    // The technical cause goes to the server log, never to the reader.
    console.error("radiografie-furnizori", { id, sort, dir, page, facetKey, filters }, e);
    return NextResponse.json({ ok: false, error: "Furnizorii nu au putut fi încărcați acum. Încearcă din nou peste câteva momente." }, { status: 500 });
  }
}
