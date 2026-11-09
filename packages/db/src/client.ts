import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";
import { shadowSql } from "./shadow.js";

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

/**
 * The blue/green build (owner, 9 November 2026): with SEAP_SHADOW_BUILD=1 every connection the process opens sends its
 * SQL to the shadow schemas (shadow.ts), the ones a module opens on its own included. Set only for the build command,
 * which also connects as the build role, never for the swap or the web.
 */
export function shadowBuildFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env["SEAP_SHADOW_BUILD"] === "1";
}

export function createDb(url?: string, options?: {max?:number; idleTimeout?:number; shadow?:boolean}) {
  const connectionString =
    url ?? process.env["DATABASE_URL"] ?? DEFAULT_DATABASE_URL;
  const idleTimeout = options?.idleTimeout ?? idleTimeoutFromEnv();
  const pool = postgres(connectionString, {max:options?.max??10, ...(idleTimeout ? {idle_timeout:idleTimeout} : {})});
  const sql: typeof pool = options?.shadow ?? shadowBuildFromEnv() ? shadowSql(pool) : pool;
  return { db: drizzle(sql, { schema }), sql };
}

export type Db = ReturnType<typeof createDb>["db"];
export type DbSql = ReturnType<typeof createDb>["sql"];
