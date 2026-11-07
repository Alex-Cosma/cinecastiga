import { sessionUserId } from "@/lib/session";
import { captureDatabase, getCapture } from "@/lib/evidence-captures";
import { rowsCsv } from "@/lib/evidence-bundle";

export const runtime = "nodejs";
export const maxDuration = 300;
/**
 * One complete capture's rows as the export's rows.csv, byte for byte: its SHA-256 is the fingerprint the evidence
 * sheet and the citation show (owner, 7 November 2026). A complete capture never changes, so the rows are read after
 * the access check without holding the dossier.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string; captureId: string }> }) {
  const userId = await sessionUserId();
  if (!userId) return new Response("Autentifică-te pentru a descărca sursele.", { status: 401 });
  const { id, captureId } = await context.params;
  const capture = await getCapture(userId, id, captureId);
  if (!capture || capture.status !== "complete") return new Response("Versiunea nu este completă sau nu mai este disponibilă.", { status: 404 });
  const source = rowsCsv(captureDatabase(), { id: capture.id, row_count: capture.rowCount });
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) { const next = await source.next(); if (next.done) controller.close(); else controller.enqueue(next.value); },
    async cancel() { await source.return(undefined); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="surse-${capture.id.slice(0, 8)}-v${capture.version}.csv"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
