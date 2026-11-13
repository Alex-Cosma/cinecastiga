import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb, shadowSql, type DbSql } from '@seap/db';
import { ONRC_IMPORT_STAGE, importOnrcSnapshot, refreshOnrcRegistry, runScheduledOnrcImport, type OnrcDataset } from './onrc-import.js';

const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/');
const isolated = ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/seap_test_');
const { sql } = createDb(isolated ? url.toString() : undefined); afterAll(() => sql.end());

/** Every qualified table is redirected to clones inside a transaction that always rolls back. */
function scoped(q: DbSql, prefix: string): DbSql {
  const rewrite = (s: string) => s.replace(/\b(core|marts|app|reference)\./g, `${prefix}_$1.`);
  const f = ((parts: TemplateStringsArray | string, ...values: unknown[]) => {
    // Identifier and row helpers (q("c"), q(rows, ...columns)) carry no SQL text.
    if (typeof parts === 'string' || !Array.isArray((parts as { raw?: unknown }).raw)) return (q as unknown as (...a: unknown[]) => unknown)(parts, ...values);
    const mapped = parts.map(rewrite); Object.defineProperty(mapped, 'raw', { value: parts.raw.map(rewrite) });
    return q(mapped as unknown as TemplateStringsArray, ...values as never[]);
  }) as unknown as DbSql;
  Object.assign(f, { unsafe: (s: string) => q.unsafe(rewrite(s)), begin: (fn: (tx: DbSql) => Promise<unknown>) => (q as any).savepoint((tx: DbSql) => fn(scoped(tx, prefix))) });
  return f;
}

const FIRMS_HEADER = 'DENUMIRE^CUI^COD_INMATRICULARE^DATA_INMATRICULARE^EUID^FORMA_JURIDICA^ADR_TARA^ADR_JUDET^ADR_LOCALITATE^ADR_DEN_STRADA^ADR_NR_STRADA^ADR_BLOC^ADR_SCARA^ADR_ETAJ^ADR_APARTAMENT^ADR_COD_POSTAL^ADR_SECTOR^ADR_COMPLETARE^WEB^TARA_FIRMA_MAMA';
const REPS_HEADER = 'COD_INMATRICULARE^PERSOANA_IMPUTERNICITA^CALITATE^DATA_NASTERE^LOCALITATE_NASTERE^JUDET_NASTERE^TARA_NASTERE^LOCALITATE^JUDET^TARA';
const firm = (name: string, cui: string, number: string, day: string, form = 'SRL', county = 'Cluj') =>
  [name, cui, number, day, `ROONRC.${number}`, form, 'România', county, 'Cluj-Napoca', '', '', '', '', '', '', '', '', '', '', ''].join('^');
const rep = (number: string, person: string, born: string) => [number, person, 'administrator', born, 'Iași', 'Iași', 'România', 'Iași', 'Iași', 'România'].join('^');

/** The two files of one snapshot, as ONRC publishes them (BOM, caret-separated, CRLF). */
async function snapshotFiles(dir: string, name: string, firms: string[], reps: string[]) {
  const firmsPath = join(dir, `${name}-od_firme.csv`), repsPath = join(dir, `${name}-od_reprezentanti_legali.csv`);
  await writeFile(firmsPath, `﻿${[FIRMS_HEADER, ...firms].join('\r\n')}\r\n`);
  await writeFile(repsPath, `﻿${[REPS_HEADER, ...reps].join('\r\n')}\r\n`);
  return { firmsPath, repsPath };
}
const JULY = {
  firms: [firm('FIRMA VECHE SRL', '100', 'J12/345/2004', '13/02/2004')],
  reps: [rep('J12/345/2004', 'POPESCU ION', '01/02/1970')],
};
const NOVEMBER = {
  firms: [
    firm('FIRMA VECHE SRL', '100', 'J2004000345123', '13/02/2004'),
    // Registered after mid-2024: the day comes with a time.
    firm('FIRMA NOUA SRL', '200', 'J2026050211003', '14/08/2026 09:23:04'),
    // The same number twice: the first row is the registration.
    firm('FIRMA NOUA (dublură) SRL', '200', 'J2026050211003', '15/08/2026 10:00:00'),
    // No company code in the register.
    firm('PF FĂRĂ COD', '0', 'F40/22/1991', '13/02/1991', 'PF', 'Bucureşti'),
  ],
  reps: [rep('J2004000345123', 'POPESCU ION', '01/02/1970'), rep('J2026050211003', 'IONESCU ANA', '03/04/1980 00:00:00')],
};
const dataset = (snapshot: string): OnrcDataset => ({ name: `firme-${snapshot}`, snapshot, firmsUrl: 'fixture://firms', repsUrl: 'fixture://reps' });
const run = '00000000-0000-4000-8000-000000003001';
const daily = '00000000-0000-4000-8000-000000003002';
const backedUp = JSON.stringify({ backup: { completedAt: '2026-11-15T02:10:00Z' } });

