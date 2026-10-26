import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { FORCE_CUSTOM_PLANS } from "@/lib/plan-cache";
import { peerDialog } from "@/lib/ask/peer-groups";
import { AUTHORITY_KINDS } from "@/lib/ask/spec";

/**
 * GET /api/ask/peers?role=authority&id=2144364[&county=Cluj][&kind=spital][&activity=1]
 *
 * "Față de cine?" (plan §4.11, final distribution §3.1, §7.4): the rows of the
 * window for the entity of a distribution (its concrete groups, what each one
 * cannot do and why) and the size of the group for every combination of
 * ticks, with an old link's other county or kind applied as the answer applies
 * them. Read before the answer runs, when the window opens or the entity
 * changes (~60–80 ms warm). The facts also name the group in the sentence.
 */

const g = globalThis as unknown as { __seapAskSql?: DbSql };
function db(): DbSql {
  if (!g.__seapAskSql) g.__seapAskSql = createDb().sql;
  return g.__seapAskSql;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  if ([...params.keys()].some((key) => !["role", "id", "county", "kind", "activity"].includes(key) || params.getAll(key).length > 1))
    return NextResponse.json({ ok: false, error: "Parametru necunoscut sau repetat." }, { status: 400 });
  const role = params.get("role"), id = params.get("id") ?? "", county = params.get("county")?.trim() ?? "", kind = params.get("kind") ?? "";
  if (role !== "authority" && role !== "supplier") return NextResponse.json({ ok: false, error: "Alege o instituție sau o firmă." }, { status: 400 });
  if (!/^[1-9]\d{0,17}$/.test(id)) return NextResponse.json({ ok: false, error: "Identificator invalid." }, { status: 400 });
  if (county.length > 100 || (kind && !(AUTHORITY_KINDS as readonly string[]).includes(kind)))
    return NextResponse.json({ ok: false, error: "Grup invalid." }, { status: 400 });
  const spec = {
    filters: { ...(county ? { county } : {}), ...(kind ? { authorityKind: kind } : {}) },
    ...(params.get("activity") === "1" ? { peers: { activity: true as const } } : {}),
  };
  try {
    const data = await db().begin("read only", async (tx) => {
      await tx.unsafe(FORCE_CUSTOM_PLANS);
      await tx.unsafe("set local statement_timeout = '8s'");
      return peerDialog(tx as unknown as DbSql, role, id, spec);
    });
    if (!data) return NextResponse.json({ ok: false, error: "Entitatea nu are achiziții directe acceptate." }, { status: 404 });
    return NextResponse.json({ ok: true, data }, { headers: { "cache-control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Grupul nu a putut fi calculat acum. Reîncearcă." }, { status: 503 });
  }
}
