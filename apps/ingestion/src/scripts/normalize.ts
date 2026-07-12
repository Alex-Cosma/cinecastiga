import { createDb } from "@seap/db";
import { runNormalize } from "../normalize/pipeline.js";
import { generateNameSuggestions } from "../normalize/suggestions.js";

/**
 * Raw→core normalization CLI.
 *   pnpm --filter ingestion normalize            # incremental
 *   pnpm --filter ingestion normalize --rebuild  # truncate derived + full replay
 *   pnpm --filter ingestion normalize --only da-detail:v1
 *   pnpm --filter ingestion normalize --suggest  # also run tier-3 fuzzy pass
 *   pnpm --filter ingestion normalize --suggest-only  # only the fuzzy pass
 */
function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const { db, sql } = createDb();
  const log = (m: string) => console.log(m);
  const only = arg("only");

  if (!process.argv.includes("--suggest-only")) {
    const report = await runNormalize(db, sql, {
      rebuild: process.argv.includes("--rebuild"),
      ...(only ? { only } : {}),
      log,
    });
    console.log(JSON.stringify(report, null, 2));
  }

  if (
    process.argv.includes("--suggest") ||
    process.argv.includes("--suggest-only")
  ) {
    const s = await generateNameSuggestions(db, sql, { log });
    console.log(JSON.stringify(s, null, 2));
  }

  await sql.end();
}

main().catch(async (err) => {
  console.error("normalize crashed:", err);
  process.exit(1);
});
