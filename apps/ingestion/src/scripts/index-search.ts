import { createDb } from "@seap/db";
import { indexEntities } from "../search/index-entities.js";

/**
 * Build/refresh the Meilisearch entity index from core + marts.
 *   pnpm --filter ingestion index-search
 *
 * Env: MEILISEARCH_URL (default http://localhost:7700),
 *      MEILISEARCH_KEY (default seap_dev_master_key).
 */
async function main(): Promise<void> {
  const { sql } = createDb();
  const report = await indexEntities(sql, { log: (m) => console.log(m) });
  console.log(JSON.stringify(report, null, 2));
  await sql.end();
}

main().catch((err) => {
  console.error("index-search crashed:", err);
  process.exit(1);
});
