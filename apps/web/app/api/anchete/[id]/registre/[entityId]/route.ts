import { NextResponse } from "next/server";
import { sessionUserId } from "@/lib/session";
import { withInvestigationAccess } from "@/lib/investigation-access";
import { readRegistryFacts } from "@/lib/dossier-registry";

/** "Din registre" on a dossier's entity card: the reader must hold the dossier, and the entity must be saved in it. */
export async function GET(_request: Request, context: { params: Promise<{ id: string; entityId: string }> }) {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Autentifică-te pentru a deschide dosarul." }, { status: 401 });
  const { id, entityId } = await context.params;
  if (!/^\d+$/.test(entityId)) return NextResponse.json({ error: "Entitate invalidă." }, { status: 400 });
  const saved = await withInvestigationAccess(userId, id, "read", async (q) =>
    (await q`select 1 from app.clips where investigation_id = ${id} and kind = 'entity' and ref_id = ${entityId} limit 1`).length > 0);
  if (!saved) return NextResponse.json({ error: "Entitatea nu este salvată în acest dosar." }, { status: 404 });
  const facts = await readRegistryFacts(entityId);
  if (!facts) return NextResponse.json({ error: "Entitatea nu mai este disponibilă." }, { status: 404 });
  return NextResponse.json(facts, { headers: { "Cache-Control": "private, no-store" } });
}
