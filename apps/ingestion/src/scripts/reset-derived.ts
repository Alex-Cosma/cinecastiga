import { createDb } from "@seap/db";

/**
 * Clean-slate reset of the derived layers before a fresh rebuild. Truncates all
 * of `core` (entities, facts, flags, watermarks) and all of `marts`, but KEEPS:
 *   - raw.*               (archival bronze — never regenerated from anything)
 *   - core reference/config: cpv_codes, unit_map, sicap_cpv_ids, risk_thresholds
 *
 * Rebuild order after this: import-old → import-das → normalize → flags → index-search.
 *
 *   pnpm --filter ingestion reset-derived
 */
const KEEP_CORE = new Set(["cpv_codes", "unit_map", "sicap_cpv_ids", "risk_thresholds"]);

async function main(): Promise<void> {
  const { sql } = createDb();

  const core = (await sql`
    select table_name from information_schema.tables
    where table_schema = 'core' and table_type = 'BASE TABLE'
  `) as unknown as { table_name: string }[];
  const marts = (await sql`
    select table_name from information_schema.tables
    where table_schema = 'marts' and table_type = 'BASE TABLE'
  `) as unknown as { table_name: string }[];

  const targets = [
    ...core.filter((t) => !KEEP_CORE.has(t.table_name)).map((t) => `core.${t.table_name}`),
    ...marts.map((t) => `marts.${t.table_name}`),
  ];

  console.log(`kept (core reference): ${[...KEEP_CORE].join(", ")}`);
  console.log(`truncating ${targets.length} tables:\n  ${targets.join("\n  ")}`);
  await sql.unsafe(`truncate ${targets.join(", ")} cascade`);
  console.log("done — core + marts cleared, raw + reference kept.");

  await sql.end();
}

main().catch((err) => {
  console.error("reset-derived crashed:", err);
  process.exit(1);
});
