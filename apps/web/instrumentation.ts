/**
 * Runs once when the Next server starts, before it answers a request. The web server's pools close a connection idle
 * for 30 s (packages/db/src/client.ts, audit P1F1, 5 Nov 2026): it opens about thirty small pools, and without a limit
 * each kept every connection it ever opened until max_lifetime. An operator value already in the environment wins.
 * The workers under scripts/ do not run this file and keep their connections.
 */
export function register(): void {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  process.env.SEAP_DB_IDLE_TIMEOUT_SECONDS ??= "30";
  // One pool for the pages and APIs (launch audit, 12 November 2026). The web's whole budget, with Ask (6), facets (3),
  // intent (4), topic intent (2), the gate (2) and a digest (2): 33 connections; the documents worker holds 30 on the
  // same role, whose limit is 64 (infra/prod/app-grants.sql), leaving the collector and the nightly run their room.
  process.env.SEAP_DB_SHARED_POOL_MAX ??= "14";
}
