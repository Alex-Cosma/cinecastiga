import { getMapOptions } from "@/lib/map-capita";
import { MAP_KINDS, type MapKind } from "@/lib/map-capita-shared";

/**
 * /harta's filters: the kinds of institution, the years and the CPV divisions with records of a kind (`?kind=hospitals`;
 * the administrations with their institutions: `?sub=1`), with their totals.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const raw = params.get("kind") ?? "local_admin";
    const kind: MapKind = (MAP_KINDS as readonly string[]).includes(raw) ? raw as MapKind : "local_admin";
    return Response.json(await getMapOptions(kind, kind === "local_admin" && params.get("sub") === "1"), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Map options failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Filtrele hărții nu au putut fi încărcate. Reîncearcă." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
