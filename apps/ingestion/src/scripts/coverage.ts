import { runMonitoredCli } from "../monitoring/cli.js";
import { createDb } from "@seap/db";
import { runCoverage } from "../normalize/coverage.js";

const { sql } = createDb();
await runMonitoredCli(sql, "coverage", async () => {
  await runCoverage(sql);
  console.log("Coverage observations refreshed; source completeness remains unverified.");
});
