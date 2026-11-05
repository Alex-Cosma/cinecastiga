import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export const DEFAULT_DATABASE_URL =
  "postgres://seap:seap_dev@localhost:5432/seap";

/**
 * Seconds a pooled connection may sit idle before it closes, from
 * SEAP_DB_IDLE_TIMEOUT_SECONDS (a positive integer); unset keeps postgres.js's
 * default (never). The web server sets it in apps/web/instrumentation.ts so its
 * many small pools give back connections between bursts (audit P1F1,
 * 5 Nov 2026). Ingestion and the workers do not set it. A reserved connection
 * (`sql.reserve()`, which holds the advisory locks) is never closed for idling.
 */
export function idleTimeoutFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): number | undefined {
  const value = env["SEAP_DB_IDLE_TIMEOUT_SECONDS"];
  if (value === undefined || !/^[1-9]\d{0,5}$/.test(value)) return undefined;
  return Number(value);
}

export function createDb(url?: string, options?: {max?:number; idleTimeout?:number}) {
  const connectionString =
    url ?? process.env["DATABASE_URL"] ?? DEFAULT_DATABASE_URL;
  const idleTimeout = options?.idleTimeout ?? idleTimeoutFromEnv();
  const sql = postgres(connectionString, {max:options?.max??10, ...(idleTimeout ? {idle_timeout:idleTimeout} : {})});
  return { db: drizzle(sql, { schema }), sql };
}

export type Db = ReturnType<typeof createDb>["db"];
export type DbSql = ReturnType<typeof createDb>["sql"];
