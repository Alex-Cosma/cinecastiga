import { createDb } from "@seap/db";
import { runNormalize } from "../normalize/pipeline.js";

/**
 * Raw→core normalization CLI.
 *   pnpm --filter ingestion normalize            # incremental
 *   pnpm --filter ingestion normalize --rebuild  # truncate derived + full replay
 *   pnpm --filter ingestion normalize --only da-detail:v1
 */
function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const { db, sql } = createDb();
  const only = arg("only");
  const report = await runNormalize(db, sql, {
    rebuild: process.argv.includes("--rebuild"),
    ...(only ? { only } : {}),
    log: (m) => console.log(m),
  });
  console.log(JSON.stringify(report, null, 2));
  await sql.end();
}

main().catch(async (err) => {
  console.error("normalize crashed:", err);
  process.exit(1);
});
