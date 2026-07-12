import { eq } from "drizzle-orm";
import { createDb, rawDocuments } from "@seap/db";
import { contentHash } from "../scrape/hash.js";
import { redactPayload, REDACTION_VERSION } from "../scrape/redact.js";

/**
 * One-off remediation: re-apply the current redaction rules to every row
 * already in raw.raw_documents and rewrite payload + content_hash in place.
 *
 * Needed because r1's anchored contact pattern leaked `assignedUserEmail`
 * (nested in DA `directAcquisitionItems[]`) into the archive. Re-redacting is
 * exactly the "raw is replayable" property in action — no re-scrape required.
 *
 * Idempotent: a row whose stored payload already matches the current rules
 * hashes identically and is skipped. Run with --dry to preview.
 *
 *   pnpm --filter ingestion scrub-pii [--dry]
 */

const dryRun = process.argv.includes("--dry");

async function main(): Promise<void> {
  const { db, sql } = createDb();

  const rows = await db
    .select({
      id: rawDocuments.id,
      endpointVersion: rawDocuments.endpointVersion,
      contentHash: rawDocuments.contentHash,
      payload: rawDocuments.payload,
    })
    .from(rawDocuments);

  let changed = 0;
  let unchanged = 0;

  for (const row of rows) {
    const redacted = redactPayload(row.payload, row.endpointVersion);
    const newHash = contentHash(redacted);
    if (newHash === row.contentHash) {
      unchanged += 1;
      continue;
    }
    changed += 1;
    if (!dryRun) {
      await db
        .update(rawDocuments)
        .set({ payload: redacted, contentHash: newHash })
        .where(eq(rawDocuments.id, row.id));
    }
  }

  // Verify no email address survives. The strict TLD-requiring pattern
  // (needs `@host.tld`) already excludes company names like
  // "S.C. ALL@GIS MEHEDINȚI S.R.L." — the `@` there is not followed by a dot-TLD.
  const leakRows = await sql<{ leaked: number }[]>`
    select count(*)::int as leaked
    from raw.raw_documents
    where payload::text ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}'
  `;
  const leaked = leakRows[0]?.leaked ?? 0;

  console.log(
    JSON.stringify(
      {
        redactionVersion: REDACTION_VERSION,
        scanned: rows.length,
        rewritten: changed,
        unchanged,
        dryRun,
        residualEmailRows: leaked,
      },
      null,
      2,
    ),
  );

  await sql.end();
  if (!dryRun && leaked > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error("scrub-pii crashed:", err);
  process.exit(1);
});
