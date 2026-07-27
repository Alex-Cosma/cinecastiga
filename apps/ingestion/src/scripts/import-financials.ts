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

/** "WEB_BL_BS_SL_AN2021.txt" → { category: "BL_BS_SL", fy: 2021 } */
function parseName(name: string): { category: string; fy: number } | null {
  const m = /^WEB_?([A-Za-z_ ]+?)_?(?:AN)?_?(20\d\d)\.txt$/i.exec(name.trim());
  if (!m) return null;
  return { category: m[1]!.toUpperCase().replace(/_+$/, ""), fy: Number(m[2]) };
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

/** Column labels we extract, matched against the paired .csv spec (label;code). */
const METRICS: Record<string, RegExp> = {
  employees: /numar\s+mediu\s+de\s+salariati/i,
  net_turnover: /cifra\s+de\s+afaceri\s+neta/i,
  total_revenue: /^venituri\s+totale/i,
  total_expenses: /^cheltuieli\s+totale/i,
  profit_net: /^profitul?\s+net/i,
  loss_net: /^pierderea?\s+neta/i,
};

/**
 * The standard indicator layout (UU / BL_BS_SL / IR share it). Used when no
 * .csv spec ships for a category-year; header-name matching still applies.
 */
const STANDARD_CODES: Record<string, string> = {
  net_turnover: "I13",
  total_revenue: "I14",
  total_expenses: "I15",
  profit_net: "I18",
  loss_net: "I19",
  employees: "I20",
};

function specCodes(specText: string): Record<string, string> {
  const codes: Record<string, string> = {};
  for (const line of specText.split(/\r?\n/)) {
    const [label, code] = line.split(/[;,]/).map((s) => s?.trim());
    if (!label || !code) continue;
    for (const [metric, rx] of Object.entries(METRICS)) {
      if (!codes[metric] && rx.test(label)) codes[metric] = code.toUpperCase();
    }
  }
  return codes;
}

interface Row {
  cui: string;
  year: number;
  caen: string | null;
  category: string;
  source_vintage: number;
  employees: number | null;
  net_turnover: number | null;
  total_revenue: number | null;
  total_expenses: number | null;
  profit_net: number | null;
  loss_net: number | null;
}

function parseTxt(
  path: string,
  category: string,
  fy: number,
  vintage: number,
  codes: Record<string, string>,
  hasSpec: boolean,
): Row[] {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? "").split(",").map((h) => h.trim().toUpperCase());
  const cuiIdx = header.indexOf("CUI");
  if (cuiIdx < 0) return [];
  const caenIdx = header.indexOf("CAEN");
  // Trust ONLY spec-matched labels. Each category has its own indicator layout
  // (bank I20 = "profit din activități întrerupte", NOT employees; ONG/IFN
  // report no employees at all) — a blanket I13/I20 fallback poisons them.
  // The standard layout may be assumed only when no spec ships AND the header
  // is exactly the standard shape (last indicator I20).
  const standardShape = header[header.length - 1] === "I20";
  const effective = hasSpec ? codes : standardShape ? STANDARD_CODES : {};
  const idx: Record<string, number> = {};
  for (const [metric, code] of Object.entries(effective)) {
    const i = header.indexOf(code);
    if (i >= 0) idx[metric] = i;
  }
  const num = (cols: string[], i: number | undefined): number | null => {
    if (i === undefined) return null;
    const v = cols[i]?.trim();
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  // source garbage exists (a 2019 row declares 3.1e9 employees) — anything
  // outside Romania's plausible workforce is a filing error, not a value
  const empl = (cols: string[], i: number | undefined): number | null => {
    const n = num(cols, i);
    return n !== null && n >= 0 && n <= 2_000_000 ? n : null;
  };
  // keyed by CUI: a duplicate row in one file would break the batched upsert
  // ("cannot affect row a second time") — keep the last occurrence
  const byCui = new Map<string, Row>();
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li]!;
    if (!line) continue;
    const cols = line.split(",");
    const cui = cols[cuiIdx]?.trim();
    if (!cui || !/^\d+$/.test(cui)) continue;
    byCui.set(cui, {
      cui,
      year: fy,
      caen: caenIdx >= 0 ? (cols[caenIdx]?.trim() || null) : null,
      category,
      source_vintage: vintage,
      employees: empl(cols, idx["employees"]),
      net_turnover: num(cols, idx["net_turnover"]),
      total_revenue: num(cols, idx["total_revenue"]),
      total_expenses: num(cols, idx["total_expenses"]),
      profit_net: num(cols, idx["profit_net"]),
      loss_net: num(cols, idx["loss_net"]),
    });
  }
  return [...byCui.values()];
}

async function main(): Promise<void> {
  // sibling of the repo (…/code/seap-heartbeat), NOT inside it
  const cacheDir =
    process.argv[2] ?? new URL("../../../../../seap-heartbeat/financials", import.meta.url).pathname;
  mkdirSync(cacheDir, { recursive: true });
  const { sql } = createDb();
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
          codes = specCodes(readFileSync(specDest, "utf8"));
          hasSpec = true;
        } catch {
          /* spec unavailable — parseTxt decides via header shape */
        }
      }
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
      console.log(`  ${vintage} ${r.name}: ${rows.length} rows (fy ${meta.fy})`);
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
  await sql.end();
}

main().catch((err) => {
  console.error("import-financials crashed:", err);
  process.exit(1);
});
