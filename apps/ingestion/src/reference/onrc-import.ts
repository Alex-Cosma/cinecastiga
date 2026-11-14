import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { diagnosticError, personKeySql, processingStage, processingWritable, type DbSql } from "@seap/db";
import { onrcDate } from "./parsers.js";

/**
 * The ONRC open-data snapshot → reference.onrc_firm + reference.company_reps.
 *
 * Source: data.gov.ro, organization ONRC, dataset "Firme înregistrate la Registrul Comerțului până la data de
 * <DD.MM.YYYY>" (refreshed about monthly):
 *   OD_FIRME.CSV                (~700 MB)  registration number ↔ CUI, the firm's identity, the day of each registration
 *   OD_REPREZENTANTI_LEGALI.CSV (~340 MB)  person, CALITATE (administrator…), birth date and birthplace (the homonym
 *                                          disambiguator; no CNP is ever public)
 *
 * The dump is the current state, not a history: the tables hold one snapshot. A new one is built in tables of its
 * own and takes the live names in the same transaction, just before it commits (owner, 13 November 2026: the site is
 * open while an import runs), so readers keep the previous snapshot for the whole load and wait only for the swap, and
 * a failure leaves the previous snapshot untouched. person_key = folded name + birth date + folded birth locality.
 *
 * Two callers: the processing run, weekly (runScheduledOnrcImport, below), and the operator's command
 * (scripts/import-onrc.ts), which is a monitored manual write.
 */

const CKAN = "https://data.gov.ro/api/3/action";
const FIRMS_FILE = "OD_FIRME.CSV";
const REPS_FILE = "OD_REPREZENTANTI_LEGALI.CSV";

export interface OnrcDataset {
  /** The CKAN package. */
  name: string;
  /** The snapshot day in the dataset's title, ISO. */
  snapshot: string;
  firmsUrl: string;
  repsUrl: string;
}

interface CkanPackage { name: string; title: string; resources: { name: string; url: string }[] }

/** The newest "firme" dataset of ONRC and its snapshot day (from the title). */
export async function latestOnrcDataset(timeoutMs = 60_000): Promise<OnrcDataset> {
  const response = await fetch(`${CKAN}/package_search?q=organization:onrc&rows=100`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`CKAN package_search: HTTP ${response.status}`);
  const body = (await response.json()) as { success: boolean; result: { results: CkanPackage[] } };
  if (!body.success) throw new Error("CKAN package_search: success=false");
  let best: { pkg: CkanPackage; snapshot: string } | null = null;
  for (const pkg of body.result.results) {
    const m = /(\d{2})[.\- ](\d{2})[.\- ](\d{4})/.exec(pkg.title);
    if (!m || !/firme/i.test(pkg.title)) continue;
    const snapshot = `${m[3]}-${m[2]}-${m[1]}`;
    if (!best || snapshot > best.snapshot) best = { pkg, snapshot };
  }
  if (!best) throw new Error("no ONRC firme dataset found");
  const url = (name: string) => {
    const resource = best!.pkg.resources.find((r) => r.name.toUpperCase() === name);
    if (!resource) throw new Error(`resource ${name} missing from ${best!.pkg.name}`);
    return resource.url;
  };
  return { name: best.pkg.name, snapshot: best.snapshot, firmsUrl: url(FIRMS_FILE), repsUrl: url(REPS_FILE) };
}

