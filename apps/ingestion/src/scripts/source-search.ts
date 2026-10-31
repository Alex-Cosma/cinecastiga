import { buildSourceSearch, createDb, DEFAULT_DATABASE_URL } from "@seap/db";

/**
 * Build the stored text of the source drawers' search (marts.source_search,
 * packages/db source-search-text.ts) from the marts as they are, then swap it in.
 *   pnpm --filter ingestion source-search
 *
 * The nightly runner calls it after the site reopens (process-nightly.sh); an
 * operator runs it once after the first deploy with it. It refuses while a
 * publication runs or maintenance is on: the marts are being rebuilt then, and
 * the next build would be stale at once. Until it ends, the drawers search by
 * names first (apps/web/lib/ask/source-search.ts).
 */
async function main(): Promise<void> {
  // One build outlasts a pooled connection's lifetime (as in processing.ts).
  const url = new URL(process.env["DATABASE_URL"] ?? DEFAULT_DATABASE_URL);
  url.searchParams.set("max_lifetime", "0");
  const { sql } = createDb(url.toString(), { max: 2 });
  try {
    const [state] = await sql`
      select coalesce((select maintenance from app.collection_control where id = 1), false) maintenance,
             (select count(*) from app.processing_runs where status = 'running')::int running`;
    if (state!["maintenance"] || Number(state!["running"]) > 0) throw Error("A publication runs or maintenance is on; build the search text after the site reopens");
    const report = await buildSourceSearch(sql, { log: (m) => console.log(m) });
    console.log(JSON.stringify(report));
  } finally {
    await sql.end({ timeout: 10 });
  }
}

main().catch((err) => {
  console.error("source search build failed; the drawers keep the names-first search:", err);
  process.exitCode = 1;
});
