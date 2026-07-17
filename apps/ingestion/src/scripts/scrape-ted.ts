import { closeSharedDb, getSharedDb } from "../db.js";
import { getTedClient } from "../scrape/ted/client.js";
import { scrapeTedNotices } from "../scrape/ted/notices.js";

/**
 * TED raw ingester CLI — archives above-threshold RO notices (eForms XML) into
 * raw, tagged source='ted'. Runs in PARALLEL with the e-licitatie crawlers (TED
 * has no rate limit / separate host). Usage:
 *
 *   pnpm --filter ingestion scrape-ted --start 2026-06-01 --end 2026-06-30
 *   pnpm --filter ingestion scrape-ted --start 2025-01-01 --end 2025-01-31 --type can-standard
 *
 * Notice types: can-standard (contract award notices — winners/values, DEFAULT),
 * cn-standard (contract notices — tenders). Keep windows small enough to stay
 * under TED's reachable-result cap (~a month of RO awards is fine).
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const start = arg("start");
const end = arg("end");
const noticeType = arg("type") ?? "can-standard";
const country = arg("country") ?? "ROU";
const pageSize = arg("page-size") ? Number(arg("page-size")) : undefined;

if (!start || !end || !ISO.test(start) || !ISO.test(end) || start > end) {
  console.error(
    "usage: scrape-ted --start YYYY-MM-DD --end YYYY-MM-DD [--type can-standard|cn-standard] [--country ROU]",
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const db = getSharedDb();
  const client = getTedClient();
  const outcome = await scrapeTedNotices(
    { db, client, log: (m) => console.log(m) },
    {
      window: { start: start!, end: end! },
      country,
      noticeType,
      ...(pageSize ? { pageSize } : {}),
    },
  );
  console.log(JSON.stringify(outcome, null, 2));
  await closeSharedDb();
  if (outcome.status === "failed") process.exit(1);
}

main().catch(async (err) => {
  console.error("scrape-ted crashed:", err);
  await closeSharedDb();
  process.exit(1);
});
