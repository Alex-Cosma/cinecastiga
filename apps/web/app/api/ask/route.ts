import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { validateSpec, type AskSpec } from "@/lib/ask/spec";
import { ground } from "@/lib/ask/ground";
import { runSpec, TABLE_SORTS, type TableOpts, type TableSort } from "@/lib/ask/compile";
import { buildPills } from "@/lib/ask/pills";
import { interpret } from "@/lib/ask/llm";
import { devlog } from "@/lib/devlog";

/**
 * POST /api/ask
 *   { question: string }  → LLM interprets → spec → grounded → executed
 *   { spec: AskSpec }     → deterministic path, no LLM (also used by "refine")
 *
 * Response envelope mirrors the mockup: question → am înțeles (pills) →
 * acoperire & limite (caveats) → result block → displaySql.
 */

const g = globalThis as unknown as { __seapAskSql?: DbSql };
function db(): DbSql {
  if (!g.__seapAskSql) g.__seapAskSql = createDb().sql;
  return g.__seapAskSql;
}

export async function POST(req: Request) {
  let body: {
    question?: unknown;
    spec?: unknown;
    tablePage?: unknown;
    tableSort?: unknown;
    tableDir?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Body invalid (JSON)." }, { status: 400 });
  }

  let spec: AskSpec;
  let question: string | null = null;
  let model: string | null = null;

  if (typeof body.question === "string" && body.question.trim().length > 0) {
    question = body.question.trim().slice(0, 500);
    const it = await interpret(question);
    if ("error" in it) {
      return NextResponse.json({ ok: false, error: it.error }, { status: it.status ?? 500 });
    }
    spec = it.spec;
    model = it.model;
  } else if (body.spec !== undefined) {
    const v = validateSpec(body.spec);
    if ("error" in v) {
      return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
    }
    spec = v;
  } else {
    return NextResponse.json(
      { ok: false, error: "Trimite { question } sau { spec }." },
      { status: 400 },
    );
  }

  const tableOpts: TableOpts = {};
  if (Number.isFinite(Number(body.tablePage)))
    tableOpts.page = Math.max(0, Math.floor(Number(body.tablePage)));
  if (typeof body.tableSort === "string" && (TABLE_SORTS as readonly string[]).includes(body.tableSort))
    tableOpts.sort = body.tableSort as TableSort;
  if (body.tableDir === "asc" || body.tableDir === "desc") tableOpts.dir = body.tableDir;

  const sql = db();
  try {
    const grounding = await ground(sql, spec.filters);
    const result = await runSpec(sql, spec, grounding, tableOpts);
    if ("error" in result) {
      devlog("ask", { question, spec, ok: false, error: result.error });
      return NextResponse.json(
        { ok: false, error: result.error, caveats: result.caveats, spec, question },
        { status: 200 },
      );
    }
    devlog("ask", { question, spec, ok: true, tookMs: result.tookMs });
    return NextResponse.json({
      ok: true,
      question,
      model,
      spec,
      pills: buildPills(spec, grounding),
      caveats: result.caveats,
      data: result.data,
      displaySql: result.displaySql,
      tookMs: result.tookMs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const timeout = msg.includes("statement timeout");
    devlog("ask", { question, spec, ok: false, error: msg });
    return NextResponse.json(
      {
        ok: false,
        error: timeout
          ? "Interogarea a depășit limita de timp (20s). Încearcă o întrebare mai restrânsă (un județ, o perioadă)."
          : `Eroare la execuție: ${msg}`,
        spec,
        question,
      },
      { status: timeout ? 200 : 500 },
    );
  }
}
