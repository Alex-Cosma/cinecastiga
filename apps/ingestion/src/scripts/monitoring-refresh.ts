import { createDb } from "@seap/db";
import { runMonitoringRefresh } from "../monitoring/refresh.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.length === 0) {
    console.log("Usage: pnpm --filter ingestion monitoring-refresh --run | --validate-existing\n--run: normalize → reconcile → TED mart → marts → flags → flag marts → Radiografie → coverage → full validation.\n--validate-existing: validate and publish the existing completed snapshot; no procurement writes or fresh collection claim.\nNeither mode performs collection. Failed or interrupted work blocks watch checks until a complete snapshot is published.");
    return;
  }
  if (args.length !== 1 || !["--run", "--validate-existing"].includes(args[0]!)) throw new Error("Select exactly --run or --validate-existing");
  const { db, sql } = createDb();
  try {
    const checkpoint = await runMonitoringRefresh(db, sql, { mode: args[0] === "--run" ? "coordinated" : "baseline", log: console.log });
    console.log(JSON.stringify({ id: checkpoint.id, version: checkpoint.version, status: checkpoint.status,
      kind: checkpoint.kind, startedAt: checkpoint.startedAt, completedAt: checkpoint.completedAt,
      collectionPerformed: false, sourceCoverage: checkpoint.sourceCoverage }));
  } finally { await sql.end(); }
}
main().catch(() => { console.error("Monitoring refresh was not published. Inspect the failed checkpoint and the stage checks; source data was not declared current."); process.exitCode = 1; });
