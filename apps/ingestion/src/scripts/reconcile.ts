import { createDb } from "@seap/db";
import { runReconcile } from "../normalize/reconcile.js";

/**
 * Reconciliation CLI (#3): link TED lot-awards ↔ e-licitatie contracts.
 *   pnpm --filter ingestion reconcile
 *   pnpm --filter ingestion reconcile --value-tol 0.02 --date-tol 60
 * Idempotent (truncate + rebuild core.award_links). Run AFTER normalize.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const { sql } = createDb();
  const valueTol = arg("value-tol") ? Number(arg("value-tol")) : undefined;
  const dateTol = arg("date-tol") ? Number(arg("date-tol")) : undefined;
  const report = await runReconcile(sql, {
    ...(valueTol != null ? { valueTol } : {}),
    ...(dateTol != null ? { dateTolDays: dateTol } : {}),
    log: (m) => console.log(m),
  });
  console.log(JSON.stringify(report, null, 2));
  await sql.end();
}

main().catch(async (err) => {
  console.error("reconcile crashed:", err);
  process.exit(1);
});
