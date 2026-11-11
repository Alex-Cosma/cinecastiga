import { runMonitoredCli } from "../monitoring/cli.js";
import { createDb } from "@seap/db";
import { loadDaItems } from "../import-old/load-da-items.js";

/**
 * Item lines of the 2020 dump's direct awards into core.da_items (unit prices, owner 11 November 2026). Requires the
 * awards already loaded (import-das). Idempotent on sicap_item_id; lines from live detail win. No source traffic.
 *
 *   pnpm --filter ingestion import-da-items [db-old-dir]   # default ../../db-old
 */
async function main(): Promise<void> {
  const dir = process.argv[2] ?? "../../db-old";
  const { db, sql } = createDb();
  await runMonitoredCli(sql, "import-da-items", async () => {
    const t0 = Date.now();
    const report = await loadDaItems(db, sql, `${dir}/directAcquisitionContractDetails.bson`, (m) => console.log(m));
    const [tot] = (await sql`select count(*)::int c from core.da_items`) as unknown as { c: number }[];
    console.log(JSON.stringify({ ...report, coreItemLines: tot!.c, seconds: Math.round((Date.now() - t0) / 1000) }, null, 2));
  });
}

main().catch((err) => {
  console.error("import-da-items crashed:", err);
  process.exit(1);
});
