import { NextResponse } from "next/server";
import type { DbSql } from "@seap/db";
import { sharedSql } from "@/lib/shared-db";
import { REVEAL_MAX_SIGNALS, revealPatternAdmin, revealSignalNames } from "@/lib/shared-admin-names";

export const dynamic = "force-dynamic";
const ID = /^[1-9]\d{0,17}$/;
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

/**
 * GET /api/semnale/reprezentanti?semnale=<id>[,<id>…]            — the people of „Reprezentant comun” signals
 * GET /api/semnale/reprezentanti?autoritate=<id>&tipar=<id>      — a Radiografie pattern's shared administrator
 *
 * The page shows a blurred placeholder; the name is read only when the reader asks for it (legal audit, 18 November
 * 2026). Read-only, 8 s.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const signals = (p.get("semnale") ?? "").split(",").filter(Boolean), authority = p.get("autoritate") ?? "", pattern = p.get("tipar") ?? "";
  const bySignals = signals.length > 0 && signals.length <= REVEAL_MAX_SIGNALS && signals.every((id) => ID.test(id));
  const byPattern = ID.test(authority) && /^[1-9]\d{0,8}$/.test(pattern);
  if (bySignals === byPattern) return NextResponse.json({ error: "Cerere invalidă." }, { status: 400, headers });
  try {
    const data = await sharedSql().begin("read only", async (tx) => {
      const q = tx as unknown as DbSql;
      await q`set local statement_timeout = '8s'`;
      return bySignals ? revealSignalNames(q, [...new Set(signals)]) : revealPatternAdmin(q, authority, Number(pattern));
    });
    if (!data) return NextResponse.json({ error: "Numele nu este în datele de acum." }, { status: 404, headers });
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "Numele nu a putut fi citit acum. Reîncearcă." }, { status: 503, headers });
  }
}
