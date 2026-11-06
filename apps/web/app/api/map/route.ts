import { getMap } from "@/lib/map-capita";
import { MapError, parseMapSelection } from "@/lib/map-capita-shared";

/**
 * /harta's areas (owner, 6 November 2026): the value contracted per inhabitant of the local administrations, by county
 * (`?level=county`) or by the UATs of one county (`?level=uat&county=cluj`), for `years` (all | 2024,2025), `cpv`
 * (all | 45,33), `dataset` (all | da | contracts) and `kind` (local_admin). Aggregates of public records, as Întreabă's
 * map: no investigation receipt, so no monitoring checkpoint; a build changes them at most once a night.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const result = await getMap(parseMapSelection(new URL(request.url).searchParams));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MapError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    console.error("Map query failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Harta nu a putut fi încărcată. Reîncearcă." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
