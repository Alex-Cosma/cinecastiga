import type { NextRequest } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { searchEntities } from "@/lib/search";
import { townHallUnits } from "@/lib/ask/town-hall-pick";

/**
 * Typeahead endpoint for the header search box. Proxies Meilisearch so the
 * client never sees the key. Kept small (8 hits) and short-cached. With
 * `uat=1` (the builder's institution search, D2), a town hall's hit carries
 * the locality it is an identity of (`uat`), which the builder writes instead.
 */
export const dynamic = "force-dynamic";

// The Ask routes' pool: the town halls are read only for the builder's search.
const g = globalThis as unknown as { __seapAskSql?: DbSql };
function db(): DbSql {
  if (!g.__seapAskSql) g.__seapAskSql = createDb(undefined, { max: 6 }).sql;
  return g.__seapAskSql;
}

export async function GET(req: NextRequest): Promise<Response> {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const result = await searchEntities(q, { limit: 8, allWords: req.nextUrl.searchParams.get("all") === "1" });
  if (req.nextUrl.searchParams.get("uat") === "1" && result.hits.length) {
    const ids = result.hits.filter((hit) => hit.roles.includes("authority")).map((hit) => String(hit.id));
    const units = await townHallUnits(db(), ids).catch(() => new Map());
    result.hits = result.hits.map((hit) => units.has(String(hit.id)) ? { ...hit, uat: units.get(String(hit.id)) } : hit);
  }
  return Response.json(result, {
    headers: { "Cache-Control": "public, max-age=30" },
  });
}
