import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { closeSharedDb, getSharedDb } from "../db.js";
import {
  archiveDocuments,
  finishScrapeRun,
  startScrapeRun,
  type ArchivableDocument,
} from "../scrape/archive.js";

/**
 * TED BULK ingester — the rate-limit-proof path. Downloads a whole month's TED
 * package in ONE request (ted.europa.eu/packages/monthly/YYYY-M, ~350MB tar.gz),
 * extracts it (monthly -> daily .tar.gz -> per-notice eForms XML), filters to RO
 * notices of the wanted type, and archives them to raw (source='ted').
 *
 * Why bulk: the per-notice XML host (ted.europa.eu/en/notice/.../xml) 429s at
 * ~1 req/s. A package is a single download for the entire month — no rate limit.
 *
 *   pnpm --filter ingestion scrape-ted-bulk --year 2026 --month 1
 *   pnpm --filter ingestion scrape-ted-bulk --year 2025 --month 6 --type can-standard
 *   pnpm --filter ingestion scrape-ted-bulk --year 2019 --month 6 --schema fforms
 *
 * Two eras (SAME package host, DIFFERENT XML schema + filter):
 *   --schema eforms (default, 2023+): eForms UBL. Filter eforms-country + notice-type,
 *     archive endpoint_version 'ted-eforms:v1'.
 *   --schema fforms (pre-2023): legacy TED_EXPORT R2.0.9. Filter ISO_COUNTRY + award
 *     TD_DOCUMENT_TYPE, archive 'ted-fforms:v1'. RO is 2-letter here (not ROU).
 *
 * Needs curl + tar + grep on PATH (mechanical heavy-lifting; DB archive in Node).
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const year = Number(arg("year"));
const month = Number(arg("month"));
const schema = arg("schema") ?? "eforms";
const noticeType = arg("type") ?? "can-standard";
const packageFileArg = arg("package-file"); // test seam: use a pre-downloaded package

if (!year || !month || month < 1 || month > 12) {
  console.error("usage: scrape-ted-bulk --year YYYY --month M [--schema eforms|fforms] [--type can-standard]");
  process.exit(2);
}
if (schema !== "eforms" && schema !== "fforms") {
  console.error("--schema must be 'eforms' or 'fforms'");
  process.exit(2);
}
const legacy = schema === "fforms";
// Legacy TED_EXPORT uses 2-letter ISO ('RO'); eForms uses 3-letter ('ROU').
const country = (arg("country") ?? (legacy ? "RO" : "ROU")).toUpperCase();
const endpointVersion = legacy ? "ted-fforms:v1" : "ted-eforms:v1";

const sh = (cmd: string, args: string[]): string =>
  execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

/** Remove any leftover ted-bulk-* temp dirs from prior killed runs. Runs are
 *  sequential so there's never a sibling in use — safe to sweep them all. */