export interface DownloadOptions {
  /** The whole download, every attempt and wait included. */
  timeoutMs?: number;
  attempts?: number;
  /** The wait before attempt `n + 1`, after `n` failed. */
  backoffMs?: (failed: number) => number;
  log?: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

/** An answer that another attempt will not change (a missing or refused file). */
class PermanentDownloadError extends Error {}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Streams a file to `dest` (through `dest.part`); an existing `dest` is kept (the operator's cache).
 *
 * data.gov.ro sometimes closes a download midway (14 November 2026, 05:30: "other side closed" ~40 s into the run's
 * download; the same file came whole in 43 s minutes later), so a failed attempt starts over after a pause, up to
 * `attempts`, inside one deadline: the run waits at most as long as before the retries. It starts over from the first
 * byte: the portal answers a Range request with the whole file. A 4xx other than 408/429 is not retried, and a body
 * shorter than its Content-Length is a failed attempt, never a file.
 */
export async function downloadFile(url: string, dest: string, options: DownloadOptions = {}): Promise<void> {
  if (existsSync(dest)) return;
  const { timeoutMs = 30 * 60_000, attempts = 4, backoffMs = (failed: number) => 30_000 * 2 ** (failed - 1), log = () => {}, sleep = wait } = options;
  const deadline = Date.now() + timeoutMs;
  const part = `${dest}.part`;
  for (let attempt = 1; ; attempt++) {
    try {
      await rm(part, { force: true });
      const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
      if (!response.ok || !response.body) {
        const message = `download ${url}: HTTP ${response.status}`;
        throw response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429
          ? new PermanentDownloadError(message) : new Error(message);
      }
      const expected = Number(response.headers.get("content-length") ?? NaN);
      const out = createWriteStream(part);
      await pipeline(Readable.fromWeb(response.body as never), out);
      if (Number.isFinite(expected) && out.bytesWritten !== expected)
        throw new Error(`download ${url}: ${out.bytesWritten} of ${expected} bytes`);
      await rename(part, dest);
      return;
    } catch (error) {
      const pause = backoffMs(attempt);
      if (error instanceof PermanentDownloadError || attempt >= attempts || Date.now() + pause >= deadline) {
        await rm(part, { force: true });
        throw error;
      }
      log(`ONRC: attempt ${attempt} of ${attempts} failed (${(error as Error).message}${(error as Error).cause ? `: ${((error as Error).cause as Error).message}` : ""}); again in ${Math.round(pause / 1000)} s`);
      await sleep(pause);
    }
  }
}

const nn = (s: string | undefined): string | null => {
  const v = s?.trim();
  return v ? v : null;
};

const FIRMS_HEADER = "DENUMIRE^CUI^COD_INMATRICULARE^DATA_INMATRICULARE";
const REPS_HEADER = "COD_INMATRICULARE^PERSOANA_IMPUTERNICITA^CALITATE^DATA_NASTERE^LOCALITATE_NASTERE^JUDET_NASTERE^TARA_NASTERE^LOCALITATE^JUDET^TARA";

/** Stream a caret-separated ONRC CSV (BOM, no quoting) and feed batched rows. Returns [rows, skipped]. */
async function loadFile(path: string, expectCols: number, onBatch: (rows: string[][]) => Promise<void>): Promise<[number, number]> {
  const lines = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  let header = true, ok = 0, skipped = 0, batch: string[][] = [];
  for await (const raw of lines) {
    if (header) {
      header = false;
      const labels = raw.replace(/^﻿/, "").trim().split("^");
      if (labels.length !== expectCols || (expectCols === 20 && labels.slice(0, 4).join("^") !== FIRMS_HEADER) || (expectCols === 10 && labels.join("^") !== REPS_HEADER))
        throw new Error("Unexpected ONRC header; snapshot rolled back");
      continue;
    }
    const line = raw.replace(/^﻿/, "");
    if (!line) continue;
    const cols = line.split("^");
    if (cols.length !== expectCols) { skipped++; continue; }
    batch.push(cols);
    ok++;
    if (batch.length >= 5000) { await onBatch(batch); batch = []; }
  }
  if (batch.length) await onBatch(batch);
  return [ok, skipped];
}

export interface OnrcImportReport {
  snapshot: string;
  /** Registrations kept: the distinct registration numbers (a repeated number keeps its first line). */
  firms: number;
  reps: number;
  distinctPersons: number;
  suppliersCovered: number;
  /** Birth dates, by source format. */
  dateFormats: Record<string, number>;
  /** Registration days, by source format ("date" and, from mid-2024 on, "date_time"). */
  registrationFormats: Record<string, number>;
  seconds: number;
}

/**
 * Loads one snapshot from its two files and makes it the register, in one transaction. A malformed line, an
 * unexpected header, an invalid date or an empty file rolls everything back: the previous snapshot stays.
 */
export async function importOnrcSnapshot(connection: DbSql, input: { snapshot: string; firmsPath: string; repsPath: string },
  log: (message: string) => void = () => {}): Promise<OnrcImportReport> {
  const started = Date.now();
  const { snapshot, firmsPath, repsPath } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot)) throw new Error("Invalid ONRC snapshot day");
  return connection.begin(async (tx) => {
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
    await sql`set local statement_timeout = '30min'`;
    // "does not exist, skipping" from the DROPs below is not news in the run's log.
    await sql`set local client_min_messages = warning`;
    // Only on a database that never had the schema: CREATE SCHEMA needs a privilege on the database even with
    // IF NOT EXISTS, and the shadow build's role has none (its tables go to reference_next, which exists).
    const [schema] = await sql`select to_regnamespace('reference') is not null present`;
    if (!schema?.present) await sql`create schema reference`;
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
    log(`onrc_firm: ${seenJ.size} registrations from ${nFirms} lines (${skFirms} malformed lines skipped)`);

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
      await sql`insert into reference.company_reps_load ${sql(vals, "j_number", "cui", "person_name", "calitate", "birth_date", "birth_locality",
        "birth_county", "birth_country", "res_locality", "res_county", "res_country", "person_key", "snapshot_date")}`;
    });
    if (!nFirms || !nReps || skFirms || skReps) throw new Error("Empty or malformed ONRC snapshot; rolled back");
    log(`company_reps: ${nReps} rows (${skReps} malformed lines skipped)`);

