import { NextResponse } from "next/server";

/**
 * A failed query's answer for the Ask routes (audit Q1F7, 5 Nov 2026). Postgres error text (relation, column and
 * constraint names, fragments of SQL) stays in the server log; the visitor gets the route's Romanian sentence. A
 * statement timeout keeps its own sentence, so the visitor knows to narrow the question.
 */
export interface QueryFailureCopy {
  /** The sentence for a statement timeout. */
  timeout: string;
  /** The sentence for any other failure. */
  failure: string;
  /** The status of a timeout answer (the routes differ; each keeps its own). Others are 500. */
  timeoutStatus?: number;
  /** Fields the route always returns next to `error` (the Ask answer echoes its spec and question). */
  extra?: Record<string, unknown>;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function isStatementTimeout(e: unknown): boolean {
  return errorMessage(e).includes("statement timeout");
}

/** Logs the failure for the operator and answers the visitor without its text. */
export function queryFailureResponse(route: string, e: unknown, copy: QueryFailureCopy): NextResponse {
  const timeout = isStatementTimeout(e);
  const code = typeof (e as { code?: unknown } | null)?.code === "string" ? (e as { code: string }).code : undefined;
  console[timeout ? "warn" : "error"](`[${route}] query ${timeout ? "timed out" : "failed"}${code ? ` (${code})` : ""}: ${errorMessage(e)}`);
  return NextResponse.json(
    { ok: false, error: timeout ? copy.timeout : copy.failure, ...copy.extra },
    { status: timeout ? copy.timeoutStatus ?? 500 : 500 },
  );
}
