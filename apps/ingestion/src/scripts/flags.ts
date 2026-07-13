import { createDb } from "@seap/db";
import { runFlags } from "../flags/build.js";

/**
 * Recompute DA red-flags into core.flags (truncate + rebuild).
 *   pnpm --filter ingestion flags
 */
async function main(): Promise<void> {
  const { sql } = createDb();
  const report = await runFlags(sql, { log: (m) => console.log(m) });
  console.log(JSON.stringify(report, null, 2));
  await sql.end();
}

main().catch((err) => {
  console.error("flags crashed:", err);
  process.exit(1);
});
