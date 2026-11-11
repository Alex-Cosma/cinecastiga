import { createDb, type Db } from "@seap/db";

/**
 * Process-wide db handle. postgres.js pools internally — scrape jobs share
 * this instead of opening/closing per execution.
 */
let shared: ReturnType<typeof createDb> | null = null;

export function getSharedDb(): Db {
  shared ??= createDb(undefined,{max:16});
  return shared.db;
}

/** The first call sizes the pool: the collector's `run` asks for one connection per lane (collection-limits.ts) and
 * gives idle ones back, so the site, the documents and the nightly processing keep theirs within max_connections. */
export function getSharedSql(options?:{max:number;idleTimeout?:number}) { shared ??= createDb(undefined,options??{max:16}); return shared.sql; }

export async function closeSharedDb(): Promise<void> {
  if (shared) {
    // A released, lifetime-expired reserved connection can otherwise stall shutdown.
    await shared.sql.end({ timeout: 10 });
    shared = null;
  }
}
