import { sql } from "drizzle-orm";
import { rawDocuments } from "@seap/db";
import { closeSharedDb, getSharedDb } from "../db.js";
import { getElicitatieClient } from "../scrape/elicitatie/client.js";
import { getCpvCategories, listDirectAcquisitions } from "@seap/scraper-clients";
import { eachDay } from "../scrape/window.js";

/**
 * DA completeness proof. For each sampled day it computes an INDEPENDENT true
 * total via the SICAP CPV-category partition (the 12 categories are a proven
 * complete partition of a day's DAs) and compares it to what we archived:
 *
 *   - No category overflowed 2000 → category-sum is EXACT. archived MUST equal it.
 *   - Some category overflowed    → category-sum is a LOWER BOUND. archived MUST be ≥ it.
 *
 * A day where archived < the bound is a real miss (an authority we never
 * scanned — e.g. a deregistered one). Run this AFTER a DA scrape.
 *
 *   pnpm --filter ingestion verify-da --start 2021-01-01 --end 2026-07-15 [--sample 30]
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const start = arg("start") ?? "2021-01-01";
const end = arg("end") ?? new Date().toISOString().slice(0, 10);
const sample = Number(arg("sample") ?? "30"); // check every Nth day

async function archivedOnDay(
  db: ReturnType<typeof getSharedDb>,
  day: string,
): Promise<number> {
  // finalizationDate strings are stamped +03:00, so the first 10 chars are the
  // Bucharest day. Count distinct DAs (a DA may have multiple raw versions).
  const r: any = await db.execute(sql`
    select count(distinct ${rawDocuments.externalId})::int n
    from ${rawDocuments}
    where ${rawDocuments.source} = 'elicitatie'
      and ${rawDocuments.endpointVersion} = 'da-list:v1'
      and left(${rawDocuments.payload} ->> 'finalizationDate', 10) = ${day}`);
  const rows = r.rows ?? r;
  return Number(rows[0]?.n ?? 0);
}

async function main(): Promise<void> {
  const db = getSharedDb();
  const client = getElicitatieClient();
  const categories = (await getCpvCategories(client)).map((c) => c.id);
  if (categories.length === 0) throw new Error("no CPV categories returned");

  let checked = 0;
  let ok = 0;
  const shortfalls: string[] = [];

  const days = [...eachDay({ start, end })];
  for (let i = 0; i < days.length; i += 1) {
    if (i % sample !== 0) continue;
    const day = days[i]!;
    let categorySum = 0;
    let anyOverflow = false;
    for (const cat of categories) {
      const { data } = await listDirectAcquisitions(client, {
        finalizationDateStart: day,
        finalizationDateEnd: day,
        pageIndex: 0,
        pageSize: 1,
        cpvCategoryId: cat,
      });
      categorySum += data.total;
      if (data.searchTooLong) anyOverflow = true;
    }
    const archived = await archivedOnDay(db, day);
    checked += 1;

    const exact = !anyOverflow;
    const complete = exact ? archived === categorySum : archived >= categorySum;
    if (complete) {
      ok += 1;
    } else {
      const kind = exact ? "MISMATCH" : "SHORTFALL(<lower-bound)";
      const line = `${day}  archived=${archived}  category-sum=${categorySum}${exact ? " (exact)" : " (lower-bound)"}  diff=${archived - categorySum}  ${kind}`;
      shortfalls.push(line);
      console.log("  ✗ " + line);
    }
  }

  console.log(
    `\nchecked ${checked} days (every ${sample}th, ${start}..${end}) — complete: ${ok}, flagged: ${shortfalls.length}`,
  );
  if (shortfalls.length === 0) {
    console.log("✓ every sampled day reconciles — DA coverage is complete.");
  } else {
    console.log(
      `⚠ ${shortfalls.length} day(s) under the true total — missing DAs (unscanned authorities). Repair needed.`,
    );
  }
  await closeSharedDb();
  process.exit(shortfalls.length === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("verify-da crashed:", err);
  await closeSharedDb();
  process.exit(2);
});