    log("resolving CUI + person_key…");
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
    log("indexes…");
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
    log("swap…");
    // The grants of the tables being replaced, read from the catalog by their qualified names: in a shadow build the
    // connection points those names at reference_next (a schema name passed as a bare string would not be rewritten,
    // and would read the live tables, of which the build role sees nothing).
    const grants = (await sql`
      select c.relname, pg_get_userbyid(a.grantee) grantee, a.privilege_type
      from pg_class c cross join lateral aclexplode(c.relacl) a
      where c.oid in (to_regclass('reference.onrc_firm'), to_regclass('reference.company_reps'))
        and a.grantee <> c.relowner and a.grantee <> 0
    `) as unknown as { relname: string; grantee: string; privilege_type: string }[];
    for (const g of grants) {
      if (!/^(onrc_firm|company_reps)$/.test(g.relname) || !/^(SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)$/.test(g.privilege_type)) continue;
      await sql.unsafe(`grant ${g.privilege_type} on reference.${g.relname}_load to "${g.grantee.replace(/"/g, '""')}"`);
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
    return {
      snapshot, dateFormats, registrationFormats, firms: seenJ.size, reps: cov!.reps, distinctPersons: cov!.persons,
      suppliersCovered: cov!.suppliers_covered, seconds: Math.round((Date.now() - started) / 1000),
    };
  }) as Promise<OnrcImportReport>;
}

/** The portal's answer about the newest snapshot, asked up to three times (30 s, then 60 s apart). */
export async function latestWithRetries(log: (message: string) => void = () => {}, attempts = 3, sleep = wait,
  latest: () => Promise<OnrcDataset> = latestOnrcDataset): Promise<OnrcDataset> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await latest();
    } catch (error) {
      if (attempt >= attempts) throw error;
      log(`ONRC: the dataset lookup failed (attempt ${attempt} of ${attempts}: ${(error as Error).message}); again in ${30 * attempt} s`);
      await sleep(30_000 * attempt);
    }
  }
}

/** The snapshot day of the register in the database; null when there is none. */
export async function currentOnrcSnapshot(sql: DbSql): Promise<string | null> {
  const [present] = await sql`select to_regclass('reference.onrc_firm') is not null onrc`;
  if (!present?.onrc) return null;
  const [row] = await sql`select max(snapshot_date)::text snapshot from reference.onrc_firm`;
  return (row?.snapshot as string | null | undefined) ?? null;
}

export interface OnrcRefreshDeps {
  latest?: () => Promise<OnrcDataset>;
  download?: (url: string, dest: string) => Promise<void>;
}

export type OnrcRefresh =
  | { imported: true; previous: string | null; report: OnrcImportReport }
  | { imported: false; previous: string | null; latest: string; reason: "current" };

/**
 * Imports the newest published snapshot when it is newer than the register's, from files downloaded into `dir`.
 * The files are deleted afterwards, imported or not, whatever happened (owner, 13 November 2026: about 1 GB that
 * nothing reads again), unless `keepFiles` (the operator's cache on a development machine).
 */
export async function refreshOnrcRegistry(sql: DbSql, options: { dir: string; keepFiles?: boolean; force?: boolean; log?: (message: string) => void },
  deps: OnrcRefreshDeps = {}): Promise<OnrcRefresh> {
  const log = options.log ?? (() => {});
  const dataset = await (deps.latest ?? (() => latestWithRetries(log)))();
  const previous = await currentOnrcSnapshot(sql);
  if (!options.force && previous !== null && previous >= dataset.snapshot) return { imported: false, previous, latest: dataset.snapshot, reason: "current" };
  mkdirSync(options.dir, { recursive: true });
  const firmsPath = join(options.dir, `${dataset.snapshot}-od_firme.csv`), repsPath = join(options.dir, `${dataset.snapshot}-od_reprezentanti_legali.csv`);
  try {
    log(`ONRC: ${dataset.name} (snapshot ${dataset.snapshot}; the register has ${previous ?? "none"}); downloading…`);
    const download = deps.download ?? ((url: string, dest: string) => downloadFile(url, dest, { log }));
    await download(dataset.firmsUrl, firmsPath);
    await download(dataset.repsUrl, repsPath);
    return { imported: true, previous, report: await importOnrcSnapshot(sql, { snapshot: dataset.snapshot, firmsPath, repsPath }, log) };
  } finally {
    if (!options.keepFiles) {
      for (const path of [firmsPath, repsPath, `${firmsPath}.part`, `${repsPath}.part`]) await rm(path, { force: true });
      log("ONRC: the downloaded files are deleted");
    }
  }
}

