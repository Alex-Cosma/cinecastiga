import { createDb, type Db } from "@seap/db";

/**
 * Process-wide db handle. postgres.js pools internally — scrape jobs share
 * this instead of opening/closing per execution.
 */
let shared: ReturnType<typeof createDb> | null = null;

export function getSharedDb(): Db {
  shared ??= createDb();
  return shared.db;
}

export async function closeSharedDb(): Promise<void> {
  if (shared) {
    await shared.sql.end();
    shared = null;
  }
}
