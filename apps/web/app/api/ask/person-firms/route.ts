import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { FORCE_CUSTOM_PLANS } from "@/lib/plan-cache";
import { personFirms } from "@/lib/ask/person-firms";

/**
 * POST /api/ask/person-firms  { key: "<ONRC person key>" }
 *
 * "De la cine?" at a verification (plan §4.10, final fact_check §3.4): the
 * firms a person represents today that appear as suppliers, to choose one.
 * POST, not GET: the key holds a name and a birth date, which must not reach
 * the access logs each time the list unfolds (plan §2.5, facets). Read-only,
 * 8 s, on the Ask pool.
 */

const g = globalThis as unknown as { __seapAskSql?: DbSql };
function db(): DbSql {
  if (!g.__seapAskSql) g.__seapAskSql = createDb().sql;
  return g.__seapAskSql;
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Cerere invalidă." }, { status: 400 }); }
  const key = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).key : undefined;
  if (typeof key !== "string" || !key.trim() || key.length > 300 || Object.keys(body as object).some((k) => k !== "key"))
    return NextResponse.json({ ok: false, error: "Persoană invalidă." }, { status: 400 });
  try {
    const data = await db().begin("read only", async (tx) => {
      await tx.unsafe(FORCE_CUSTOM_PLANS);
      await tx.unsafe("set local statement_timeout = '8s'");
      return personFirms(tx as unknown as DbSql, key);
    });
    return NextResponse.json({ ok: true, data }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Firmele persoanei nu au putut fi citite acum. Reîncearcă." }, { status: 503 });
  }
}
