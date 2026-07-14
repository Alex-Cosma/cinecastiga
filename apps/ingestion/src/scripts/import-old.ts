import { createDb } from "@seap/db";
import { loadEntities } from "../import-old/load-entities.js";
import { buildMarts } from "../import-old/build-marts.js";

/**
 * One-shot import of the 2020 SEAP dump (db-old/) into core.entities + marts, so
 * the web app has a real (if historical) dataset to explore before the live
 * backfill is possible. Reads only the dimension + precomputed-aggregate
 * collections — never the multi-GB detail dumps.
 *
 *   pnpm --filter ingestion import-old [db-old-dir]   # default: ../../db-old
 *
 * Idempotent: re-running reuses already-mapped entities. Marts are truncated and
 * rebuilt each run (they are derived).
 */
async function main(): Promise<void> {
  const dir = process.argv[2] ?? "../../db-old";
  const { db, sql } = createDb();
  const log = (m: string) => console.log(m);

  log(`import-old: reading ${dir}`);

  // import-old owns only cpv_tree now (the one mart with no core equivalent);
  // every other mart is rebuilt from core by `runMarts` (pnpm marts).
  await sql`truncate marts.cpv_tree`;

  log("loading entities (supplier + authority)...");
  const suppliers = await loadEntities(db, sql, `${dir}/supplier.bson`, "supplier", log);
  log(
    `  suppliers: seen=${suppliers.seen} new=${suppliers.inserted} merged=${suppliers.merged} skipped=${suppliers.skipped}`,
  );
  const authorities = await loadEntities(
    db,
    sql,
    `${dir}/contractingAuthority.bson`,
    "authority",
    log,
  );
  log(
    `  authorities: seen=${authorities.seen} new=${authorities.inserted} merged=${authorities.merged} skipped=${authorities.skipped}`,
  );

  log("building cpv_tree (dump hierarchy)...");
  const marts = await buildMarts(db, sql, dir, log);

  console.log(
    JSON.stringify(
      {
        entities: { suppliers: suppliers.inserted, authorities: authorities.inserted },
        cpvTree: marts.cpvTreeNodes,
        note: "display marts (national_stats, spend_*, entity_profile, leaderboards) are built from core by `pnpm marts`",
      },
      null,
      2,
    ),
  );

  await sql.end();
}

main().catch(async (err) => {
  console.error("import-old crashed:", err);
  process.exit(1);
});
