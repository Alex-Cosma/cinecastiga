import { createDb } from "@seap/db";
import { runTedMart } from "../normalize/ted-mart.js";

/**
 * Build the TED award mart (labeled, no-blend surfacing of TED into the app).
 *   pnpm --filter ingestion ted-mart
 * Reads core.ted_* + core.award_links + core.entities; standalone (independent of
 * the e-licitatie marts build). Idempotent (truncate + rebuild).
 */
async function main(): Promise<void> {
  const { sql } = createDb();
  await sql`set work_mem = '256MB'`;
  await sql`set temp_file_limit = '30GB'`;
  const report = await runTedMart(sql, { log: (m) => console.log(m) });
  console.log(JSON.stringify(report, null, 2));
  await sql.end();
}

main().catch(async (err) => {
  console.error("ted-mart build crashed:", err);
  process.exit(1);
});
