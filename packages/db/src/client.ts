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

/**
 * Size of the one pool a process shares, from SEAP_DB_SHARED_POOL_MAX (a positive integer); unset means no sharing.
 * Launch audit, 12 November 2026: the web server opened about thirty pools of 10, up to ~300 connections against
 * Postgres's 100 shared with the collector and the documents worker; in a spike Postgres refused connections and the
 * maintenance gate closed the whole site. apps/web/instrumentation.ts sets it; ingestion and the workers do not.
 */
export function sharedPoolMaxFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): number | undefined {
  const value = env["SEAP_DB_SHARED_POOL_MAX"];
  if (value === undefined || !/^[1-9]\d{0,2}$/.test(value)) return undefined;
  return Number(value);
}

function openDb(url: string | undefined, options: {max?:number; idleTimeout?:number; shadow?:boolean} | undefined) {
  const connectionString =
    url ?? process.env["DATABASE_URL"] ?? DEFAULT_DATABASE_URL;
  const idleTimeout = options?.idleTimeout ?? idleTimeoutFromEnv();
  const pool = postgres(connectionString, {max:options?.max??10, ...(idleTimeout ? {idle_timeout:idleTimeout} : {})});
  const sql: typeof pool = options?.shadow ?? shadowBuildFromEnv() ? shadowSql(pool) : pool;
  return { db: drizzle(sql, { schema }), sql };
}

const shared = globalThis as unknown as { __seapSharedDb?: ReturnType<typeof openDb> };

/**
 * A database handle. With SEAP_DB_SHARED_POOL_MAX set (the web server), every call without arguments returns the same
 * pool of that size: modules no longer add a pool each. A caller that passes a URL or options keeps a pool of its own
 * (the maintenance gate, Ask, a size used as a concurrency limit); one that ends its pool must pass options, since
 * ending the shared one would close it for the whole process.
 */
export function createDb(url?: string, options?: {max?:number; idleTimeout?:number; shadow?:boolean}) {
  const sharedMax = url === undefined && options === undefined ? sharedPoolMaxFromEnv() : undefined;
  if (sharedMax !== undefined) return (shared.__seapSharedDb ??= openDb(undefined, { max: sharedMax }));
  return openDb(url, options);
}

export type Db = ReturnType<typeof createDb>["db"];
export type DbSql = ReturnType<typeof createDb>["sql"];
