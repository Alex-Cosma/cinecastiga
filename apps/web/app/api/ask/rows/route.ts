import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { validateSpec } from "@/lib/ask/spec";
import { ground } from "@/lib/ask/ground";
import { runRows } from "@/lib/ask/compile";
import { evidenceOptions } from "@/lib/ask/evidence-request";
import { devlog } from "@/lib/devlog";

/**
 * POST /api/ask/rows — "go to data": the paginated transaction rows behind an
 * answer. { spec, page, sort?, dir?, stream? } → { rows, total, page, pageSize }.
 * Deterministic, no LLM. sort ∈ value|date|authority|supplier|county|cpv;
 * stream ∈ da|contracts (dataset "all" only).
 */

const g = globalThis as unknown as { __seapAskSql?: DbSql };
function db(): DbSql {
  if (!g.__seapAskSql) g.__seapAskSql = createDb().sql;
  return g.__seapAskSql;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as typeof body;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return NextResponse.json({ ok: false, error: "Body invalid (JSON)." }, { status: 400 });
  }
  const v = validateSpec(body.spec);
  if ("error" in v) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  const page = Number.isFinite(Number(body.page)) ? Math.max(0, Math.floor(Number(body.page))) : 0;
  const opts = evidenceOptions(body);
  if ("error" in opts) return NextResponse.json({ ok: false, error: opts.error }, { status: 400 });
  devlog("drill", { spec: v, page, ...opts });
  opts.signal = req.signal;

  const sql = db();
  try {
    const grounding = await ground(sql, v.filters);
    const result = await runRows(sql, v, grounding, page, opts);
    if ("error" in result) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
    }
    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg.includes("statement timeout")
      ? "Lista completă a depășit 20 de secunde. Restrânge întrebarea la o instituție, un județ sau o perioadă și încearcă din nou."
      : "Sursele nu au putut fi încărcate. Încearcă din nou." }, { status: 500 });
  }
}
