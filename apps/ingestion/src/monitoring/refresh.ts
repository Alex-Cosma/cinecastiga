import { runContractMoneyQuality } from "../normalize/contract-money-quality.js";
import { assertContractIdentityQuality, publishMonitoringRefresh, type Db, type DbSql } from "@seap/db";
import { runNormalize } from "../normalize/pipeline.js";
import { runReconcile } from "../normalize/reconcile.js";
import { runTedMart } from "../normalize/ted-mart.js";
import { runMarts } from "../normalize/marts.js";
import { runFlags } from "../flags/build.js";
import { runFlagMarts } from "../flags/marts.js";
import { runRadiografieMarts } from "../flags/radiografie.js";
import {runTransactionMarts} from "../normalize/transaction-marts.js";
import { runCoverage } from "../normalize/coverage.js";
import { METHODOLOGY_VERSION } from "../flags/methodology.js";
import { TED_NORMALIZATION_VERSION } from "../normalize/ted.js";
import { executeMonitoringStages, type MonitoringStage, type RefreshScope } from "./pipeline.js";
import { validateBatch1Snapshot } from "./validate.js";
import { monitoringSourceCoverage, validateCoverageCounts } from "./coverage.js";

export const MONITORING_METHODOLOGY = {
  contractIdentity: "verified-publications-2-latest", contractMoney: "source-currency-1", monitoring: "monitoring-refresh-1", flags: METHODOLOGY_VERSION,
  tedNormalization: TED_NORMALIZATION_VERSION, transactionPopulation: "batch1-canonical-1", procurementCalendar: "Europe/Bucharest-v1",
};

/** Does not scrape. A baseline validates existing data without rewriting its timestamps. */
export async function runMonitoringRefresh(db: Db, sql: DbSql, options: {
  mode: "coordinated" | "baseline"; log?: (message: string) => void; timeoutMs?: number;
  scope?: RefreshScope; onStage?: (name: MonitoringStage | "validation") => Promise<void>;
  maxRawId?: bigint; repairContractIdentities?: () => Promise<unknown>;
}) {
  const log = options.log ?? (() => {});
  const scope = options.scope ?? "full";
  if (options.mode === 'baseline' && scope === 'daily') throw new Error('A daily update must process and validate its data');
  return publishMonitoringRefresh(sql, options.mode, MONITORING_METHODOLOGY, async () => {
    // Keep the previous verified risk date instead of pretending a daily refresh
    // recalculated signals. Read under the publication gate, before any writes.
    const [previous] = await sql`select id, completed_at, validation, status, kind, methodology from app.monitoring_refreshes
      order by version desc offset 1 limit 1`;
    const previousValidation = previous?.validation as Record<string, any> | undefined;
    const retainedRisk = previousValidation?.risk ? {...previousValidation.risk,checkpointId:previousValidation.risk.checkpointId??String(previous!.id)} : (previousValidation?.stages?.flags && previousValidation?.stages?.['flag-marts']
      ? { checkpointId: String(previous!.id), calculatedAt: new Date(previous!.completed_at).toISOString() } : null);
    if (scope === "daily" && (!retainedRisk || previous?.status!=='ready' || previous?.kind!=='coordinated' || previous?.methodology?.flags!==METHODOLOGY_VERSION)) throw new Error("Daily refresh requires a verified full risk baseline with the same methodology");
    const stages = options.mode === "baseline" ? {} : await executeMonitoringStages({
      normalize: () => runNormalize(db, sql, { log, ...(options.maxRawId === undefined ? {} : {maxRawId:options.maxRawId}) }),
      "money-quality": () => runContractMoneyQuality(sql),
      "identity-repair": () => options.repairContractIdentities?.() ?? Promise.resolve(null),
      "identity-quality": () => assertContractIdentityQuality(sql),
      reconcile: () => runReconcile(sql, { log }),
      "ted-mart": () => runTedMart(sql, { log }),
      marts: () => runMarts(sql, { log }),
      flags: () => runFlags(sql, { log }),
      "flag-marts": () => runFlagMarts(sql, { log, transactions:false }),
      transactions: () => runTransactionMarts(sql,{log}),
      radiografie: () => runRadiografieMarts(sql, { log }),
      coverage: () => runCoverage(sql),
    }, log, { scope, ...(options.onStage ? {onStage:options.onStage} : {}) });
    await options.onStage?.("validation");
    return sql.begin("isolation level repeatable read read only", async tx => {
      const q = tx as unknown as DbSql;
      await q`select set_config('statement_timeout', ${String(options.timeoutMs ?? 900_000)}, true)`;
      log("monitoring refresh: validating the complete snapshot");
      const checks = await validateBatch1Snapshot(q, { fullProfiles: true, allAnnual: true }, check => log(`${check.passed ? "passed" : "FAILED"}: ${check.check}`));
      checks.push(await validateCoverageCounts(q));
      if (checks.some(check => !check.passed)) throw new Error(`Snapshot checks failed: ${checks.filter(check => !check.passed).map(check => check.check).join(", ")}`);
      return { sourceCoverage: await monitoringSourceCoverage(q), validation: {
        mode: options.mode, scope: "full", refreshScope: scope, checks, stages,
        risk: scope === "daily" || options.mode === 'baseline' ? (retainedRisk ? { ...retainedRisk, recalculated: false } : null)
          : { calculatedAt: new Date().toISOString(), recalculated: true },
        existingSnapshot: options.mode === "baseline", collectionPerformed: false,
        rawBoundary: options.maxRawId?.toString() ?? null,
        checkedAt: new Date().toISOString(),
      } };
    });
  });
}
