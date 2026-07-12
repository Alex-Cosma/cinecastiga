import { closeSharedDb, getSharedDb } from "../db.js";
import { getElicitatieClient } from "../scrape/elicitatie/client.js";
import {
  scrapeNoticesWindow,
  type NoticeFamily,
} from "../scrape/elicitatie/notices.js";
import { scrapeDaWindow } from "../scrape/elicitatie/direct-acquisitions.js";

/**
 * Explicit-window scrape CLI — the manual/sample path (worker cron is the
 * steady-state path). Usage:
 *
 *   SCRAPE_UA="seap-analytics/0.1 (contact: you@x)" \
 *   pnpm --filter ingestion scrape --family tenders --start 2026-07-09 --end 2026-07-10
 */

function usage(): never {
  console.error(
    "usage: scrape --family tenders|awards|das --start YYYY-MM-DD --end YYYY-MM-DD",
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

const ISO = /^\d{4}-\d{2}-\d{2}$/;
if (
  !family ||
  !["tenders", "awards", "das"].includes(family) ||
  !start ||
  !end ||
  !ISO.test(start) ||
  !ISO.test(end) ||
  start > end
) {
  usage();
}

async function main(): Promise<void> {
  const db = getSharedDb();
  const client = getElicitatieClient();
  const log = (m: string) => console.log(m);
  const window = { start: start!, end: end! };

  const outcome =
    family === "das"
      ? await scrapeDaWindow({ db, client, log }, { window, lookbackDays: 0 })
      : await scrapeNoticesWindow(
          { db, client, log },
          { family: family as NoticeFamily, window },
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
