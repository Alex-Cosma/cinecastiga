import { NextResponse } from "next/server";
import { getRadiografieSuppliers, type DepSort } from "@/lib/radiografie";

/**
 * GET /api/radiografie/furnizori — the radiography's relation table: every supplier of an authority over both
 * channels, 10 a page. ?id&sort=value|here|life|recs|name&dir=asc|desc&page&q (a name to search).
 */
const SORTS: readonly DepSort[] = ["value", "here", "life", "recs", "name"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!/^\d+$/.test(id)) return NextResponse.json({ ok: false, error: "id invalid" }, { status: 400 });
  const sortParam = url.searchParams.get("sort") as DepSort | null;
  const sort: DepSort = sortParam && SORTS.includes(sortParam) ? sortParam : "value";
  const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
  const page = Number(url.searchParams.get("page"));
  const search = (url.searchParams.get("q") ?? "").slice(0, 80);
  try {
    const data = await getRadiografieSuppliers(id, { sort, dir, page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1, search });
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    // The technical cause goes to the server log, never to the reader.
    console.error("radiografie-furnizori", { id, sort, dir, page, search }, e);
    return NextResponse.json({ ok: false, error: "Furnizorii nu au putut fi încărcați acum. Încearcă din nou peste câteva momente." }, { status: 500 });
  }
}
