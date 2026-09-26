/** Dedicated monitoring worker. Never starts scraping or sends email.
 * pnpm --filter web exec tsx scripts/monitoring-worker.ts [--once] [--interval-seconds=60] [--limit=100]
 * Durable pending work = active watches without a run on the latest ready checkpoint.
 */
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

export interface MonitoringWorkerReport {
  checkpointId: string; selected: number; completed: number; failed: number; skipped: number; moreMayRemain: boolean;
}
export interface MonitoringWorkerOptions { intervalMs: number; limit: number; once: boolean }
interface WorkerDependencies {
  check: (limit: number) => Promise<MonitoringWorkerReport>;
  log: (event: Record<string, unknown>) => void;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export function monitoringWorkerOptions(args: string[]): MonitoringWorkerOptions {
  if (args.some(arg => arg !== "--once" && !arg.startsWith("--interval-seconds=") && !arg.startsWith("--limit="))) {
    throw new Error("Invalid monitoring worker arguments");
  }
  const seconds = Number(args.find(arg => arg.startsWith("--interval-seconds="))?.slice(19) ?? "60");
  const limit = Number(args.find(arg => arg.startsWith("--limit="))?.slice(8) ?? "100");
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 3600 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error("Invalid monitoring worker interval or limit");
  }
  return { intervalMs: seconds * 1000, limit, once: args.includes("--once") };
}

/** Await each batch and its delay: ticks cannot overlap, including after a failure. */
export async function runMonitoringWorker(options: MonitoringWorkerOptions, dependencies: WorkerDependencies, signal: AbortSignal) {
  let failedLastCheck = false;
  const wait = dependencies.wait ?? (async (milliseconds: number, abort: AbortSignal) => { await sleep(milliseconds, undefined, { signal: abort }); });
  while (!signal.aborted) {
    try {
      const result = await dependencies.check(options.limit);
      failedLastCheck = result.failed > 0;
      // Allow-list operational fields. Never log thrown errors, source rows,
      // addresses, watch titles, URLs, database strings, or private identifiers.
      dependencies.log({ event: "monitoring_check", selected: result.selected, completed: result.completed,
        failed: result.failed, skipped: result.skipped, moreMayRemain: result.moreMayRemain });
    } catch {
      failedLastCheck = true;
      dependencies.log({ event: "monitoring_waiting", message: "No complete check was published. Waiting for verified data or retrying after an operational failure." });
    }
    if (options.once || signal.aborted) break;
    try { await wait(options.intervalMs, signal); }
    catch { if (!signal.aborted) throw new Error("Monitoring worker timer failed"); }
  }
  return { failedLastCheck };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: monitoring-worker.ts [--once] [--interval-seconds=60] [--limit=100]. Checks only active watches on complete verified snapshots; no scraping or email. SIGINT/SIGTERM stops after the current bounded batch.");
    return;
  }
  const options = monitoringWorkerOptions(args);
  try { loadEnvFile(resolve(import.meta.dirname, "../.env.local")); } catch { /* Deployment may supply the environment directly. */ }
  const { monitoringDatabase, checkAllMonitoringWatches } = await import("../lib/monitoring-engine");
  const sql = monitoringDatabase(), controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    console.log(JSON.stringify({ event: "monitoring_worker_started", intervalSeconds: options.intervalMs / 1000, limit: options.limit, once: options.once }));
    const result = await runMonitoringWorker(options, {
      check: limit => checkAllMonitoringWatches({ limit }, sql),
      log: event => console.log(JSON.stringify(event)),
    }, controller.signal);
    if (options.once && result.failedLastCheck) process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
    await sql.end();
    console.log(JSON.stringify({ event: "monitoring_worker_stopped" }));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch(() => {
    console.error("Monitoring worker stopped before completing its check. Verify arguments, database access and schema readiness; prior completed observations remain available.");
    process.exitCode = 1;
  });
}
