/**
 * Runs once when the Next server starts, before it answers a request. The web server's database defaults
 * (packages/db/src/client.ts), unless the environment sets them (an operator's value wins):
 * - pools close a connection idle for 30 s (audit P1F1, 5 Nov 2026);
 * - one pool of 14 for the pages and APIs (launch audit, 12 November 2026). The web's whole budget, with Ask (6),
 *   facets (3), intent (4), topic intent (2), the gate (2) and a digest (2): 33 connections; the documents worker holds 30
 *   on the same role, whose limit is 64 (infra/prod/app-grants.sql), leaving the collector and the nightly run their room.
 * They are handed to the db package, never written into process.env: `next dev` reloaded every page in a loop when the
 * environment changed under it. The workers under scripts/ do not run this file.
 */
export const WEB_DB_DEFAULTS = { idleTimeout: 30, sharedPoolMax: 14 } as const;

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { setDbDefaults } = await import("@seap/db");
  setDbDefaults(WEB_DB_DEFAULTS);
}
