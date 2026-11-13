import { createDb } from "@seap/db";
import { runMonitoredCli } from "../monitoring/cli.js";
import { refreshOnrcRegistry } from "../reference/onrc-import.js";

/**
 * The operator's ONRC import (reference/onrc-import.ts holds the import itself): the newest snapshot published on
 * data.gov.ro replaces reference.onrc_firm and reference.company_reps, even when the register already has it.
 *
 *   pnpm --filter ingestion import-onrc [directory] [--keep]
 *     directory  where the two files are downloaded (default: agents-work/onrc at the repository root, ignored by Git and Docker)
 *     --keep     keep the downloaded files (about 1 GB) for another run; without it they are deleted afterwards
 *
 * On production the processing run does this by itself, weekly, as part of its coordinated publication
 * (runScheduledOnrcImport). This command is a monitored manual write: it leaves the checkpoint failed, and
 * Comparații, Legături, the watches and saving captures then refuse to answer until the next coordinated run
 * publishes. Use it on a development database, or on production only with the owner's consent for that pause.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const keepFiles = args.includes("--keep");
  const dir = args.find((a) => !a.startsWith("--")) ?? new URL("../../../../agents-work/onrc", import.meta.url).pathname;
  const { sql } = createDb();
  await runMonitoredCli(sql, "import-onrc", async () => {
    const outcome = await refreshOnrcRegistry(sql, { dir, keepFiles, force: true, log: console.log });
    console.log(JSON.stringify(outcome, null, 2));
  });
}

main().catch((err) => {
  console.error("import-onrc crashed:", err);
  process.exit(1);
});
