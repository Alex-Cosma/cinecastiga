import { createDb } from "@seap/db";
import {
  createTedIncrementalClient,
  planTedIncremental,
  runTedIncremental,
  tedIncrementalConfig,
  type TedRequestMeter,
} from "../scrape/ted/incremental.js";

/**
 * Automatic TED import, invoked by infra/prod/process-nightly.sh before the raw
 * boundary freeze. Off unless TED_INCREMENTAL=on. Never touches the SEAP request
 * gate or proxies. Exit 0 also when deferred by a 429 or bounded by its budget;
 * exit 1 only on a failure the nightly log should show (publication continues
 * either way).
 *
 *   node apps/ingestion/dist/scripts/ted-incremental.js          # one bounded run
 *   node apps/ingestion/dist/scripts/ted-incremental.js --plan   # baseline + window, no network
 */

async function main(): Promise<number> {
  const plan = process.argv.includes("--plan");
  const config = tedIncrementalConfig();
  if (!config.enabled && !plan) {
    console.log(JSON.stringify({ event: "ted-incremental", status: "disabled", networkRequests: 0 }));
    return 0;
  }
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is required");
  const { sql } = createDb(url, { max: 2 });
  try {
    if (plan) {
      const planned = await planTedIncremental(sql, config, new Date());
      console.log(JSON.stringify({ event: "ted-incremental-plan", enabled: config.enabled, ...planned, config, networkRequests: 0 }));
      return 0;
    }
    const meter: TedRequestMeter = { requests: 0, retryAfterMs: null };
    const userAgent = process.env["SCRAPE_UA"] ?? "seap-analytics/0.1 (contact: cineseuita@gmail.com)";
    const client = createTedIncrementalClient(config, meter, { userAgent });
    const outcome = await runTedIncremental({ sql, client, meter, config, log: (m) => console.log(m) });
    console.log(JSON.stringify({ event: "ted-incremental", ...outcome }));
    return outcome.status === "failed" || outcome.status === "no-baseline" ? 1 : 0;
  } finally {
    await sql.end({ timeout: 10 });
  }
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((err) => {
    console.error(`ted-incremental crashed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
