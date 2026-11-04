import { NextResponse } from "next/server";
import { getSplitFacet, getSplitPairsPaged } from "@/lib/entity-splits";
import { splitColumns } from "@/lib/entity-splits-columns";
import { readFilters } from "@/lib/table-filters/codec";

/**
 * GET /api/entity-splits — an entity's repeated-purchases groups, 10 a page: ?id&rol=autoritate|furnizor&page plus the
 * columns' parameters (lib/entity-splits-columns.ts). With &optiuni=<column>[&cauta=…]: that funnel's options.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const get = (key: string) => params.get(key);
  const id = get("id") ?? "";
  const rol = get("rol");
  const page = Number(get("page") ?? "1");
  if (!/^[1-9]\d{0,17}$/.test(id) || !["autoritate", "furnizor"].includes(rol ?? "") || !Number.isSafeInteger(page) || page < 1) {
    return NextResponse.json({ ok: false, error: "Selecție invalidă." }, { status: 400 });
  }
  const role = rol === "autoritate" ? "authority" : "supplier";
  const columns = splitColumns(role === "authority");
  const filters = readFilters(columns, get);
  const facetKey = get("optiuni");
  if (facetKey !== null && !columns.some((c) => c.key === facetKey)) return NextResponse.json({ ok: false, error: "coloană necunoscută" }, { status: 400 });
  try {
    if (facetKey !== null) {
      const term = (get("cauta") ?? "").slice(0, 80);
      return NextResponse.json({ ok: true, facet: await getSplitFacet(id, role, facetKey, filters, term ? { term } : {}) });
    }
    return NextResponse.json({ ok: true, ...(await getSplitPairsPaged(id, role, filters, page)) });
  } catch (e) {
    console.error("entity-splits", { id, role, facetKey, filters }, e);
    return NextResponse.json({ ok: false, error: "Grupurile nu au putut fi încărcate. Încearcă din nou." }, { status: 503 });
  }
}
