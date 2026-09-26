import { ConnectionError, getConnections, parseConnectionInput } from "@/lib/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const result = await getConnections(parseConnectionInput(new URL(request.url).searchParams));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ConnectionError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    console.error("Connections query failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Legăturile nu au putut fi încărcate. Reîncearcă." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
