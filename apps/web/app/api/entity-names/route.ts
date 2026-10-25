import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { entityNameIds, entityNames } from "@/lib/entity-names";

/**
 * GET /api/entity-names?ids=1,2 — the names of the ids an old link's precise
 * selection lists without labels, for the (?) of its chip (lib/entity-names.ts).
 * At most 20 ids, by primary key; no source traffic.
 */
const g = globalThis as unknown as { __seapSql?: DbSql };

export async function GET(request: Request): Promise<Response> {
  const ids = entityNameIds(new URL(request.url).searchParams.get("ids"));
  if (!ids) return NextResponse.json({ error: "Id-uri invalide." }, { status: 400 });
  try {
    const names = await entityNames(g.__seapSql ??= createDb().sql, ids);
    return NextResponse.json({ names }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (error) {
    // The technical cause goes to the server log; the (?) keeps counting.
    console.error("entity-names", { ids }, error);
    return NextResponse.json({ error: "Numele nu pot fi încărcate acum." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
