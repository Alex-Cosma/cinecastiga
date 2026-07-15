import { closeSharedDb, getSharedDb } from "../db.js";
import { getElicitatieClient } from "../scrape/elicitatie/client.js";
import {
  scrapeNoticesWindow,
  type NoticeFamily,
} from "../scrape/elicitatie/notices.js";
import { scrapeDasByAuthority } from "../scrape/elicitatie/direct-acquisitions.js";

/**
 * Explicit-window scrape CLI — the manual/sample path (worker cron is the
 * steady-state path). Usage:
 *
 *   SCRAPE_UA="seap-analytics/0.1 (contact: you@x)" \
 *   pnpm --filter ingestion scrape --family tenders --start 2026-07-09 --end 2026-07-10
 *
 * Server-protection knobs (env) — use gentle values for a fragile/backfill run:
 *   SCRAPE_CONCURRENCY=1 SCRAPE_MIN_DELAY_MS=1000   # ~1 req/s, single-flight
 *   SCRAPE_BACKOFF_BASE_MS=5000                     # slow, long backoff on errors
 *   SCRAPE_CIRCUIT_THRESHOLD=3                      # halt after 3 consecutive 5xx
 * The circuit breaker (on by default) stops the run when the upstream returns
 * repeated server errors, so we never pile onto a struggling SEAP.
 */

function usage(): never {
  console.error(
    "usage: scrape --family tenders|awards --start YYYY-MM-DD --end YYYY-MM-DD\n" +
      "       scrape --family das [--start YYYY-MM-DD --end YYYY-MM-DD] [--max N]\n" +
      "         (das scans authorities; --max = authorities per run, resumes via watermark)",
  );
  process.exit(2);
}

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const family = arg("family");
const start = arg("start");
const end = arg("end");
const max = arg("max");

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isDas = family === "das";
if (!family || !["tenders", "awards", "das"].includes(family)) usage();
if (!isDas) {
  if (!start || !end || !ISO.test(start) || !ISO.test(end) || start > end) {
    usage();
  }
} else if ((start && !ISO.test(start)) || (end && !ISO.test(end))) {
  usage();
}

async function main(): Promise<void> {
  // DA scraping moved to a separate authority-partition crawler (backfill-das.sh,
  // which sets SCRAPE_DAS_MODE=authority). Without the flag, `--family das`
  // no-ops — so a still-running day-walk backfill that also calls das neither
  // hammers SICAP nor writes an authority watermark. Tenders/awards unaffected.
  if (isDas && process.env["SCRAPE_DAS_MODE"] !== "authority") {
    console.log(
      "das is now authority-partitioned — run backfill-das.sh (SCRAPE_DAS_MODE=authority). Skipping.",
    );
    return;
  }

  const db = getSharedDb();
  const client = getElicitatieClient();
  const log = (m: string) => console.log(m);

  const outcome = isDas
    ? await scrapeDasByAuthority(
        { db, client, log },
        {
          ...(start && end ? { window: { start, end } } : {}),
          ...(max ? { maxAuthoritiesPerRun: Number(max) } : {}),
        },
      )
    : await scrapeNoticesWindow(
        { db, client, log },
        { family: family as NoticeFamily, window: { start: start!, end: end! } },
      );

  console.log(JSON.stringify(outcome, null, 2));
  await closeSharedDb();
  if (outcome.status === "failed") process.exit(1);
}

main().catch(async (err) => {
  console.error("scrape crashed:", err);
  await closeSharedDb();
  process.exit(1);
});
