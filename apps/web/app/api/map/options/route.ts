import { getMapOptions } from "@/lib/map-capita";
import { MAP_KINDS, type MapKind } from "@/lib/map-capita-shared";

/** /harta's filters: the kinds of institution, the years and the CPV divisions with records of a kind (`?kind=hospitals`), with their totals. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get("kind") ?? "local_admin";
    const kind: MapKind = (MAP_KINDS as readonly string[]).includes(raw) ? raw as MapKind : "local_admin";
    return Response.json(await getMapOptions(kind), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Map options failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Filtrele hărții nu au putut fi încărcate. Reîncearcă." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
