import { runMonitoredCli } from "../monitoring/cli.js";
import { and, eq, gt, isNull, lt, or, sql as statement } from "drizzle-orm";
import { createDb, rawDocuments, tedNotices } from "@seap/db";
import { replayErrorDetails, retryReplayTransaction, runReplayQueue } from "../normalize/ted-replay.js";
import { loadCpvCatalog, loadCpvPrefixMap } from "../normalize/context.js";
import { loadTedNotice, tryReplayTedAmounts, extractTedNotice, TED_NORMALIZATION_VERSION } from "../normalize/ted.js";
import { loadF03Notice, tryReplayF03Amounts } from "../normalize/ted-fforms.js";

/**
 * Selectively replay the raw payload currently backing each existing TED notice.
 * No normalization-watermark changes, no full-core truncation, no network access.
 * Default is READ ONLY. Resume by rerunning: successful notices carry version 2.
 *
 * pnpm --filter ingestion replay-ted --publication 298320-2026
 * pnpm --filter ingestion replay-ted --apply --limit 100
 *
 * After ALL selected batches: reconcile → ted-mart → marts → flags/radiografie.
 * Lot IDs survive; crosswalk links for replayed notices are invalidated because
 * previous scores used previous values/winners. Do not expose mixed mart refreshes.
 */
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const value = process.argv[i + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
  return value;
};

async function main() {
  const limit = Number(arg("limit") ?? "100");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100_000) throw new Error("--limit must be 1..100000 notices");
  const concurrency = Number(arg("concurrency") ?? "1");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error("--concurrency must be 1..4");
  const publication = arg("publication");
  if (publication && !/^\d+-\d{4}$/.test(publication)) throw new Error("Invalid --publication");
  const afterText = arg("after-notice-id") ?? "0";
  if (!/^\d+$/.test(afterText)) throw new Error("Invalid --after-notice-id");
  const apply = process.argv.includes("--apply");
  const { db, sql } = createDb();
  await runMonitoredCli(sql, "replay-ted", async () => {
      const filters = and(
        gt(tedNotices.id, BigInt(afterText)),
        or(isNull(tedNotices.normalizationVersion), lt(tedNotices.normalizationVersion, TED_NORMALIZATION_VERSION)),
        publication ? eq(tedNotices.publicationNumber, publication) : undefined,
      );
      const candidates = await db.select({ id: tedNotices.id, rawId: tedNotices.rawId, publication: tedNotices.publicationNumber })
        .from(tedNotices).where(filters).orderBy(tedNotices.id).limit(limit);
      console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", version: TED_NORMALIZATION_VERSION,
        selected: candidates.length, limit, concurrency, firstNoticeId: candidates[0]?.id.toString() ?? null,
        lastNoticeId: candidates.at(-1)?.id.toString() ?? null,
        resume: "Rerun the same command: notices already normalized to this version are excluded." }));
      if (!apply || !candidates.length) return;
      const [cpvCatalog, cpvByPrefix] = await Promise.all([loadCpvCatalog(db), loadCpvPrefixMap(db)]);
      const started = Date.now();
      let processed = 0;
      let fastF03 = 0;
      let fastEforms = 0;
      await runReplayQueue(candidates, concurrency, async (candidate) => {
        // One notice per transaction: failures roll back both the version marker
        // and all lot/winner changes; the next run retries the failed notice.
        const outcome = await retryReplayTransaction(() => db.transaction(async (tx) => {
          const [current] = await tx.select({ rawId: tedNotices.rawId, version: tedNotices.normalizationVersion })
            .from(tedNotices).where(eq(tedNotices.id, candidate.id)).for("update");
          if (!current || current.version != null && current.version >= TED_NORMALIZATION_VERSION) return "skipped";
          const [raw] = await tx.select({ payload: rawDocuments.payload, endpoint: rawDocuments.endpointVersion })
            .from(rawDocuments).where(eq(rawDocuments.id, current.rawId));
          if (!raw) throw new Error(`Missing raw record for TED notice ${candidate.publication}; replay stopped`);
          const load = raw.endpoint === "ted-eforms:v1" ? loadTedNotice
            : raw.endpoint === "ted-fforms:v1" ? loadF03Notice : null;
          if (!load) throw new Error(`Unsupported TED endpoint for notice ${candidate.publication}; replay stopped`);
          const ctx = { tx, cpvCatalog, cpvByPrefix, units: new Map() };
          if (raw.endpoint === "ted-fforms:v1" && await tryReplayF03Amounts(ctx, candidate.id,
            candidate.publication, current.rawId, raw.payload)) return "fast-f03";
          let parsedEforms: ReturnType<typeof extractTedNotice> | undefined;
          if (raw.endpoint === "ted-eforms:v1") {
            const attempt = await tryReplayTedAmounts(ctx, candidate.id, candidate.publication, current.rawId, raw.payload);
            if (attempt.replayed) return "fast-eforms";
            parsedEforms = attempt.parsed;
          }
          // Full loaders update shared buyer/supplier identities in source order.
          // Serialize only those paths to prevent recurring cross-notice deadlocks.
          // F03 amount-only batches remain concurrent and never update identities.
          await tx.execute(statement`select pg_advisory_xact_lock(1936023920, 55204)`);
          if (parsedEforms) await loadTedNotice(ctx, current.rawId, raw.payload, parsedEforms);
          else await load(ctx, current.rawId, raw.payload);
          return "full";
        })).catch((error: unknown) => {
          throw Object.assign(new Error("TED notice replay failed", { cause: error }), { publication: candidate.publication });
        });
        if (outcome === "skipped") return;
        processed++;
        if (outcome === "fast-f03") fastF03++;
        if (outcome === "fast-eforms") fastEforms++;
        if (processed % 25 === 0 || candidate === candidates.at(-1)) {
          console.log(JSON.stringify({ processed, lastCompletedNoticeId: candidate.id.toString(), fastF03, fastEforms, elapsedMs: Date.now() - started }));
        }
      });
      console.log("Batch complete. Re-run until selected=0, then rebuild reconciliation and dependent marts together.");
  }, process.argv.includes("--apply"));
}

main().catch((error: unknown) => {
  // Do not print SQL parameters or raw XML on error.
  console.error(JSON.stringify({ publication: (error as { publication?: string })?.publication ?? null, ...replayErrorDetails(error) }));
  process.exitCode = 1;
});
