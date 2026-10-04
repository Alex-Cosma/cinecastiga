import { parseName, parseTxt } from "../reference/financials.js";
import { financialSpecCodes as specCodes } from "../reference/parsers.js";
import { runMonitoredCli } from "../monitoring/cli.js";
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { rename } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createDb } from "@seap/db";

/**
 * Company financials from the Ministry of Finance open-data bilanț dumps
 * (data.gov.ro "Situații financiare <year>"): average employee count, net
 * turnover, profit — per CUI per fiscal year. This is the same primary source
 * the paid company-data APIs resell.
 *
 * Loads fiscal years 2018+ from every filer-category file (UU = micro, BL_BS_SL
 * = large, ONG, IR = IFRS giants like Hidroelectrica, banks, insurers…) into
 * reference.company_financials. Datasets are processed in ascending vintage so
 * a later snapshot (late filers, restatements) overwrites an earlier one.
 *
 *   pnpm --filter ingestion import-financials [cache-dir]
 *     cache-dir default: ../../../seap-heartbeat/financials  (outside the repo)
 *
 * Idempotent: downloads are cached on disk, rows upserted on (cui, year).
 */

const CKAN = "https://data.gov.ro/api/3/action";
const MIN_FY = 2018;

interface Resource {
  name: string;
  url: string;
}

async function ckan<T>(path: string): Promise<T> {
  const r = await fetch(`${CKAN}/${path}`);
  if (!r.ok) throw new Error(`CKAN ${path}: HTTP ${r.status}`);
  const j = (await r.json()) as { success: boolean; result: T };
  if (!j.success) throw new Error(`CKAN ${path}: success=false`);
  return j.result;
}

/** All "Situații financiare <year>" dataset ids, keyed by vintage year. */
async function findDatasets(): Promise<Map<number, string>> {
  const res = await ckan<{ results: { name: string; title: string }[] }>(
    "package_search?q=situatii+financiare&rows=100",
  );
  const out = new Map<number, string>();
  for (const d of res.results) {
    const m = /situa\S*\s+financiare\s+(20\d\d)/i.exec(d.title);
    if (m) out.set(Number(m[1]), d.name);
  }
  return out;
}

async function download(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) return;
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`download ${url}: HTTP ${r.status}`);
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(r.body as never), createWriteStream(tmp));
  await rename(tmp, dest);
}

async function main(): Promise<void> {
  // sibling of the repo (…/code/seap-heartbeat), NOT inside it
  const cacheDir =
    process.argv[2] ?? new URL("../../../../../seap-heartbeat/financials", import.meta.url).pathname;
  mkdirSync(cacheDir, { recursive: true });
  const { sql } = createDb();
  await runMonitoredCli(sql, "import-financials", async () => {
    const t0 = Date.now();

    await sql`create schema if not exists reference`;
    await sql`
      create table if not exists reference.company_financials (
        cui text not null,
        year int not null,
        caen text,
        category text not null,
        source_vintage int not null,
        employees int,
        net_turnover numeric,
        total_revenue numeric,
        total_expenses numeric,
        profit_net numeric,
        loss_net numeric,
        primary key (cui, year)
      )
    `;

    const datasets = await findDatasets();
    const vintages = [...datasets.keys()].filter((y) => y >= MIN_FY).sort((a, b) => a - b);
    console.log(`datasets: ${vintages.map((y) => `${y}=${datasets.get(y)}`).join(" ")}`);

    let files = 0;
    let upserts = 0;
    for (const vintage of vintages) {
      const pkg = await ckan<{ resources: Resource[] }>(`package_show?id=${datasets.get(vintage)}`);
      const txts = pkg.resources.filter((r) => parseName(r.name) !== null);
      // paired .csv specs by same basename
      const specByBase = new Map<string, string>();
      for (const r of pkg.resources) {
        if (/\.csv$/i.test(r.name)) specByBase.set(r.name.replace(/\.csv$/i, "").toUpperCase(), r.url);
      }
      for (const r of txts) {
        const meta = parseName(r.name)!;
        if (meta.fy < MIN_FY || meta.fy > vintage) continue;
        const dest = `${cacheDir}/${vintage}-${r.name.replace(/\s+/g, "_")}`;
        await download(r.url, dest);
        let codes: Record<string, string> = {};
        let hasSpec = false;
        const specUrl = specByBase.get(r.name.replace(/\.txt$/i, "").toUpperCase());
        if (specUrl) {
          const specDest = `${dest}.spec.csv`;
          try {
            await download(specUrl, specDest);
            hasSpec = true;
          } catch {
            /* spec unavailable — parseTxt decides via header shape */
          }
        }
        if (hasSpec) codes = specCodes(readFileSync(`${dest}.spec.csv`, "utf8"));
        const rows = parseTxt(dest, meta.category, meta.fy, vintage, codes, hasSpec);
        files++;
        if (rows.length === 0) {
          console.log(`  ${vintage} ${r.name}: no parseable rows, skipped`);
          continue;
        }
        for (let i = 0; i < rows.length; i += 5000) {
          const batch = rows.slice(i, i + 5000);
          await sql`
            insert into reference.company_financials ${sql(
              batch,
              "cui",
              "year",
              "caen",
              "category",
              "source_vintage",
              "employees",
              "net_turnover",
              "total_revenue",
              "total_expenses",
              "profit_net",
              "loss_net",
            )}
            on conflict (cui, year) do update set
              caen = excluded.caen,
              category = excluded.category,
              source_vintage = excluded.source_vintage,
              employees = excluded.employees,
              net_turnover = excluded.net_turnover,
              total_revenue = excluded.total_revenue,
              total_expenses = excluded.total_expenses,
              profit_net = excluded.profit_net,
              loss_net = excluded.loss_net
            where excluded.source_vintage >= reference.company_financials.source_vintage
          `;
          upserts += batch.length;
        }
        console.log(JSON.stringify({
          sourceVintage: vintage,
          file: r.name,
          year: meta.fy,
          category: meta.category,
          rows: rows.length,
          specAvailable: hasSpec,
          specProfitIndicator: codes.profit_net ?? null,
          rowsWithProfit: rows.reduce((n, row) => n + (row.profit_net === null ? 0 : 1), 0),
        }));
      }
    }

    const [tot] = (await sql`
      select count(*)::int c, count(distinct cui)::int cuis,
             min(year) y0, max(year) y1
      from reference.company_financials
    `) as unknown as { c: number; cuis: number; y0: number; y1: number }[];
    console.log(
      JSON.stringify(
        {
          files,
          upserts,
          tableRows: tot!.c,
          distinctCuis: tot!.cuis,
          years: `${tot!.y0}-${tot!.y1}`,
          seconds: Math.round((Date.now() - t0) / 1000),
        },
        null,
        2,
      ),
    );
  });
}

main().catch((err) => {
  console.error("import-financials crashed:", err);
  process.exit(1);
});
