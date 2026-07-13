import { createDb } from "@seap/db";
import { loadDas } from "../import-old/load-das.js";

/**
 * Phase 1 of the red-flag engine: import the 2020 dump's 4.78M direct
 * acquisitions into core.direct_acquisitions. Requires entities already loaded
 * (pnpm import-old). Idempotent on sicap_da_id.
 *
 *   pnpm --filter ingestion import-das [db-old-dir]   # default ../../db-old
 */
async function main(): Promise<void> {
  const dir = process.argv[2] ?? "../../db-old";
  const { db, sql } = createDb();
  const log = (m: string) => console.log(m);

  const t0 = Date.now();
  const report = await loadDas(db, sql, `${dir}/directAcquisitionContract.bson`, log);

  const [tot] = (await sql`
    select count(*)::int c, sum(closing_value)::numeric s from core.direct_acquisitions
  `) as unknown as { c: number; s: string | null }[];

  console.log(
    JSON.stringify(
      {
        ...report,
        coreRows: tot!.c,
        coreClosingTotalRon: Math.round(Number(tot!.s ?? 0)),
        seconds: Math.round((Date.now() - t0) / 1000),
      },
      null,
      2,
    ),
  );
  await sql.end();
}

main().catch((err) => {
  console.error("import-das crashed:", err);
  process.exit(1);
});
