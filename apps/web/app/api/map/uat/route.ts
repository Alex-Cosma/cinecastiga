import { getMapUat } from "@/lib/map-capita";
import { MapError, parseMapSelection } from "@/lib/map-capita-shared";

/**
 * One UAT's panel on /harta (owner, 6 November 2026): `?siruta=58259` plus the map's `years`, `cpv`, `dataset` and
 * `kind`. Aggregates of public records, as the map's areas: no investigation receipt, so no monitoring checkpoint.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, siruta = params.get("siruta");
    params.delete("siruta");
    if (!siruta || !/^\d{1,7}$/.test(siruta)) throw new MapError("Alege un UAT.");
    const result = await getMapUat(parseMapSelection(params), Number(siruta));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MapError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    console.error("Map UAT query failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Datele UAT-ului nu au putut fi încărcate. Reîncearcă." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
