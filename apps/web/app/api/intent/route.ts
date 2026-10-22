import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { devlog } from "@/lib/devlog";
import { MAX_QUESTION_LENGTH, RULES_INTERPRETER_ID } from "@/lib/intent/rules";
import { interpretQuestion } from "@/lib/intent/server";
import type { IntentResult } from "@/lib/intent/types";

/**
 * GET /api/intent?q=…  — a question in the person's own words → how we
 * understood it (subject, place, period, institution, firm, intent), the
 * AskSpec the builder can edit and /api/ask can run, a plain sentence and
 * ready alternatives. Deterministic rules only (owner decision 1); nothing
 * is sent to an external service. Bounded: 300 characters, read-only
 * transaction with a statement timeout, small in-process cache.
 */

const g = globalThis as unknown as { __seapIntentSql?: DbSql; __seapIntentCache?: Map<string, { at: number; body: IntentResult }> };
function db(): DbSql {
  if (!g.__seapIntentSql) g.__seapIntentSql = createDb(undefined, { max: 4 }).sql;
  return g.__seapIntentSql;
}
const CACHE_MAX = 300;
const CACHE_MS = 10 * 60 * 1000;
const TIME_BUDGET_MS = 4000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("q") ?? "";
  const q = raw.replace(/\s+/g, " ").trim();
  if (q.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { error: `Întrebarea are peste ${MAX_QUESTION_LENGTH} de caractere. Scrie-o mai pe scurt.` },
      { status: 400 },
    );
  }
  if (q.length < 2) {
    return NextResponse.json({ error: "Scrie o întrebare." }, { status: 400 });
  }
  const now = new Date();
  // Relative periods ("anul trecut") depend on the date: part of the key.
  const key = `${now.getFullYear()}|${q.toLowerCase()}`;
  const cache = (g.__seapIntentCache ??= new Map());
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return respond(hit.body, 0, true);
  const started = Date.now();
  try {
    const body = await Promise.race([
      interpretQuestion(db(), q, { now }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("intent-timeout")), TIME_BUDGET_MS)),
    ]);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), body });
    const took = Date.now() - started;
    devlog("intent", { q, intent: body.interpretation.intent, confidence: body.interpretation.confidence, took });
    return respond(body, took, false);
  } catch (error) {
    devlog("intent", { q, error: String(error) });
    return NextResponse.json(
      { error: "Nu am putut interpreta întrebarea acum. Încearcă din nou sau construiește întrebarea pas cu pas." },
      { status: 503 },
    );
  }
}

function respond(body: IntentResult, tookMs: number, cached: boolean) {
  return NextResponse.json(
    { interpreter: RULES_INTERPRETER_ID, ...body, tookMs, cached },
    { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
