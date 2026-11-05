import { createDb, type DbSql } from "@seap/db";

/**
 * The web's main pool, the one lib/marts.ts, the signal sources, the TED table and others already share through
 * globalThis.__seapSql: one per process, kept across dev reloads. Never end it. Pages and routes that opened a pool per
 * request (audit P1F1, 5 Nov 2026: up to 10 connections each, closed after the response) read through this one.
 */
const g = globalThis as unknown as { __seapSql?: DbSql };
export const sharedSql = (): DbSql => (g.__seapSql ??= createDb().sql);
