import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { FORCE_CUSTOM_PLANS } from "@/lib/plan-cache";
import { peerMembers } from "@/lib/ask/peer-groups";
import { AUTHORITY_KINDS } from "@/lib/ask/spec";

/**
 * GET /api/ask/peers/members?role=authority&id=2145000&k=2[&offset=10][&similar=1][&activity=1][&county=Buzău][&kind=spital]
 *
 * A bar of the distribution's chart (final distribution §3.6, §3.8): the
 * members of the answer's group with exactly k criteria, ten at a time, by
 * direct acquisitions (lib/ask/peer-groups.ts peerMembers). Read when the bar
 * is opened, as "Față de cine?" reads its rows (~20–60 ms warm).
 */

const g = globalThis as unknown as { __seapAskSql?: DbSql };
function db(): DbSql {
  if (!g.__seapAskSql) g.__seapAskSql = createDb().sql;
  return g.__seapAskSql;
}

const KEYS = ["role", "id", "k", "offset", "similar", "activity", "county", "kind"];

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  if ([...params.keys()].some((key) => !KEYS.includes(key) || params.getAll(key).length > 1))
    return NextResponse.json({ ok: false, error: "Parametru necunoscut sau repetat." }, { status: 400 });
  const role = params.get("role"), id = params.get("id") ?? "", county = params.get("county")?.trim() ?? "", kind = params.get("kind") ?? "";
  const k = Number(params.get("k")), offset = Number(params.get("offset") ?? "0");
  if (role !== "authority" && role !== "supplier") return NextResponse.json({ ok: false, error: "Alege o instituție sau o firmă." }, { status: 400 });
  if (!/^[1-9]\d{0,17}$/.test(id)) return NextResponse.json({ ok: false, error: "Identificator invalid." }, { status: 400 });
  if (!Number.isInteger(k) || k < 0 || k > 5 || !Number.isInteger(offset) || offset < 0 || offset > 200_000)
    return NextResponse.json({ ok: false, error: "Bară invalidă." }, { status: 400 });
  if (county.length > 100 || (kind && !(AUTHORITY_KINDS as readonly string[]).includes(kind)) || (role === "supplier" && params.get("similar") === "1"))
    return NextResponse.json({ ok: false, error: "Grup invalid." }, { status: 400 });
  const peers = { ...(params.get("similar") === "1" ? { similar: true as const } : {}), ...(params.get("activity") === "1" ? { activity: true as const } : {}) };
  const spec = { filters: { ...(county ? { county } : {}), ...(kind ? { authorityKind: kind } : {}) }, ...(Object.keys(peers).length ? { peers } : {}) };
  try {
    const data = await db().begin("read only", async (tx) => {
      await tx.unsafe(FORCE_CUSTOM_PLANS);
      await tx.unsafe("set local statement_timeout = '8s'");
      return peerMembers(tx as unknown as DbSql, role, id, spec, k, offset);
    });
    if (!data) return NextResponse.json({ ok: false, error: "Entitatea are sub 10 achiziții directe: nu are un grup de comparație." }, { status: 404 });
    if ("error" in data) return NextResponse.json({ ok: false, error: data.error }, { status: 422 });
    return NextResponse.json({ ok: true, ...data }, { headers: { "cache-control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Lista nu a putut fi citită acum. Reîncearcă." }, { status: 503 });
  }
}
