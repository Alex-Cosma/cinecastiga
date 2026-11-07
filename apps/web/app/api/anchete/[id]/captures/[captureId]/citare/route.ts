import { NextResponse } from "next/server";
import { sessionUserId } from "@/lib/session";
import { captureCitation, hostOrigin } from "@/lib/evidence-sheet";

/** "Copiază citarea" on a dossier card: the citation text of a complete capture, built on the server with its fingerprint. */
export async function GET(request: Request, context: { params: Promise<{ id: string; captureId: string }> }) {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Autentifică-te pentru a deschide dosarul." }, { status: 401 });
  const { id, captureId } = await context.params;
  const citation = await captureCitation(userId, id, captureId, hostOrigin(request.headers.get("host"), new URL(request.url).origin));
  if (!citation) return NextResponse.json({ error: "Versiunea nu este completă sau nu mai este disponibilă." }, { status: 404 });
  return NextResponse.json(citation, { headers: { "Cache-Control": "private, no-store" } });
}
