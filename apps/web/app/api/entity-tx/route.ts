import { NextResponse } from "next/server";
import { getEntityTransactions, getEntityTxFacet } from "@/lib/entity-tx";
import { txColumns } from "@/lib/entity-tx-columns";
import type { Role } from "@/lib/marts";
import { readFilters } from "@/lib/table-filters/codec";
import { devlog } from "@/lib/devlog";

/**
 * GET /api/entity-tx — the entity page's records table, client-driven (10 rows a page, sortable, filtered by its
 * column funnels without a page reload): ?id&rol=furnizor|autoritate&page&sort=value|date&dir=asc|desc plus the
 * columns' parameters (lib/entity-tx-columns.ts: an, tip, furnizor|autoritate, cpv, valoare, sem).
 * With &optiuni=<column>[&cauta=…]: that funnel's options under the other filters, no rows.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const get = (key: string) => url.searchParams.get(key);
  const id = get("id") ?? "";
  if (!/^\d+$/.test(id)) return NextResponse.json({ ok: false, error: "id invalid" }, { status: 400 });
  const role: Role = get("rol") === "autoritate" ? "authority" : "supplier";
  const columns = txColumns(role === "authority");
  const filters = readFilters(columns, get);
  const facetKey = get("optiuni");
  if (facetKey !== null && !columns.some((c) => c.key === facetKey)) {
    return NextResponse.json({ ok: false, error: "coloană necunoscută" }, { status: 400 });
  }
  const page = Number(get("page"));
  const sort = get("sort") === "date" ? "date" : "value";
  const dir = get("dir") === "asc" ? "asc" : "desc";
  devlog("entity-tx", { id, role, facetKey, filters, page, sort, dir });

  try {
    if (facetKey !== null) {
      const term = get("cauta");
      const facet = await getEntityTxFacet(id, role, facetKey, filters, term ? { term } : {});
      return NextResponse.json({ ok: true, facet });
    }
    const { rows, total } = await getEntityTransactions(id, role, {
      filters, sort, dir, page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1, pageSize: 10,
    });
    return NextResponse.json({ ok: true, rows, total, pageSize: 10 });
  } catch (e) {
    // The technical cause goes to the server log, never to the reader.
    console.error("entity-tx", { id, role, facetKey, filters }, e);
    return NextResponse.json(
      { ok: false, error: "Înregistrările nu au putut fi încărcate acum. Încearcă din nou peste câteva momente." },
      { status: 500 },
    );
  }
}
