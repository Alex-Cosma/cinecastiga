import { runMonitoredCli } from "../monitoring/cli.js";
import { runCoverage } from "../normalize/coverage.js";
import { createDb } from "@seap/db";
import { runFlags } from "../flags/build.js";
import { runFlagMarts } from "../flags/marts.js";
import { runRadiografieMarts } from "../flags/radiografie.js";

/**
 * Recompute DA red-flags into core.flags, then rebuild the flag marts (CRI +
 * concentration + partners + browsable instances).
 *   pnpm --filter ingestion flags
 */
async function main(): Promise<void> {
  const { sql } = createDb();
  await runMonitoredCli(sql, "flags", async () => {
    const log = (m: string) => console.log(m);
    const flags = await runFlags(sql, { log });
    const marts = await runFlagMarts(sql, { log });
    const radiografie = await runRadiografieMarts(sql, { log });
    await runCoverage(sql);
    console.log(JSON.stringify({ flags, marts, radiografie }, null, 2));
  });
}

main().catch((err) => {
  console.error("flags crashed:", err);
  process.exit(1);
});
