import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { NEWER_VERSION_LINK, validateSpec } from "../../../../lib/ask/spec";
import { localityScopeError } from "../../../../lib/ask/question-ui";
import { emptyHints } from "../../../../lib/ask/empty-hints";
import { queryFailureResponse } from "../../../../lib/api-error";

/**
 * POST /api/ask/empty — what an empty answer can still say (lib/ask/empty-hints.ts): { spec } →
 * { ok, searched, broader, all }. Asked by the empty answer only, after it is drawn.
 */

const g = globalThis as unknown as { __seapEmptySql?: DbSql };
function db(): DbSql {
  if (!g.__seapEmptySql) g.__seapEmptySql = createDb(undefined, { max: 2 }).sql;
  return g.__seapEmptySql;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as typeof body;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return NextResponse.json({ ok: false, error: "Body invalid (JSON)." }, { status: 400 });
  }
  const v = validateSpec(body.spec, { refuseNewer: NEWER_VERSION_LINK });
  if ("error" in v) return NextResponse.json({ ok: false, error: v.error }, { status: v.newer ? 422 : 400 });
  const localityError = localityScopeError(v);
  if (localityError) return NextResponse.json({ ok: false, error: localityError }, { status: 400 });
  try {
    const hints = await emptyHints(db(), v, { signal: req.signal });
    return NextResponse.json({ ok: true, ...hints }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return queryFailureResponse("api/ask/empty", e, { timeout: "Nu am putut căuta categoriile apropiate acum.", failure: "Nu am putut căuta categoriile apropiate acum." });
  }
}
