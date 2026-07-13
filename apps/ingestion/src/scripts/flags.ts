import { createDb } from "@seap/db";
import { runFlags } from "../flags/build.js";
import { runFlagMarts } from "../flags/marts.js";

/**
 * Recompute DA red-flags into core.flags, then rebuild the flag marts (CRI +
 * concentration + partners + browsable instances).
 *   pnpm --filter ingestion flags
 */
async function main(): Promise<void> {
  const { sql } = createDb();
  const log = (m: string) => console.log(m);
  const flags = await runFlags(sql, { log });
  const marts = await runFlagMarts(sql, { log });
  console.log(JSON.stringify({ flags, marts }, null, 2));
  await sql.end();
}

main().catch((err) => {
  console.error("flags crashed:", err);
  process.exit(1);
});