describe.skipIf(!isolated)('the ONRC register replaced by a snapshot (isolated rollback fixture)', () => {
  /** Clones of the tables the import and its stage touch, a register of July in place, and a directory for the files. */
  async function fixture<T>(work: (q: DbSql, prefix: string, dir: string) => Promise<T>): Promise<void> {
    const rollback = Error('fixture rollback');
    const dir = await mkdtemp(join(tmpdir(), 'onrc-fixture-'));
    try {
      await expect(sql.begin(async tx => {
        const prefix = `onrc_import_${process.pid}`;
        const clones = { app: ['processing_runs', 'collection_control', 'collection_audit'], core: ['entities'], marts: ['entity_profile'], reference: ['onrc_firm', 'company_reps'] };
        for (const [schema, tables] of Object.entries(clones)) {
          await tx.unsafe(`create schema ${prefix}_${schema}`);
          for (const table of tables) await tx.unsafe(`create table ${prefix}_${schema}.${table} (like ${schema}.${table} including all)`);
        }
        const q = scoped(tx as unknown as DbSql, prefix);
        const july = await snapshotFiles(dir, 'july', JULY.firms, JULY.reps);
        await importOnrcSnapshot(q, { snapshot: '2026-07-08', ...july });
        await work(q, prefix, dir);
        throw rollback;
      })).rejects.toBe(rollback);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
  const register = (q: DbSql) => q`select j_number, cui, name, registered_on::text registered, snapshot_date::text snapshot from reference.onrc_firm order by j_number`;

  it('loads both date formats, keeps the first row of a number, and takes the live names with their indexes', async () => {
    await fixture(async (q, prefix, dir) => {
      const files = await snapshotFiles(dir, 'november', NOVEMBER.firms, NOVEMBER.reps);
      const report = await importOnrcSnapshot(q, { snapshot: '2026-11-04', ...files });
      expect(report).toMatchObject({ snapshot: '2026-11-04', firms: 3, reps: 2, distinctPersons: 2, registrationFormats: { date: 2, date_time: 1 }, dateFormats: { date: 1, date_time: 1 } });
      expect((await register(q)).map(r => [r.j_number, r.cui, r.name, r.registered, r.snapshot])).toEqual([
        ['F40/22/1991', null, 'PF FĂRĂ COD', '1991-02-13', '2026-11-04'],
        ['J2004000345123', '100', 'FIRMA VECHE SRL', '2004-02-13', '2026-11-04'],
        ['J2026050211003', '200', 'FIRMA NOUA SRL', '2026-08-14', '2026-11-04'],
      ]);
      expect((await q`select j_number, cui, person_name, birth_date::text born, person_key is not null keyed from reference.company_reps order by j_number`)
        .map(r => [r.j_number, r.cui, r.person_name, r.born, r.keyed])).toEqual([
        ['J2004000345123', '100', 'POPESCU ION', '1970-02-01', true], ['J2026050211003', '200', 'IONESCU ANA', '1980-04-03', true]]);
      // The names the migrations, the web and the next import know.
      expect((await q`select indexname from pg_indexes where schemaname = ${`${prefix}_reference`} order by 1`).map(r => r.indexname)).toEqual([
        'company_reps_cui_idx', 'company_reps_name_trgm_idx', 'company_reps_person_key_idx', 'company_reps_person_name_key_idx', 'onrc_firm_cui_idx', 'onrc_firm_pkey']);
      expect(await q`select 1 from pg_tables where schemaname = ${`${prefix}_reference`} and tablename like '%_load'`).toHaveLength(0);
    });
  });

  it('leaves the register in place when a file is malformed', async () => {
    await fixture(async (q, _prefix, dir) => {
      const before = await register(q);
      const broken = await snapshotFiles(dir, 'broken', [...NOVEMBER.firms, 'O LINIE^CU^PREA^PUȚINE^COLOANE'], NOVEMBER.reps);
      await expect(importOnrcSnapshot(q, { snapshot: '2026-11-04', ...broken })).rejects.toThrow('malformed');
      const invalid = await snapshotFiles(dir, 'invalid', [firm('FIRMA SRL', '300', 'J1/1/2020', '31/02/2020')], NOVEMBER.reps);
      await expect(importOnrcSnapshot(q, { snapshot: '2026-11-04', ...invalid })).rejects.toThrow('Invalid ONRC registration date');
      expect(await register(q)).toEqual(before);
      expect(before.map(r => r.snapshot)).toEqual(['2026-07-08']);
    });
  });

  it('imports only a newer snapshot and deletes the downloaded files, imported or not', async () => {
    await fixture(async (q, _prefix, dir) => {
      const source = await snapshotFiles(dir, 'source', NOVEMBER.firms, NOVEMBER.reps);
      const work = join(dir, 'work');
      let downloads = 0;
      const deps = (snapshot: string) => ({
        latest: async () => dataset(snapshot),
        download: async (from: string, dest: string) => { downloads++; await copyFile(from === 'fixture://firms' ? source.firmsPath : source.repsPath, dest); },
      });
      // The register already has the newest published snapshot: nothing is downloaded.
      expect(await refreshOnrcRegistry(q, { dir: work }, deps('2026-07-08'))).toEqual({ imported: false, previous: '2026-07-08', latest: '2026-07-08', reason: 'current' });
      expect(downloads).toBe(0);
      const outcome = await refreshOnrcRegistry(q, { dir: work }, deps('2026-11-04'));
      expect(outcome).toMatchObject({ imported: true, previous: '2026-07-08', report: { snapshot: '2026-11-04', firms: 3 } });
      expect(downloads).toBe(2);
      expect(await readdir(work)).toEqual([]);
      // The operator's cache on a development machine.
      await refreshOnrcRegistry(q, { dir: work, keepFiles: true, force: true }, deps('2026-11-04'));
      expect((await readdir(work)).sort()).toEqual(['2026-11-04-od_firme.csv', '2026-11-04-od_reprezentanti_legali.csv']);
      // A failed download deletes what it left behind too.
      await rm(work, { recursive: true, force: true });
      await expect(refreshOnrcRegistry(q, { dir: work, force: true }, { latest: async () => dataset('2026-12-02'),
        download: async (_from, dest) => { await writeFile(`${dest}.part`, 'half'); throw Error('network down'); } })).rejects.toThrow('network down');
      expect(await readdir(work)).toEqual([]);
    });
  });

  it('runs in the weekly full run only, never stops the run, and deletes its directory', async () => {
    await fixture(async (q, _prefix, dir) => {
      const source = await snapshotFiles(dir, 'source', NOVEMBER.firms, NOVEMBER.reps);
      const tmp = join(dir, 'tmp'); await mkdtemp(join(dir, 'x')); await writeFile(join(dir, 'keep'), ''); await rm(tmp, { recursive: true, force: true });
      const { mkdir } = await import('node:fs/promises'); await mkdir(tmp);
      const copy = async (from: string, dest: string) => copyFile(from === 'fixture://firms' ? source.firmsPath : source.repsPath, dest);
      await q`insert into app.collection_control(id,paused,maintenance,revision) values(1,true,true,1)`;
      await q`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
        values(${run}::uuid,'2026-11-15','full',1,'{}','1','backup',${JSON.stringify({})}::jsonb)`;
      // Before the verified backup nothing happens.
      await expect(runScheduledOnrcImport(q, run, () => {}, { tmp, latest: async () => dataset('2026-11-04'), download: copy })).rejects.toThrow('backed-up');
      await q`update app.processing_runs set stage='authority-fragment-repair',stages=${backedUp}::jsonb`;
      // A daily run does nothing, not even ask the portal.
      await q`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
        values(${daily}::uuid,'2026-11-14','daily',1,'{}','1','backup-verified',${backedUp}::jsonb)`;
      expect(await runScheduledOnrcImport(q, daily, () => {}, { tmp, latest: async () => { throw Error('asked'); } })).toBeNull();
      expect((await q`select stage from app.processing_runs where id=${daily}::uuid`)[0]!.stage).toBe('backup-verified');

      // The portal is down: the run goes on with the register in place, and the error is kept.
      const lines: string[] = [];
      const failed = await runScheduledOnrcImport(q, run, m => lines.push(m), { tmp, latest: async () => { throw Error('portal down'); } });
      expect(failed).toMatchObject({ imported: false, reason: 'failed' });
      expect(lines.join('\n')).toContain('the publication continues with the register in place');
      expect((await register(q)).map(r => r.snapshot)).toEqual(['2026-07-08']);
      expect((await q`select stage from app.processing_runs where id=${run}::uuid`)[0]!.stage).toBe(ONRC_IMPORT_STAGE);
      expect((await q`select after->>'reason' reason from app.collection_audit where action=${ONRC_IMPORT_STAGE}`).map(r => r.reason)).toEqual(['failed']);

      // A newer snapshot: imported, audited, nothing left on disk. The same run can call it again (a restarted command).
      const imported = await runScheduledOnrcImport(q, run, () => {}, { tmp, latest: async () => dataset('2026-11-04'), download: copy });
      expect(imported).toMatchObject({ imported: true, previous: '2026-07-08', report: { snapshot: '2026-11-04', firms: 3, reps: 2 } });
      expect((await register(q)).map(r => r.snapshot)).toEqual(['2026-11-04', '2026-11-04', '2026-11-04']);
      expect(await readdir(tmp)).toEqual([]);
      expect((await q`select count(*)::int n from app.collection_audit where action=${ONRC_IMPORT_STAGE} and after->>'imported'='true'`)[0]!.n).toBe(1);
      // The register is current: one request to the portal, nothing downloaded, no audit row.
      let asked = 0;
      expect(await runScheduledOnrcImport(q, run, () => {}, { tmp, latest: async () => { asked++; return dataset('2026-11-04'); }, download: async () => { throw Error('downloaded'); } }))
        .toEqual({ imported: false, previous: '2026-11-04', latest: '2026-11-04', reason: 'current' });
      expect(asked).toBe(1);
      expect((await q`select count(*)::int n from app.collection_audit where action=${ONRC_IMPORT_STAGE}`)[0]!.n).toBe(2);
      expect(existsSync(join(dir, 'keep'))).toBe(true);
    });
  });

  it('writes the shadow schema in a shadow build and leaves the live register untouched', async () => {
    const rollback = Error('fixture rollback');
    const dir = await mkdtemp(join(tmpdir(), 'onrc-fixture-'));
    try {
      await expect(sql.begin(async tx => {
        // As shadow-prepare.sh leaves them: the shadow schemas with the live structure, owned by the build role, the
        // web's read grant on the register (no default privileges here: the import must carry the grants itself).
        for (const [schema, tables] of Object.entries({ core: ['entities'], marts: ['entity_profile'], reference: ['onrc_firm', 'company_reps'] })) {
          await tx.unsafe(`create schema ${schema}_next authorization seap_build`);
          for (const table of tables) {
            await tx.unsafe(`create table ${schema}_next.${table} (like ${schema}.${table} including all)`);
            await tx.unsafe(`alter table ${schema}_next.${table} owner to seap_build`);
          }
        }
        await tx.unsafe('grant select on reference_next.onrc_firm, reference_next.company_reps to seap_web');
        const live = tx as unknown as DbSql;
        const liveBefore = await live`select count(*)::int n, max(snapshot_date)::text snapshot from reference.onrc_firm`;
        // The build's role, which has no privilege on the live schemas: a name the rewrite misses fails here.
        await live`set local role seap_build`;
        // The build's connection: every qualified name of the three schemas goes to its shadow.
        const inner = Object.assign(((parts: TemplateStringsArray, ...values: unknown[]) => live(parts, ...values as never[])) as unknown as DbSql,
          { unsafe: (s: string) => live.unsafe(s), begin: (fn: (q: DbSql) => Promise<unknown>) => (live as any).savepoint(fn) });
        const build = shadowSql(inner);
        const files = await snapshotFiles(dir, 'november', NOVEMBER.firms, NOVEMBER.reps);
        const report = await importOnrcSnapshot(build, { snapshot: '2026-11-04', ...files });
        expect(report).toMatchObject({ firms: 3, reps: 2 });
        await live`reset role`;
        expect((await live`select c.relname, pg_get_userbyid(c.relowner) owner, c.relacl::text acl from pg_class c
          where c.relnamespace = 'reference_next'::regnamespace and c.relkind = 'r' order by 1`).map(r => [r.relname, r.owner, r.acl])).toEqual([
          ['company_reps', 'seap_build', '{seap_build=arwdDxt/seap_build,seap_web=r/seap_build}'],
          ['onrc_firm', 'seap_build', '{seap_build=arwdDxt/seap_build,seap_web=r/seap_build}']]);
        expect((await live`select j_number, registered_on::text registered from reference_next.onrc_firm order by 1`).map(r => [r.j_number, r.registered])).toEqual([
          ['F40/22/1991', '1991-02-13'], ['J2004000345123', '2004-02-13'], ['J2026050211003', '2026-08-14']]);
        expect((await live`select indexname from pg_indexes where schemaname = 'reference_next' order by 1`).map(r => r.indexname)).toEqual([
          'company_reps_cui_idx', 'company_reps_name_trgm_idx', 'company_reps_person_key_idx', 'company_reps_person_name_key_idx', 'onrc_firm_cui_idx', 'onrc_firm_pkey']);
        expect(await live`select count(*)::int n, max(snapshot_date)::text snapshot from reference.onrc_firm`).toEqual(liveBefore);
        expect(await live`select 1 from pg_tables where schemaname in ('reference', 'reference_next') and tablename like '%_load'`).toHaveLength(0);
        throw rollback;
      })).rejects.toBe(rollback);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
