import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { NEWER_VERSION_LINK, validateSpec, type AskSpec } from "@/lib/ask/spec";
import { localityScopeError } from "@/lib/ask/question-ui";
import { ground } from "@/lib/ask/ground";
import {
  runSpec,
  TABLE_SORTS,
  type TableOpts,
  type TableSort,
} from "@/lib/ask/compile";
import { buildPills } from "@/lib/ask/pills";
import { answerLabels } from "../../../lib/ask/filters/title";
import { trendListSpec, type TrendList } from "@/lib/ask/trend-shared";
import { interpret } from "@/lib/ask/llm";
import { resolvedSpec } from "@/lib/ask/resolved-spec";
import { devlog } from "@/lib/devlog";
import { cpvCodeName, isCpvCodeTerm } from "../../../lib/ask/cpv-label";
import { readableCpvName } from "../../../lib/entity-summary";
import { NATURAL_LANGUAGE_ENABLED, NATURAL_LANGUAGE_UNAVAILABLE } from "@/lib/ask/features";

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
    return NextResponse.json(
      { ok: false, error: "Body invalid (JSON)." },
      { status: 400 },
    );
  }

  let spec: AskSpec;
  let question: string | null = null;
  let model: string | null = null;

  if (typeof body.question === "string" && body.question.trim().length > 0) {
    if (!NATURAL_LANGUAGE_ENABLED) {
      return NextResponse.json(
        { ok: false, error: NATURAL_LANGUAGE_UNAVAILABLE },
        { status: 501 },
      );
    }
    question = body.question.trim().slice(0, 500);
    const it = await interpret(question);
    if ("error" in it) {
      return NextResponse.json(
        { ok: false, error: it.error },
        { status: it.status ?? 500 },
      );
    }
    spec = it.spec;
    model = it.model;
  } else if (body.spec !== undefined) {
    // A key this release reads but does not apply is refused before grounding (plan F0a).
    const v = validateSpec(body.spec, { refuseNewer: NEWER_VERSION_LINK });
    if ("error" in v) {
      return NextResponse.json({ ok: false, error: v.error }, { status: v.newer ? 422 : 400 });
    }
    spec = v;
  } else {
    return NextResponse.json(
      { ok: false, error: "Trimite { question } sau { spec }." },
      { status: 400 },
    );
  }

  // a locality the view cannot honour is refused, as in the builder (never run degenerate or ignored)
  const localityError = localityScopeError(spec);
  if (localityError) return NextResponse.json({ ok: false, error: localityError, spec }, { status: 400 });

  const tableOpts: TableOpts = {};
  if (Number.isFinite(Number(body.tablePage)))
    tableOpts.page = Math.max(0, Math.floor(Number(body.tablePage)));
  if (
    typeof body.tableSort === "string" &&
    (TABLE_SORTS as readonly string[]).includes(body.tableSort)
  )
    tableOpts.sort = body.tableSort as TableSort;
  if (body.tableDir === "asc" || body.tableDir === "desc")
    tableOpts.dir = body.tableDir;

  const sql = db();
  // A CPV code's name beside the answer (S4: the title said „CPV 45” until the page's own lookup came back).
  const cpvTerm = spec.filters.cpvTerm === undefined ? "" : String(spec.filters.cpvTerm);
  const cpvName = isCpvCodeTerm(cpvTerm) ? cpvCodeName(sql, cpvTerm).catch(() => null) : Promise.resolve(null);
  try {
    const grounding = await ground(sql, spec.filters, spec.population);
    const result = await runSpec(sql, spec, grounding, tableOpts);
    if ("error" in result) {
      devlog("ask", { question, spec, ok: false, error: result.error });
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          caveats: result.caveats,
          spec,
          question,
        },
        { status: 200 },
      );
    }
    devlog("ask", { question, spec, ok: true, tookMs: result.tookMs });
    const codeName = await cpvName;
    // The words of each display state of the strip, with the same functions (plan §2.3): the map's lens,
    // and each list of a trend (its group buttons switch on the lists already fetched).
    const executedMonths = result.executed?.months;
    const byList = result.displaySqlByList;
    const variants = result.displaySqlByMeasure || byList ? {
      ...(result.displaySqlByMeasure ? { measure: Object.fromEntries((Object.keys(result.displaySqlByMeasure) as ("value" | "count" | "value_per_capita")[]).map((measure) => [measure, {
        pills: buildPills({ ...spec, measure }, grounding, { executedMonths }), displaySql: result.displaySqlByMeasure![measure],
      }])) } : {}),
      ...(byList ? { trend: Object.fromEntries((Object.keys(byList) as TrendList[]).map((list) => [list, {
        pills: buildPills(trendListSpec(spec, list), grounding, { executedMonths }), displaySql: byList[list]!,
      }])) } : {}),
    } : undefined;
    return NextResponse.json({
      ok: true,
      question,
      model,
      spec: resolvedSpec(spec, grounding),
      ...(codeName ? { cpvName: readableCpvName(codeName) } : {}),
      executedAt: new Date().toISOString(),
      pills: buildPills(spec, grounding, { executedMonths: result.executed?.months, peerGroup: answerLabels(result).peerGroup }),
      caveats: result.caveats,
      data: result.data,
      ...(result.partialYears ? { partialYears: result.partialYears } : {}),
      // A trend's months as executed; `spec` keeps `auto` (plan §2.8).
      ...(result.executed ? { executed: result.executed } : {}),
      displaySql: result.displaySql,
      ...(variants ? { variants } : {}),
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
