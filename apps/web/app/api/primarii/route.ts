import { createDb, type DbSql } from "@seap/db";
import { searchTownHalls } from "@/lib/town-halls";
export const dynamic = "force-dynamic";

/** GET /api/primarii?q= — the town halls of the localities whose name starts with the words (lib/town-halls.ts). */
const g = globalThis as unknown as { __seapTownHallSql?: DbSql };
const db = () => (g.__seapTownHallSql ??= createDb(undefined, { max: 2 }).sql);

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return Response.json({ items: [] });
  try {
    return Response.json({ items: await searchTownHalls(db(), q) }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (e) {
    console.error("[api/primarii]", e);
    return Response.json({ error: "Nu am putut căuta localitatea acum." }, { status: 503 });
  }
}
