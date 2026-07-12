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

  // Marts are derived — clear before rebuild (readers see old snapshot until commit).
  await sql`
    truncate
      marts.national_stats, marts.spend_by_type, marts.spend_by_cpv,
      marts.cpv_tree, marts.spend_by_county,
      marts.entity_profile, marts.entity_top_partners, marts.top_entities,
      marts.authority_concentration
  `;

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

  log("building marts...");
  const marts = await buildMarts(db, sql, dir, suppliers.map, authorities.map, log);

  // Integrity spot-check: the marts leaderboard must resolve to real names via the
  // entity join (catches any RETURNING-order corruption in the bulk load).
  const top = (await sql`
    select e.name_display, ep.total_ron_full
    from marts.top_entities te
    join marts.entity_profile ep on ep.entity_id = te.entity_id and ep.role = te.role
    join core.entities e on e.id = te.entity_id
    where te.role = 'supplier'
    order by te.rank
    limit 5
  `) as unknown as { name_display: string; total_ron_full: string }[];

  console.log(
    JSON.stringify(
      {
        entities: { suppliers: suppliers.inserted, authorities: authorities.inserted },
        marts,
        totalSpendRon: Math.round(marts.totalSpendRon),
        topSuppliers: top.map((t) => ({
          name: t.name_display,
          ron: Math.round(Number(t.total_ron_full)),
        })),
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
