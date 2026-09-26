import { publishMonitoringRefresh, type Db, type DbSql } from "@seap/db";
import { runNormalize } from "../normalize/pipeline.js";
import { runReconcile } from "../normalize/reconcile.js";
import { runTedMart } from "../normalize/ted-mart.js";
import { runMarts } from "../normalize/marts.js";
import { runFlags } from "../flags/build.js";
import { runFlagMarts } from "../flags/marts.js";
import { runRadiografieMarts } from "../flags/radiografie.js";
import { runCoverage } from "../normalize/coverage.js";
import { METHODOLOGY_VERSION } from "../flags/methodology.js";
import { TED_NORMALIZATION_VERSION } from "../normalize/ted.js";
import { executeMonitoringStages } from "./pipeline.js";
import { validateBatch1Snapshot } from "./validate.js";
import { monitoringSourceCoverage, validateCoverageCounts } from "./coverage.js";

export const MONITORING_METHODOLOGY = {
  monitoring: "monitoring-refresh-1", flags: METHODOLOGY_VERSION,
  tedNormalization: TED_NORMALIZATION_VERSION, transactionPopulation: "batch1-canonical-1",
};

/** Does not scrape. A baseline validates existing data without rewriting its timestamps. */
export async function runMonitoringRefresh(db: Db, sql: DbSql, options: {
  mode: "coordinated" | "baseline"; log?: (message: string) => void; timeoutMs?: number;
}) {
  const log = options.log ?? (() => {});
  return publishMonitoringRefresh(sql, options.mode, MONITORING_METHODOLOGY, async () => {
    const stages = options.mode === "baseline" ? {} : await executeMonitoringStages({
      normalize: () => runNormalize(db, sql, { log }),
      reconcile: () => runReconcile(sql, { log }),
      "ted-mart": () => runTedMart(sql, { log }),
      marts: () => runMarts(sql, { log }),
      flags: () => runFlags(sql, { log }),
      "flag-marts": () => runFlagMarts(sql, { log }),
      radiografie: () => runRadiografieMarts(sql, { log }),
      coverage: () => runCoverage(sql),
    }, log);
    return sql.begin("isolation level repeatable read read only", async tx => {
      const q = tx as unknown as DbSql;
      await q`select set_config('statement_timeout', ${String(options.timeoutMs ?? 900_000)}, true)`;
      log("monitoring refresh: validating the complete snapshot");
      const checks = await validateBatch1Snapshot(q, { fullProfiles: true, allAnnual: true }, check => log(`${check.passed ? "passed" : "FAILED"}: ${check.check}`));
      checks.push(await validateCoverageCounts(q));
      if (checks.some(check => !check.passed)) throw new Error(`Snapshot checks failed: ${checks.filter(check => !check.passed).map(check => check.check).join(", ")}`);
      return { sourceCoverage: await monitoringSourceCoverage(q), validation: {
        mode: options.mode, scope: "full", checks, stages,
        existingSnapshot: options.mode === "baseline", collectionPerformed: false,
        checkedAt: new Date().toISOString(),
      } };
    });
  });
}