function sweepStaleTemps(): void {
  const base = tmpdir();
  for (const name of readdirSync(base)) {
    if (name.startsWith("ted-bulk-")) {
      try {
        rmSync(join(base, name), { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  }
}

/** "00000064_2026.xml" -> "64-2026" (TED publication-number). */
function pubNumFromFile(file: string): string {
  const m = basename(file).match(/^0*(\d+)_(\d{4})\.xml$/);
  return m ? `${m[1]}-${m[2]}` : basename(file).replace(/\.xml$/, "");
}

async function main(): Promise<void> {
  sweepStaleTemps(); // clear any temp dirs leaked by prior killed runs
  const db = getSharedDb();
  const work = mkdtempSync(join(tmpdir(), "ted-bulk-"));
  const source = legacy ? "ted:fforms" : `ted:${noticeType}`;
  const runId = await startScrapeRun(db, {
    source,
    windowStart: new Date(Date.UTC(year, month - 1, 1)),
    windowEnd: new Date(Date.UTC(year, month, 0, 23, 59, 59)),
  });
  let fetched = 0;
  let inserted = 0;
  let skipped = 0;
  let failed = false;

  try {
    // 1. Download the monthly package (ONE request) — unless a file was provided.
    const pkg = packageFileArg ?? join(work, "month.tar.gz");
    if (!packageFileArg) {
      const url = `https://ted.europa.eu/packages/monthly/${year}-${month}`;
      console.log(`downloading ${url} ...`);
      sh("curl", ["-sfL", "-A", "seap-analytics/0.1 (contact: contact@example.test)", "--max-time", "600", "-o", pkg, url]);
    }

    // 2. Extract monthly -> daily .tar.gz, then every daily -> per-notice XML.
    sh("tar", ["-xzf", pkg, "-C", work]);
    // extract each nested daily package in place
    sh("bash", ["-c", `find ${JSON.stringify(work)} -name '*_*.tar.gz' -exec tar -xzf {} -C ${JSON.stringify(work)} \\;`]);

    // 3. Filter: RO notices of the wanted type. Two-stage grep (country, then type).
    // eForms: a country code ROU (listName "country" or "eforms-country") + notice-type element. Legacy TED_EXPORT:
    // ISO_COUNTRY VALUE="RO" + award TD_DOCUMENT_TYPE CODE="7".
    const listFile = join(work, "matches.txt");
    const countryGrep = legacy
      ? `grep -lrF 'ISO_COUNTRY VALUE="${country}"'`
      : `grep -lrE 'listName="(eforms-)?country">${country}'`;
    const typeGrep = legacy
      ? `grep -lF 'TD_DOCUMENT_TYPE CODE="7"'`
      : `grep -lF '>${noticeType}<'`;
    const filter =
      `${countryGrep} ${JSON.stringify(work)} --include='*.xml' 2>/dev/null` +
      ` | xargs -r ${typeGrep} 2>/dev/null > ${JSON.stringify(listFile)} || true`;
    sh("bash", ["-c", filter]);
    const files = readFileSync(listFile, "utf8").split("\n").filter(Boolean);
    console.log(`${source} ${year}-${String(month).padStart(2, "0")}: ${files.length} matching notices`);

    // 4. Archive in chunks (read XML per file, store faithfully).
    const CHUNK = 500;
    for (let i = 0; i < files.length; i += CHUNK) {
      const docs: ArchivableDocument[] = files.slice(i, i + CHUNK).map((f) => {
        const pubnum = pubNumFromFile(f);
        fetched += 1;
        return {
          source: "ted",
          externalId: `${legacy ? "f03" : noticeType}:${pubnum}`,
          endpointVersion,
          payload: {
            "publication-number": pubnum,
            "notice-type": legacy ? "f03-award" : noticeType,
            xml: readFileSync(f, "utf8"),
          },
        };
      });
      const r = await archiveDocuments(db, docs);
      inserted += r.inserted;
      skipped += r.skipped;
      console.log(`  archived ${Math.min(i + CHUNK, files.length)}/${files.length}: +${r.inserted}/${r.skipped} skipped`);
    }

    await finishScrapeRun(db, runId, {
      status: "completed",
      reportedTotal: files.length,
      fetchedCount: fetched,
      insertedCount: inserted,
      skippedCount: skipped,
      pagesFetched: 1,
    });
    console.log(JSON.stringify({ status: "completed", reportedTotal: files.length, fetched, inserted, skipped }, null, 2));
  } catch (err) {
    failed = true;
    const error = err instanceof Error ? err.message : String(err);
    await finishScrapeRun(db, runId, {
      status: "failed",
      reportedTotal: null,
      fetchedCount: fetched,
      insertedCount: inserted,
      skippedCount: skipped,
      pagesFetched: 0,
      error,
    });
    console.error("scrape-ted-bulk failed:", error);
  } finally {
    // ALWAYS remove the (up to ~1GB) temp dir, whatever happened.
    rmSync(work, { recursive: true, force: true });
    await closeSharedDb();
  }
  if (failed) process.exit(1);
}

main().catch(async (err) => {
  console.error("scrape-ted-bulk crashed:", err);
  await closeSharedDb();
  process.exit(1);
});
