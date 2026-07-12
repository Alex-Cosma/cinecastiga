import { createDb } from "@seap/db";
import { runMarts } from "../normalize/marts.js";

/**
 * Rebuild the gold marts from core.
 *   pnpm --filter ingestion marts
 */
async function main(): Promise<void> {
  const { sql } = createDb();
  const report = await runMarts(sql, { log: (m) => console.log(m) });
  console.log(JSON.stringify(report, null, 2));
  await sql.end();
}

main().catch(async (err) => {
  console.error("marts build crashed:", err);
  process.exit(1);
});
