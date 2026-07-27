import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { validateSpec } from "@/lib/ask/spec";
import { ground } from "@/lib/ask/ground";
import { runRows, DRILL_SORTS, type DrillOpts, type DrillSort } from "@/lib/ask/compile";
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
  let body: { spec?: unknown; page?: unknown; sort?: unknown; dir?: unknown; stream?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Body invalid (JSON)." }, { status: 400 });
  }
  const v = validateSpec(body.spec);
  if ("error" in v) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  const page = Number.isFinite(Number(body.page)) ? Math.max(0, Math.floor(Number(body.page))) : 0;
  const opts: DrillOpts = {};
  if (typeof body.sort === "string" && body.sort in DRILL_SORTS) opts.sort = body.sort as DrillSort;
  if (body.dir === "asc" || body.dir === "desc") opts.dir = body.dir;
  if (body.stream === "da" || body.stream === "contracts") opts.stream = body.stream;
  devlog("drill", { spec: v, page, ...opts });

  const sql = db();
  try {
    const grounding = await ground(sql, v.filters);
    const result = await runRows(sql, v, grounding, page, opts);
    if ("error" in result) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `Eroare la execuție: ${msg}` }, { status: 500 });
  }
}
