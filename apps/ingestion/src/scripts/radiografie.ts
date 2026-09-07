import { createDb } from "@seap/db";
import { runRadiografieMarts } from "../flags/radiografie.js";

/**
 * Rebuild the radiografie marts (notice_meta, supplier_dependency, da_slicing,
 * lot_patterns, pattern_elsewhere) without touching flags or the other marts.
 *   pnpm --filter ingestion radiografie
 */
async function main(): Promise<void> {
  const { sql } = createDb();
  const report = await runRadiografieMarts(sql, { log: (m) => console.log(m) });
  console.log(JSON.stringify(report, null, 2));
  await sql.end();
}

main().catch((err) => {
  console.error("radiografie crashed:", err);
  process.exit(1);
});
