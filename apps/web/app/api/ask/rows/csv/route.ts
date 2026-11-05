import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { NEWER_VERSION_LINK, validateSpec } from "../../../../../lib/ask/spec";
import { localityScopeError } from "../../../../../lib/ask/question-ui";
import { ground } from "../../../../../lib/ask/ground";
import {
  runRows,
  CSV_MAX_ROWS,
} from "../../../../../lib/ask/compile";
import { evidenceOptions } from "../../../../../lib/ask/evidence-request";
import { evidenceCsv } from "../../../../../lib/ask/evidence";
import { devlog } from "../../../../../lib/devlog";
import { queryFailureResponse } from "../../../../../lib/api-error";
import { connectionEvidenceError, withConnectionEvidence } from "../../../../../lib/connection-evidence";
import { peerEvidenceError, peerEvidenceOptions, withPeerEvidence } from "../../../../../lib/peers-evidence";

/**
 * POST /api/ask/rows/csv — full-result CSV export of the drill rows behind an
 * answer: ALL rows matching the spec (not one page), same sort/stream as the
 * on-screen table, capped at CSV_MAX_ROWS. Includes the e-licitatie/TED source
 * links so every exported row stays verifiable.
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
  // Refused here too when a peer or connection selection replaces the spec it was sent with (plan F0a).
  const v = validateSpec(body.spec, { refuseNewer: NEWER_VERSION_LINK });
  if ("error" in v) return NextResponse.json({ ok: false, error: v.error }, { status: v.newer ? 422 : 400 });
  const localityError = localityScopeError(v);
  if (localityError) return NextResponse.json({ ok: false, error: localityError }, { status: 400 });
  const opts = evidenceOptions(body);
  if ("error" in opts) return NextResponse.json({ ok: false, error: opts.error }, { status: 400 });
  opts.limit = CSV_MAX_ROWS;
  devlog("csv", { spec: v, ...opts });
  opts.signal = req.signal;

  const sql = db();
  try {
    const result = body.peer !== undefined
      ? await withPeerEvidence(sql, body.peer, async (q,bound)=>runRows(q,bound.spec,bound.grounding,0,peerEvidenceOptions(bound,opts)))
      : body.connection !== undefined
      ? await withConnectionEvidence(sql, body.connection, async (q, bound) => runRows(q, bound.spec, bound.grounding, 0, opts))
      : await runRows(sql, v, await ground(sql, v.filters, v.population), 0, opts);
    if ("error" in result) {
      // A trend's months moved with the data since its answer (plan §2.8): reload, never another list.
      return NextResponse.json({ ok: false, error: result.error }, { status: "conflict" in result ? 409 : 200 });
    }
    const truncated = result.total > result.rows.length;
    const name = truncated
      ? `randuri-primele-${result.rows.length}-din-${result.total}.csv`
      : `randuri-${result.rows.length}.csv`;
    // ﻿ BOM: Excel otherwise misreads UTF-8 diacritics.
    const csv = evidenceCsv(result.rows);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}"`,
        "x-total-rows": String(result.total),
        "x-exported-rows": String(result.rows.length),
        "x-source-rows": String(result.sourceTotal),
        "x-source-value": result.sourceValue,
        "x-filtered-value": result.value,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    const connectionError = (body.peer !== undefined ? peerEvidenceError(e) : null) ?? connectionEvidenceError(e);
    if (connectionError) return NextResponse.json({ ok: false, error: connectionError.error }, { status: connectionError.status });
    return queryFailureResponse("api/ask/rows/csv", e, {
      timeout: "Exportul a depășit limita de timp (20s). Restrânge întrebarea (un județ, o perioadă) și încearcă din nou.",
      failure: "Exportul nu a putut fi generat. Încearcă din nou.",
      timeoutStatus: 200,
    });
  }
}
