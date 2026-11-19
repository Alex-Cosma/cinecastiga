import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { FACET_SLOTS, inFacetSlot, scatterList, scatterListOptions, type FacetFailure } from "@/lib/ask/facets";
import type { ScatterListPage } from "@/lib/ask/scatter-list";
import type { Facet } from "@/lib/table-filters/types";
import { decodeSpec } from "@/lib/ask/permalink";
import { scatterListColumns } from "@/lib/ask/scatter-list-columns";
import { validateSpec } from "@/lib/ask/spec";
import { readFilters } from "@/lib/table-filters/codec";

/**
 * GET /api/ask/scatter-list — the risk map's whole list (owner, 19 November 2026): ?spec=<the question, as in the
 * page's address>&pagina=N plus the columns' parameters (lib/ask/scatter-list-columns.ts: nume, judet, tipare,
 * valoare, risc, achizitii) → { ok, rows, total, all, page }, 10 rows a page in the answer's own order. With
 * &optiuni=<column>[&cauta=…]: that funnel's options under the other filters, no rows. GET, so a funnel can ask by
 * address (components/table-filters); a question too long for an address keeps the answer's first rows.
 */
const g = globalThis as unknown as { __seapFacetSql?: DbSql };
function db(): DbSql {
  if (!g.__seapFacetSql) g.__seapFacetSql = createDb(undefined, { max: FACET_SLOTS }).sql;
  return g.__seapFacetSql;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const get = (key: string) => url.searchParams.get(key);
  const raw = decodeSpec(get("spec") ?? "");
  const spec = raw === null ? { error: "Întrebare invalidă." } : validateSpec(raw);
  if ("error" in spec) return NextResponse.json({ ok: false, error: spec.error }, { status: 400 });
  if (spec.block !== "scatter") return NextResponse.json({ ok: false, error: "Lista se cere la harta riscului." }, { status: 400 });
  const columns = scatterListColumns(spec.dim === "supplier" ? "supplier" : "authority");
  const filters = readFilters(columns, get);
  const facetKey = get("optiuni");
  if (facetKey !== null && !columns.some((c) => c.key === facetKey)) return NextResponse.json({ ok: false, error: "coloană necunoscută" }, { status: 400 });
  const page = Number(get("pagina"));
  try {
    const result = await inFacetSlot<ScatterListPage | Facet | FacetFailure>(req.signal, () => facetKey !== null
      ? scatterListOptions(db(), spec, facetKey, filters, (get("cauta") ?? "").slice(0, 80))
      : scatterList(db(), spec, filters, Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1));
    if ("timeout" in result || "precompute" in result) return NextResponse.json({ ok: false, timeout: true }, { headers: { "cache-control": "no-store" } });
    if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
    return NextResponse.json(facetKey !== null ? { ok: true, facet: result } : { ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (req.signal.aborted) return new NextResponse(null, { status: 499 });
    // The technical cause goes to the server log, never to the reader.
    console.error("scatter-list", { facetKey, filters, page }, e);
    return NextResponse.json({ ok: false, error: "Lista nu a putut fi încărcată acum. Încearcă din nou peste câteva momente." }, { status: 500 });
  }
}
