import { onrcDate } from "../reference/parsers.js";
import { runMonitoredCli } from "../monitoring/cli.js";
import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { rename } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createDb, personKeySql, type DbSql } from "@seap/db";

/**
 * ONRC open-data monthly snapshot → company legal representatives.
 *
 * Source: data.gov.ro, organization ONRC, dataset "Firme înregistrate la
 * Registrul Comerțului până la data de <DD.MM.YYYY>" (refreshed ~monthly):
 *   OD_FIRME.CSV               (~690MB) — J-number ↔ CUI + firm identity and the day of each registration
 *   OD_REPREZENTANTI_LEGALI.CSV (~335MB) — person, CALITATE (administrator…),
 *     birth date + birthplace (the homonym disambiguator; no CNP is ever public)
 *
 * Loads reference.onrc_firm + reference.company_reps as a SNAPSHOT (the dump is
 * current-state, not history). The new snapshot is built in tables of its own
 * and takes the live names in the same transaction, just before it commits
 * (owner, 13 November 2026: the site is open while an import runs): readers
 * keep the previous snapshot for the whole load and wait only for the swap,
 * and a failure leaves the previous snapshot untouched. person_key = folded name +
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
      const labels = raw.replace(/^\ufeff/, "").trim().split("^");
      if (labels.length !== expectCols ||
          (expectCols === 20 && labels.slice(0, 4).join("^") !== "DENUMIRE^CUI^COD_INMATRICULARE^DATA_INMATRICULARE") ||
          (expectCols === 10 && labels.join("^") !== "COD_INMATRICULARE^PERSOANA_IMPUTERNICITA^CALITATE^DATA_NASTERE^LOCALITATE_NASTERE^JUDET_NASTERE^TARA_NASTERE^LOCALITATE^JUDET^TARA")) {
        throw new Error("Unexpected ONRC header; snapshot rolled back");
      }
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
  const { sql: connection } = createDb();
  await runMonitoredCli(connection, "import-onrc", async () => {
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

    // A failed snapshot must leave the previous one intact. Downloads happen before this lock.
    await connection.begin(async (tx) => {
      const sql = tx as unknown as DbSql;
      const dateFormats: Record<string, number> = {};
      const parseDate = (s: string | undefined) => {
        const parsed = onrcDate(s);
        dateFormats[parsed.format] = (dateFormats[parsed.format] ?? 0) + 1;
        if (parsed.format === "invalid") throw new Error("Invalid ONRC birth date; snapshot rolled back");
        return parsed.value;
      };
      // DATA_INMATRICULARE has the same two formats: "13/02/1991" and, for registrations from mid-2024 on,
      // "14/08/2026 09:23:04". A reader of the first one alone loses every firm registered since then.
      const registrationFormats: Record<string, number> = {};
      const parseRegistration = (s: string | undefined) => {
        const parsed = onrcDate(s);
        registrationFormats[parsed.format] = (registrationFormats[parsed.format] ?? 0) + 1;
        if (parsed.format === "invalid") throw new Error("Invalid ONRC registration date; snapshot rolled back");
        return parsed.value;
      };
      await sql`create schema if not exists reference`;
      // The snapshot loads beside the live tables (no index until it is whole) and replaces them at the end.
      await sql`drop table if exists reference.onrc_firm_load, reference.company_reps_load`;
      await sql`
        create table reference.onrc_firm_load (
          j_number text not null,
          cui text,
          name text not null,
          legal_form text,
          county text,
          locality text,
          snapshot_date date not null,
          registered_on date
        )
      `;
      await sql`
        create table reference.company_reps_load (
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

      // ── OD_FIRME: DENUMIRE^CUI^COD_INMATRICULARE^DATA_INMATRICULARE^EUID^FORMA_JURIDICA^ADR_TARA^ADR_JUDET^ADR_LOCALITATE^… (20 cols)
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
            registered_on: parseRegistration(c[3]),
          });
        }
        if (vals.length)
          await sql`insert into reference.onrc_firm_load ${sql(vals, "j_number", "cui", "name", "legal_form", "county", "locality", "snapshot_date", "registered_on")}`;
      });
      console.log(`onrc_firm: ${nFirms} rows (${skFirms} malformed lines skipped)`);

      // ── OD_REPREZENTANTI_LEGALI: COD^PERSOANA^CALITATE^DATA_N^LOC_N^JUD_N^TARA_N^LOC^JUD^TARA (10 cols)
      const [nReps, skReps] = await loadFile(repsPath, 10, async (rows) => {
        const vals = rows.map((c) => ({
          j_number: c[0]!.trim(),
          cui: null,
          person_name: c[1]!.trim(),
          calitate: nn(c[2]),
          birth_date: parseDate(c[3]),
          birth_locality: nn(c[4]),
          birth_county: nn(c[5]),
          birth_country: nn(c[6]),
          res_locality: nn(c[7]),
          res_county: nn(c[8]),
          res_country: nn(c[9]),
          person_key: null,
          snapshot_date: snapshot,
        }));
        await sql`insert into reference.company_reps_load ${sql(
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
      if (!nFirms || !nReps || skFirms || skReps) throw new Error("Empty or malformed ONRC snapshot; rolled back");
      console.log(`company_reps: ${nReps} rows (${skReps} malformed lines skipped)`);

      console.log("resolving CUI + person_key…");
      await sql`alter table reference.onrc_firm_load add constraint onrc_firm_load_pkey primary key (j_number)`;
      await sql`
        update reference.company_reps_load r
        set cui = f.cui
        from reference.onrc_firm_load f
        where f.j_number = r.j_number and f.cui is not null
      `;
      // homonym disambiguator: folded name + birth date + folded birth locality (personKeySql, @seap/db)
      await sql`
        update reference.company_reps_load
        set person_key = ${personKeySql(sql, sql`person_name`, sql`birth_date`, sql`birth_locality`)}
      `;
      console.log("indexes…");
      await sql`create index company_reps_load_cui_idx on reference.company_reps_load (cui)`;
      await sql`create index company_reps_load_person_key_idx on reference.company_reps_load (person_key)`;
      // The name part alone: an individual practice's holder is found by name (entity page, "același nume").
      await sql`create index company_reps_load_person_name_key_idx on reference.company_reps_load (split_part(person_key, '|', 1))`;
      await sql`create index company_reps_load_name_trgm_idx on reference.company_reps_load using gin (person_name gin_trgm_ops)`;
      // ONRC's names for a CUI (a renamed firm): the entity page reads them by CUI.
      await sql`create index onrc_firm_load_cui_idx on reference.onrc_firm_load (cui)`;
      await sql`analyze reference.onrc_firm_load`;
      await sql`analyze reference.company_reps_load`;

      const [cov] = (await sql`
        select
          (select count(*)::int from reference.company_reps_load) reps,
          (select count(distinct person_key)::int from reference.company_reps_load where birth_date is not null) persons,
          (select count(*)::int from marts.entity_profile ep
            join core.entities e on e.id = ep.entity_id
            where ep.role = 'supplier'
              and exists (select 1 from reference.company_reps_load r where r.cui = e.cui_canonical)) suppliers_covered
      `) as unknown as { reps: number; persons: number; suppliers_covered: number }[];

      // ── The swap. Whoever could read the previous tables can read the new ones (the default privileges of the
      // schema already say so; the explicit grants hold where they are not set). From the first DROP to the commit,
      // a few statements later, readers wait; a reader still inside a long statement makes the swap give up after
      // lock_timeout, and the whole import rolls back with the previous snapshot in place.
      console.log("swap…");
      for (const table of ["onrc_firm", "company_reps"]) {
        const grants = (await sql`
          select grantee, privilege_type from information_schema.role_table_grants
          where table_schema = 'reference' and table_name = ${table} and grantee <> current_user
        `) as unknown as { grantee: string; privilege_type: string }[];
        for (const g of grants) {
          if (!/^(SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)$/.test(g.privilege_type)) continue;
          await sql.unsafe(`grant ${g.privilege_type} on reference.${table}_load to "${g.grantee.replace(/"/g, '""')}"`);
        }
      }
      await sql`set local lock_timeout = '20s'`;
      await sql`drop table if exists reference.onrc_firm, reference.company_reps`;
      await sql`alter table reference.onrc_firm_load rename to onrc_firm`;
      await sql`alter table reference.company_reps_load rename to company_reps`;
      await sql`alter table reference.onrc_firm rename constraint onrc_firm_load_pkey to onrc_firm_pkey`;
      await sql`alter index reference.onrc_firm_load_cui_idx rename to onrc_firm_cui_idx`;
      await sql`alter index reference.company_reps_load_cui_idx rename to company_reps_cui_idx`;
      await sql`alter index reference.company_reps_load_person_key_idx rename to company_reps_person_key_idx`;
      await sql`alter index reference.company_reps_load_person_name_key_idx rename to company_reps_person_name_key_idx`;
      await sql`alter index reference.company_reps_load_name_trgm_idx rename to company_reps_name_trgm_idx`;
      console.log(
        JSON.stringify(
          {
            snapshot,
            dateFormats,
            registrationFormats,
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
    });
  });
}

main().catch((err) => {
  console.error("import-onrc crashed:", err);
  process.exit(1);
});
