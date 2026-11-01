import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { FORCE_CUSTOM_PLANS } from "@/lib/plan-cache";
import { peerMembers } from "@/lib/ask/peer-groups";
import { AUTHORITY_KINDS } from "@/lib/ask/spec";

/**
 * GET /api/ask/peers/members?role=authority&id=2145000&from=20&to=29[&offset=10][&similar=1][&activity=1][&county=Buzău][&kind=spital]
 *
 * A bar of the distribution's chart (final distribution §3.6, §3.8): the
 * members of the answer's group whose displayed risk score is between `from`
 * and `to` (distribution-3, both inclusive, 0–100), ten at a time, by score
 * then direct acquisitions (lib/ask/peer-groups.ts peerMembers). An answer
 * stored before it asks with `k`, the members with exactly k criteria
 * (distribution-2), by direct acquisitions. Read when the bar is opened, as
 * "Față de cine?" reads its rows (~20–60 ms warm).
 */

const g = globalThis as unknown as { __seapAskSql?: DbSql };
function db(): DbSql {
  if (!g.__seapAskSql) g.__seapAskSql = createDb().sql;
  return g.__seapAskSql;
}

const KEYS = ["role", "id", "k", "from", "to", "offset", "similar", "activity", "county", "kind"];
/** A whole number from 0 to `max`, or null. */
const whole = (raw: string | null, max: number): number | null => {
  if (raw === null || !/^\d{1,6}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= max ? n : null;
};

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  if ([...params.keys()].some((key) => !KEYS.includes(key) || params.getAll(key).length > 1))
    return NextResponse.json({ ok: false, error: "Parametru necunoscut sau repetat." }, { status: 400 });
  const role = params.get("role"), id = params.get("id") ?? "", county = params.get("county")?.trim() ?? "", kind = params.get("kind") ?? "";
  const offset = params.has("offset") ? whole(params.get("offset"), 200_000) : 0;
  if (role !== "authority" && role !== "supplier") return NextResponse.json({ ok: false, error: "Alege o instituție sau o firmă." }, { status: 400 });
  if (!/^[1-9]\d{0,17}$/.test(id)) return NextResponse.json({ ok: false, error: "Identificator invalid." }, { status: 400 });
  // A band of the score (from–to), or an old answer's number of criteria (k): exactly one of them.
  const k = params.has("k") ? whole(params.get("k"), 5) : null;
  const from = whole(params.get("from"), 100), to = whole(params.get("to"), 100);
  const bar = params.has("k")
    ? (k !== null && !params.has("from") && !params.has("to") ? k : null)
    : (from !== null && to !== null && from <= to ? { from, to } : null);
  if (bar === null || offset === null) return NextResponse.json({ ok: false, error: "Bară invalidă." }, { status: 400 });
  if (county.length > 100 || (kind && !(AUTHORITY_KINDS as readonly string[]).includes(kind)) || (role === "supplier" && params.get("similar") === "1"))
    return NextResponse.json({ ok: false, error: "Grup invalid." }, { status: 400 });
  const peers = { ...(params.get("similar") === "1" ? { similar: true as const } : {}), ...(params.get("activity") === "1" ? { activity: true as const } : {}) };
  const spec = { filters: { ...(county ? { county } : {}), ...(kind ? { authorityKind: kind } : {}) }, ...(Object.keys(peers).length ? { peers } : {}) };
  try {
    const data = await db().begin("read only", async (tx) => {
      await tx.unsafe(FORCE_CUSTOM_PLANS);
      await tx.unsafe("set local statement_timeout = '8s'");
      return peerMembers(tx as unknown as DbSql, role, id, spec, bar, offset);
    });
    if (!data) return NextResponse.json({ ok: false, error: "Entitatea are sub 10 achiziții directe: nu are un grup de comparație." }, { status: 404 });
    if ("error" in data) return NextResponse.json({ ok: false, error: data.error }, { status: 422 });
    return NextResponse.json({ ok: true, ...data }, { headers: { "cache-control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Lista nu a putut fi citită acum. Reîncearcă." }, { status: 503 });
  }
}
