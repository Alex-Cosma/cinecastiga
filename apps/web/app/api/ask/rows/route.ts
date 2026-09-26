import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { validateSpec } from "../../../../lib/ask/spec";
import { ground } from "../../../../lib/ask/ground";
import { runRows } from "../../../../lib/ask/compile";
import { evidenceOptions } from "../../../../lib/ask/evidence-request";
import { devlog } from "../../../../lib/devlog";
import { connectionEvidenceError, withConnectionEvidence } from "../../../../lib/connection-evidence";
import { peerEvidenceError, peerEvidenceOptions, withPeerEvidence } from "../../../../lib/peers-evidence";

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
  if (body.peer !== undefined && body.connection !== undefined) return NextResponse.json({ok:false,error:"Alege o singură selecție documentată."},{status:400});
  const v = validateSpec(body.spec);
  if ("error" in v) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  const page = Number.isFinite(Number(body.page)) ? Math.max(0, Math.floor(Number(body.page))) : 0;
  const opts = evidenceOptions(body);
  if ("error" in opts) return NextResponse.json({ ok: false, error: opts.error }, { status: 400 });
  devlog("drill", { spec: v, page, ...opts });
  opts.signal = req.signal;

  const sql = db();
  try {
    const result = body.peer !== undefined
      ? await withPeerEvidence(sql, body.peer, async (q,bound)=>runRows(q,bound.spec,bound.grounding,page,peerEvidenceOptions(bound,opts)))
      : body.connection !== undefined
      ? await withConnectionEvidence(sql, body.connection, async (q, bound) => runRows(q, bound.spec, bound.grounding, page, opts))
      : await runRows(sql, v, await ground(sql, v.filters), page, opts);
    if ("error" in result) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
    }
    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const connectionError = (body.peer !== undefined ? peerEvidenceError(e) : null) ?? connectionEvidenceError(e);
    if (connectionError) return NextResponse.json({ ok: false, error: connectionError.error }, { status: connectionError.status });
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg.includes("statement timeout")
      ? "Lista completă a depășit 20 de secunde. Restrânge întrebarea la o instituție, un județ sau o perioadă și încearcă din nou."
      : "Sursele nu au putut fi încărcate. Încearcă din nou." }, { status: 500 });
  }
}
