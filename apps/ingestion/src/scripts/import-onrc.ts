import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { rename } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createDb, type DbSql } from "@seap/db";

/**
 * ONRC open-data monthly snapshot → company legal representatives.
 *
 * Source: data.gov.ro, organization ONRC, dataset "Firme înregistrate la
 * Registrul Comerțului până la data de <DD.MM.YYYY>" (refreshed ~monthly):
 *   OD_FIRME.CSV               (~690MB) — J-number ↔ CUI + firm identity
 *   OD_REPREZENTANTI_LEGALI.CSV (~335MB) — person, CALITATE (administrator…),
 *     birth date + birthplace (the homonym disambiguator; no CNP is ever public)
 *
 * Loads reference.onrc_firm + reference.company_reps as a SNAPSHOT (truncate +
 * reload — the dump is current-state, not history). person_key = folded name +
 * birth date + folded birth locality; ~99% of natural-person administrators
 * carry a birth date, juridical-person administrators legitimately don't.
 *
 *   pnpm --filter ingestion import-onrc [cache-dir]
 *     cache-dir default: ../../../../../seap-heartbeat/onrc (repo sibling)
 */

const CKAN = "https://data.gov.ro/api/3/action";

async function ckan<T>(path: string): Promise<T> {
  const r = await fetch(`${CKAN}/${path}`);
  if (!r.ok) throw new Error(`CKAN ${path}: HTTP ${r.status}`);
  const j = (await r.json()) as { success: boolean; result: T };
  if (!j.success) throw new Error(`CKAN ${path}: success=false`);
  return j.result;
}

interface Pkg {
  name: string;
  title: string;
  resources: { name: string; url: string }[];
}

/** Newest "firme-*" ONRC dataset + its snapshot date (from the title). */
async function latestFirmeDataset(): Promise<{ pkg: Pkg; snapshot: string }> {
  const res = await ckan<{ results: Pkg[] }>("package_search?q=organization:onrc&rows=100");
  let best: { pkg: Pkg; snapshot: string } | null = null;
  for (const pkg of res.results) {
    const m = /(\d{2})[.\- ](\d{2})[.\- ](\d{4})/.exec(pkg.title);
    if (!m || !/firme/i.test(pkg.title)) continue;
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    if (!best || iso > best.snapshot) best = { pkg, snapshot: iso };
  }
  if (!best) throw new Error("no ONRC firme dataset found");
  return best;
}

async function download(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) return;
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`download ${url}: HTTP ${r.status}`);
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(r.body as never), createWriteStream(tmp));
  await rename(tmp, dest);
}

