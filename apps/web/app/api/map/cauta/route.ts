import { searchMap } from "@/lib/map-search";

/** GET /api/map/cauta?q= — /harta's search (UX audit Z4-01): the map's localities and institutions by name (lib/map-search.ts). */
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  return Response.json(searchMap(q), { headers: { "Cache-Control": "public, max-age=300" } });
}
