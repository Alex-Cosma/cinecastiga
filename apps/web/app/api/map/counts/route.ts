import { getMapCounts } from "@/lib/map-capita";

/** GET /api/map/counts — how many institutions each of /harta's layers holds (the „Instituții” window; UX audit Z4-30). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getMapCounts(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Map counts failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Numerele nu au putut fi citite." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
