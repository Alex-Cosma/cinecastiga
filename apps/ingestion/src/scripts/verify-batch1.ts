import { createDb, type DbSql } from "@seap/db";
import { METHODOLOGY_VERSION } from "../flags/methodology.js";
import { validateBatch1Snapshot } from "../monitoring/validate.js";
import { TED_NORMALIZATION_VERSION } from "../normalize/ted.js";

/**
 * Verify the coordinated Batch 1 refresh. SELECTs only, in one repeatable-read
 * READ ONLY snapshot. No raw payloads, names, CUIs or contact data are printed.
 *
 * pnpm --filter ingestion exec tsx src/scripts/verify-batch1.ts
 * pnpm --filter ingestion exec tsx src/scripts/verify-batch1.ts --full-profiles --all-annual
 *
 * Default entity/annual checks are deterministic samples, explicitly reported.
 * National sums, role totals, contract allocations/eligibility, methodology,
 * stored flag-reference integrity and coverage shapes are always checked fully.
 * Exit 1 means failed/incomplete verification; expected during a partial refresh.
 */
const args = process.argv.slice(2);
const options = new Set(["--full-profiles", "--all-annual", "--profiles-per-role", "--annual-limit", "--timeout-ms", "--help"]);
function integerOption(name: string, fallback: number, maximum: number): number {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const value = args[i + 1];
  if (!value || !/^\d+$/.test(value)) throw new Error(`${name} requires a positive integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) throw new Error(`${name} must be 1..${maximum}`);
  return number;
}

interface Check {
  check: string;
  passed: boolean;
  scope: string;
  details: unknown;
}
const checks: Check[] = [];
const emit = (item: unknown) => console.log(JSON.stringify(item));
function report(check: string, passed: boolean, scope: string, details: unknown) {
  const result = { check, passed, scope, details };
  checks.push(result);
  emit(result);
}

async function main() {
  if (args.includes("--help")) {
    emit({ command: "pnpm --filter ingestion exec tsx src/scripts/verify-batch1.ts", readOnly: true,
      options: { "--full-profiles": "Check every entity/role, including missing profiles", "--all-annual": "Reconcile every annual split signal",
        "--profiles-per-role N": "First N IDs plus top N values per role (default100, max10000)",
        "--annual-limit N": "Sample across periods, ordered by flag ID (default500, max100000)",
        "--timeout-ms N": "Per-statement timeout (default180000, max3600000)" } });
    return;
  }
  for (let i = 0; i < args.length; i++) {
    if (!options.has(args[i]!)) throw new Error(`Unknown option: ${args[i]}`);
    if (["--profiles-per-role", "--annual-limit", "--timeout-ms"].includes(args[i]!)) i++;
  }
  const fullProfiles = args.includes("--full-profiles"), allAnnual = args.includes("--all-annual");
  const profileLimit = integerOption("--profiles-per-role", 100, 10_000);
  const annualLimit = integerOption("--annual-limit", 500, 100_000);
  const timeout = integerOption("--timeout-ms", 180_000, 3_600_000);
  const { sql } = createDb();
  const started = Date.now();
  emit({ verification: "batch1", startedAt: new Date(started).toISOString(), readOnly: true,
    snapshot: "repeatable read", expectedTedVersion: TED_NORMALIZATION_VERSION, expectedFlagVersion: METHODOLOGY_VERSION,
    profileSelection: fullProfiles ? "all" : `up to ${profileLimit * 2} profiles per role: first IDs plus highest values`,
    annualSelection: allAnnual ? "all" : `up to ${annualLimit}, interleaved across periods then flag ID`, timeoutMs: timeout,
    limits: "Checks internal consistency of this database snapshot. Does not establish source completeness, legal compliance, payment, or unchanged historical documents." });
  try {
    await sql.begin("isolation level repeatable read read only", async (transaction) => {
      const q = transaction as unknown as DbSql;
      await q`select set_config('statement_timeout', ${String(timeout)}, true)`;
      const [mode] = await q`select current_setting('transaction_read_only') read_only`;
      if (mode?.["read_only"] !== "on") throw new Error("Read-only transaction was not established");

      await validateBatch1Snapshot(q, { fullProfiles, allAnnual, profileLimit, annualLimit }, check => {
        report(check.check, check.passed, check.scope, check.details);
      });
    });
    const failed = checks.filter(check => !check.passed).map(check => check.check);
    emit({ verification: "batch1", completed: true, passed: failed.length === 0, checks: checks.length, failed, elapsedMs: Date.now() - started });
    if (failed.length) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  // PostgreSQL/driver diagnostics can contain parameters: never print raw errors.
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
  emit({ verification: "batch1", completed: false, passed: false, completedChecks: checks.length,
    error: code ? `Database verification stopped (SQLSTATE ${code})` : "Verification stopped; check arguments, canonical threshold seed and schema readiness." });
  process.exitCode = 1;
});