/** "13/02/1991" → "1991-02-13" (or null). */
function roDate(s: string | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const nn = (s: string | undefined): string | null => {
  const v = s?.trim();
  return v ? v : null;
};

/**
 * Stream a caret-separated ONRC CSV (BOM, no quoting) and feed batched rows.
 * Returns [inserted, skipped] counts.
 */
async function loadFile(
  path: string,
  expectCols: number,
  onBatch: (rows: string[][]) => Promise<void>,
): Promise<[number, number]> {
  const rl = createInterface({
    input: createReadStream(path, "utf8"),
    crlfDelay: Infinity,
  });
  let header = true;
  let ok = 0;
  let skipped = 0;
  let batch: string[][] = [];
  for await (const raw of rl) {
    if (header) {
      header = false;
      continue;
    }
    const line = raw.replace(/^﻿/, "");
    if (!line) continue;
    const cols = line.split("^");
    if (cols.length !== expectCols) {
      skipped++;
      continue;
    }
    batch.push(cols);
    ok++;
    if (batch.length >= 5000) {
      await onBatch(batch);
      batch = [];
    }
  }
  if (batch.length) await onBatch(batch);
  return [ok, skipped];
}

async function main(): Promise<void> {
  const cacheDir =
    process.argv[2] ?? new URL("../../../../../seap-heartbeat/onrc", import.meta.url).pathname;
  mkdirSync(cacheDir, { recursive: true });
  const { sql } = createDb();
  const t0 = Date.now();

  const { pkg, snapshot } = await latestFirmeDataset();
  console.log(`dataset: ${pkg.name} (snapshot ${snapshot})`);
  const res = (name: string) => {
    const r = pkg.resources.find((x) => x.name.toUpperCase() === name);
    if (!r) throw new Error(`resource ${name} missing from ${pkg.name}`);
    return r.url;
  };
  const firmsPath = `${cacheDir}/${snapshot}-od_firme.csv`;
  const repsPath = `${cacheDir}/${snapshot}-od_reprezentanti_legali.csv`;
  console.log("downloading (skipped if cached)…");
  await download(res("OD_FIRME.CSV"), firmsPath);
  await download(res("OD_REPREZENTANTI_LEGALI.CSV"), repsPath);

  await sql`create schema if not exists reference`;
  await sql`
    create table if not exists reference.onrc_firm (
      j_number text primary key,
      cui text,
      name text not null,
      legal_form text,
      county text,
      locality text,
      snapshot_date date not null
    )
  `;
  await sql`
    create table if not exists reference.company_reps (
      j_number text not null,
      cui text,
      person_name text not null,
      calitate text,
      birth_date date,
      birth_locality text,
      birth_county text,
      birth_country text,
      res_locality text,
      res_county text,
      res_country text,
      person_key text,
      snapshot_date date not null
    )
  `;
  // snapshot semantics: the dump is current-state; drop indexes for load speed
  await sql`drop index if exists reference.company_reps_cui_idx`;
  await sql`drop index if exists reference.company_reps_person_key_idx`;
  await sql`drop index if exists reference.company_reps_name_trgm_idx`;
  await sql`truncate reference.onrc_firm, reference.company_reps`;

  // ── OD_FIRME: DENUMIRE^CUI^COD_INMATRICULARE^…^FORMA_JURIDICA^ADR_TARA^ADR_JUDET^ADR_LOCALITATE^… (20 cols)
  const seenJ = new Set<string>();
  const [nFirms, skFirms] = await loadFile(firmsPath, 20, async (rows) => {
    const vals = [];
    for (const c of rows) {
      const j = c[2]!.trim();
      if (!j || seenJ.has(j)) continue;
      seenJ.add(j);
      const cui = c[1]!.trim();
      vals.push({
        j_number: j,
        cui: /^\d{2,10}$/.test(cui) && cui !== "0" ? cui : null,
        name: c[0]!.trim(),
        legal_form: nn(c[5]),
        county: nn(c[7]),
        locality: nn(c[8]),
        snapshot_date: snapshot,
      });
    }
    if (vals.length)
      await sql`insert into reference.onrc_firm ${sql(vals, "j_number", "cui", "name", "legal_form", "county", "locality", "snapshot_date")}`;
  });
  console.log(`onrc_firm: ${nFirms} rows (${skFirms} malformed lines skipped)`);

  // ── OD_REPREZENTANTI_LEGALI: COD^PERSOANA^CALITATE^DATA_N^LOC_N^JUD_N^TARA_N^LOC^JUD^TARA (10 cols)
  const [nReps, skReps] = await loadFile(repsPath, 10, async (rows) => {
    const vals = rows.map((c) => ({
      j_number: c[0]!.trim(),
      cui: null,
      person_name: c[1]!.trim(),
      calitate: nn(c[2]),
      birth_date: roDate(c[3]),
      birth_locality: nn(c[4]),
      birth_county: nn(c[5]),
      birth_country: nn(c[6]),
      res_locality: nn(c[7]),
      res_county: nn(c[8]),
      res_country: nn(c[9]),
      person_key: null,
      snapshot_date: snapshot,
    }));
    await sql`insert into reference.company_reps ${sql(
      vals,
      "j_number",
      "cui",
      "person_name",
      "calitate",
      "birth_date",
      "birth_locality",
      "birth_county",
      "birth_country",
      "res_locality",
      "res_county",
      "res_country",
      "person_key",
      "snapshot_date",
    )}`;
  });
  console.log(`company_reps: ${nReps} rows (${skReps} malformed lines skipped)`);

  console.log("resolving CUI + person_key…");
  await sql`
    update reference.company_reps r
    set cui = f.cui
    from reference.onrc_firm f
    where f.j_number = r.j_number and f.cui is not null
  `;
  // homonym disambiguator: folded name + birth date + folded birth locality
  await sql`
    update reference.company_reps
    set person_key = lower(unaccent(person_name)) || '|' ||
                     coalesce(birth_date::text, '') || '|' ||
                     lower(unaccent(coalesce(birth_locality, '')))
  `;
  console.log("indexes…");
  await sql`create index company_reps_cui_idx on reference.company_reps (cui)`;
  await sql`create index company_reps_person_key_idx on reference.company_reps (person_key)`;
  await sql`create index company_reps_name_trgm_idx on reference.company_reps using gin (person_name gin_trgm_ops)`;
  await sql`analyze reference.onrc_firm`;
  await sql`analyze reference.company_reps`;

  const [cov] = (await sql`
    select
      (select count(*)::int from reference.company_reps) reps,
      (select count(distinct person_key)::int from reference.company_reps where birth_date is not null) persons,
      (select count(*)::int from marts.entity_profile ep
        join core.entities e on e.id = ep.entity_id
        where ep.role = 'supplier'
          and exists (select 1 from reference.company_reps r where r.cui = e.cui_canonical)) suppliers_covered
  `) as unknown as { reps: number; persons: number; suppliers_covered: number }[];
  console.log(
    JSON.stringify(
      {
        snapshot,
        firms: nFirms,
        reps: cov!.reps,
        distinctPersons: cov!.persons,
        suppliersCovered: cov!.suppliers_covered,
        seconds: Math.round((Date.now() - t0) / 1000),
      },
      null,
      2,
    ),
  );
  await sql.end();
}

main().catch((err) => {
  console.error("import-onrc crashed:", err);
  process.exit(1);
});
