import type { NextRequest } from "next/server";
import { searchEntities } from "@/lib/search";

/**
 * Typeahead endpoint for the header search box. Proxies Meilisearch so the
 * client never sees the key. Kept small (8 hits) and short-cached.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const result = await searchEntities(q, { limit: 8 });
  return Response.json(result, {
    headers: { "Cache-Control": "public, max-age=30" },
  });
}
