import { NextResponse } from "next/server";
import { getEntityTransactions } from "@/lib/entity-tx";
import { txColumns } from "@/lib/entity-tx-columns";
import { ENTITY_CSV_MAX, entityCsvName, entityTxCsv } from "@/lib/entity-tx-csv";
import { acquireExportSlot, EXPORT_BUSY_MESSAGE, EXPORT_RETRY_AFTER_SECONDS } from "@/lib/export-slots";
import type { Role } from "@/lib/marts";
import { parseRoleParam } from "@/lib/role-param";
import { readFilters } from "@/lib/table-filters/codec";

/**
 * GET /api/entity-tx/csv — the entity page's records table as a CSV (UX audit Z5-12, 16 November 2026): the same
 * parameters as /api/entity-tx (its funnels, sort and direction), every row up to ENTITY_CSV_MAX, exact values and links.
 * One of the process's export slots, as Întreabă's exports.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const get = (key: string) => url.searchParams.get(key);
  const id = get("id") ?? "";
  if (!/^\d{1,16}$/.test(id)) return NextResponse.json({ ok: false, error: "id invalid" }, { status: 400 });
  const role: Role = parseRoleParam(get("rol")) ?? "supplier";
  const filters = readFilters(txColumns(role === "authority"), get);
  const release = acquireExportSlot();
  if (!release) {
    return NextResponse.json({ ok: false, error: EXPORT_BUSY_MESSAGE },
      { status: 429, headers: { "retry-after": String(EXPORT_RETRY_AFTER_SECONDS), "cache-control": "no-store" } });
  }
  try {
    const { rows, total } = await getEntityTransactions(id, role, {
      filters, sort: get("sort") === "date" ? "date" : "value", dir: get("dir") === "asc" ? "asc" : "desc", page: 1, pageSize: ENTITY_CSV_MAX,
    });
    return new NextResponse(entityTxCsv(rows, url.origin), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${entityCsvName(id, rows.length, total)}"`,
        "x-total-rows": String(total),
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error("entity-tx csv", { id, role, filters }, e);
    return NextResponse.json({ ok: false, error: "Exportul nu a putut fi generat. Încearcă din nou." }, { status: 500 });
  } finally {
    release();
  }
}