export const ONRC_IMPORT_STAGE = "onrc-import";
/** The stages a run may be in when its pre-refresh steps start (the other repairs keep the same list). */
const PRE_REFRESH = new Set(["backup-verified", "shadow-prepare", "currency-repair", "reference-repair", "authority-uat-repair", "authority-fragment-repair", ONRC_IMPORT_STAGE]);

export type ScheduledOnrcImport =
  | null
  | { imported: true; previous: string | null; report: OnrcImportReport }
  | { imported: false; previous?: string | null; latest?: string; reason: "current" | "failed"; error?: unknown };

/**
 * The register refreshed by the processing run, weekly (owner, 13 November 2026: "pas al rulării săptămânale, nu chiar
 * în fiecare noapte"): called by the runner after the verified backup and before the refresh, it does something only
 * in a full run, the one that also recalculates the signals that read the register. A newer snapshot on data.gov.ro
 * is downloaded into a directory of its own, imported and the directory deleted; an unchanged one costs one request.
 *
 * In a shadow build the connection writes reference_next, so the new register is published by the swap with the
 * rest; in an in-place run the site is closed. Either way it is part of the coordinated publication, not a manual
 * write: nothing is refused meanwhile, unlike after the operator's command.
 *
 * A failure never stops the publication (the source is a public portal, away from our control): the import is one
 * transaction, so the register in place stays whole, the run continues with it and the error is kept in the audit.
 */
export async function runScheduledOnrcImport(q: DbSql, runId: string, log: (message: string) => void = () => {},
  deps: OnrcRefreshDeps & { tmp?: string } = {}): Promise<ScheduledOnrcImport> {
  const [run] = await q`select r.status, r.mode, r.scope, r.stage, r.stages, r.raw_boundary, r.control_revision, c.maintenance, c.paused, c.revision
    from app.processing_runs r cross join app.collection_control c where r.id = ${runId}::uuid and c.id = 1`;
  if (!run || run.status !== "running" || !processingWritable(run as never) || run.revision !== run.control_revision || !run.raw_boundary
    || !run.stages?.backup?.completedAt || !PRE_REFRESH.has(String(run.stage)))
    throw Error("The ONRC import requires a backed-up publication before normalization");
  if (run.scope !== "full") return null;
  await processingStage(q, runId, ONRC_IMPORT_STAGE);
  let dir: string | null = null;
  let outcome: Exclude<ScheduledOnrcImport, null>;
  try {
    dir = await mkdtemp(join(deps.tmp ?? tmpdir(), "onrc-"));
    outcome = await refreshOnrcRegistry(q, { dir, log }, deps);
    log(outcome.imported
      ? `ONRC import: snapshot ${outcome.report.snapshot} replaces ${outcome.previous ?? "none"} (${outcome.report.firms} registrations, ${outcome.report.reps} representatives, ${outcome.report.seconds} s)`
      : `ONRC import: the register is current (snapshot ${outcome.previous}; newest published ${outcome.latest})`);
  } catch (error) {
    outcome = { imported: false, reason: "failed", error: diagnosticError(error) };
    log(`ONRC import failed; the publication continues with the register in place: ${JSON.stringify(outcome.error)}`);
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  // Kept where the administration reads the other steps of a run. Never the reason a run stops.
  if (outcome.imported || outcome.reason === "failed") {
    await q`insert into app.collection_audit(actor_id, actor_name, action, before, after)
      values('system:processor', 'Importul registrului firmelor (ONRC)', ${ONRC_IMPORT_STAGE},
        ${JSON.stringify({ snapshot: outcome.imported ? outcome.previous : null })}::jsonb, ${JSON.stringify({ runId, ...outcome })}::jsonb)`
      .catch((error: unknown) => log(`ONRC import: the audit row was not written: ${JSON.stringify(diagnosticError(error))}`));
  }
  return outcome;
}
