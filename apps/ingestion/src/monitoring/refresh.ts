import { runContractMoneyQuality } from "../normalize/contract-money-quality.js";
import { repairContractTypes } from '../normalize/contract-reporting.js';
import { CONTRACT_REPORTING_VERSION, assertContractIdentityQuality, assertContractExclusionsQuality, buildShadowRefresh, publishMonitoringRefresh, type Db, type DbSql, type PendingCheckpoint, type SnapshotHashCache } from "@seap/db";
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
  contractIdentity: "verified-publications-3-discovery", contractReporting: CONTRACT_REPORTING_VERSION, contractMoney: "source-currency-1", monitoring: "monitoring-refresh-1", flags: METHODOLOGY_VERSION,
  tedNormalization: TED_NORMALIZATION_VERSION, transactionPopulation: "batch1-canonical-1", procurementCalendar: "Europe/Bucharest-v1",
};

export interface RefreshOptions {
  mode: "coordinated" | "baseline"; log?: (message: string) => void; timeoutMs?: number;
  scope?: RefreshScope; onStage?: (name: MonitoringStage | "validation") => Promise<void>;
  maxRawId?: bigint; repairContractIdentities?: () => Promise<unknown>; maxQuarantined?: number;
  /** One processing run's snapshot hash memo, shared with repairContractIdentities:
   * the identity gates of identity-quality, reconcile and marts reuse hashes
   * while their sources are unchanged; the validation recomputes all of them. */
  identityHashes?: SnapshotHashCache;
}

/** Does not scrape. A baseline validates existing data without rewriting its timestamps. */
export async function runMonitoringRefresh(db: Db, sql: DbSql, options: RefreshOptions) {
  if (options.mode === 'baseline' && (options.scope ?? "full") === 'daily') throw new Error('A daily update must process and validate its data');
  // The publication's own `running` row is the newest: the previous checkpoint is the one before it.
  return publishMonitoringRefresh(sql, options.mode, MONITORING_METHODOLOGY, () => refreshWork(db, sql, options, 1));
}

/**
 * The blue/green build (owner, 9 November 2026): the same stages and validation, through a connection that writes the
 * shadow schemas, with the site open. Publishes nothing: returns the checkpoint the swap will publish.
 */
export async function runShadowRefresh(db: Db, sql: DbSql, options: Omit<RefreshOptions, "mode">): Promise<PendingCheckpoint> {
  // No row of its own: the previous checkpoint is the newest one.
  return buildShadowRefresh(sql, MONITORING_METHODOLOGY, () => refreshWork(db, sql, { ...options, mode: "coordinated" }, 0));
}

async function refreshWork(db: Db, sql: DbSql, options: RefreshOptions, previousOffset: 0 | 1) {
  const identityHashes = options.identityHashes;
  const log = options.log ?? (() => {});
  const scope = options.scope ?? "full";
  {
    // Keep the previous verified risk date instead of pretending a daily refresh
    // recalculated signals. Read under the publication gate, before any writes.
    const [previous] = await sql`select id, completed_at, validation, status, kind, methodology from app.monitoring_refreshes
      order by version desc offset ${previousOffset} limit 1`;
    const previousValidation = previous?.validation as Record<string, any> | undefined;
    const retainedRisk = previousValidation?.risk ? {...previousValidation.risk,checkpointId:previousValidation.risk.checkpointId??String(previous!.id)} : (previousValidation?.stages?.flags && previousValidation?.stages?.['flag-marts']
      ? { checkpointId: String(previous!.id), calculatedAt: new Date(previous!.completed_at).toISOString() } : null);
    if (scope === "daily" && (!retainedRisk || previous?.status!=='ready' || previous?.kind!=='coordinated' || previous?.methodology?.flags!==METHODOLOGY_VERSION)) throw new Error("Daily refresh requires a verified full risk baseline with the same methodology");
    if (scope === 'daily' && previous?.methodology?.contractReporting!==CONTRACT_REPORTING_VERSION)
      throw Error('Contract reporting policy changed; a full verified publication is required before retaining old risk');
    const stages = options.mode === "baseline" ? {} : await executeMonitoringStages({
      normalize: () => runNormalize(db, sql, { log, ...(options.maxRawId === undefined ? {} : {maxRawId:options.maxRawId}) }),
      "money-quality": async () => {
        await repairContractTypes(sql, options.maxRawId);
        return runContractMoneyQuality(sql);
      },
      "identity-repair": () => options.repairContractIdentities?.() ?? Promise.resolve(null),
      "identity-quality": async () => ({identities:await assertContractIdentityQuality(sql, identityHashes),exclusions:await assertContractExclusionsQuality(sql, identityHashes)}),
      reconcile: () => runReconcile(sql, { log, ...(identityHashes ? {identityHashes} : {}) }),
      "ted-mart": () => runTedMart(sql, { log }),
      marts: () => runMarts(sql, { log, ...(identityHashes ? {identityHashes} : {}) }),
      flags: () => runFlags(sql, { log }),
      "flag-marts": () => runFlagMarts(sql, { log, transactions:false }),
      transactions: () => runTransactionMarts(sql,{log}),
      radiografie: () => runRadiografieMarts(sql, { log }),
      coverage: () => runCoverage(sql),
    }, log, { scope, ...(options.onStage ? {onStage:options.onStage} : {}), ...(options.maxQuarantined === undefined ? {} : {maxQuarantined:options.maxQuarantined}) });
    await options.onStage?.("validation");
    return sql.begin("isolation level repeatable read read only", async tx => {
      const q = tx as unknown as DbSql;
      await q`select set_config('statement_timeout', ${String(options.timeoutMs ?? 900_000)}, true)`;
      log("monitoring refresh: validating the complete snapshot");
      const checks = await validateBatch1Snapshot(q, { fullProfiles: true, allAnnual: true, ...(identityHashes ? {identityHashes} : {}) }, check => log(`${check.passed ? "passed" : "FAILED"}: ${check.check}`));
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
  }
}
