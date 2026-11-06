import { getMapOptions } from "@/lib/map-capita";

/** /harta's filters: the kinds of institution, the years and the CPV divisions with records, with their totals. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getMapOptions(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Map options failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Filtrele hărții nu au putut fi încărcate. Reîncearcă." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
