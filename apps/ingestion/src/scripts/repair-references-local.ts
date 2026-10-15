import { writeFileSync } from "node:fs";
import { createDb, type DbSql } from "@seap/db";
import { repairFinancials, repairOnrc } from "../reference/repair.js";

// Intentionally cannot target the application database or production.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Explicit DATABASE_URL required");
const parsed = new URL(url);
if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || !/^\/seap_test_references_[a-z0-9_]+$/.test(parsed.pathname)) {
  throw new Error("Only local seap_test_references_* databases are permitted");
}
const [snapshot, repsPath, financialDirectory, output] = process.argv.slice(2);
if (!snapshot || !repsPath || !financialDirectory || !output) throw new Error("Usage: <snapshot YYYY-MM-DD> <reps.csv> <financial-cache> <aggregate-report.json>");
const { sql } = createDb(url);
const start = Date.now();
try {
  const report = await sql.begin(async (tx) => {
    const q = tx as unknown as DbSql;
    await q`set local work_mem='8MB'`;
    await q`set local max_parallel_workers_per_gather=0`;
    await q`set local jit=off`;
    await q`set local lock_timeout='5s'`;
    await q`set local statement_timeout='15min'`;
    console.log("Validating MF sources and repairing profit…");
    const financials = await repairFinancials(q, financialDirectory);
    console.log(`MF: ${financials.changed} profits recovered. Validating ONRC snapshot…`);
    const onrc = await repairOnrc(q, repsPath, snapshot);
    console.log(`ONRC: ${onrc.changed} dates recovered.`);
    return { database: parsed.pathname.slice(1), onrc, financials };
  });
  writeFileSync(output, JSON.stringify({ ...report, completedAt: new Date().toISOString(), seconds: (Date.now() - start) / 1000 }, null, 2) + "\n");
  console.log(`Committed isolated repair. Aggregate report: ${output}`);
} finally {
  await sql.end({ timeout: 10 });
}
