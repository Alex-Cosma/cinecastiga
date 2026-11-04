import { afterAll, describe, expect, it } from 'vitest';
import { createDb, type DbSql } from '@seap/db';
import { AUTHORITY_FRAGMENT_REASON, AUTHORITY_FRAGMENT_REPAIR_ID, PINNED_FRAGMENTS, runAuthorityFragmentRepair } from './authority-fragment-repair.js';

const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/');
const isolated = ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/seap_test_');
const { sql } = createDb(isolated ? url.toString() : undefined); afterAll(() => sql.end());

/** Every qualified table is redirected to clones inside a transaction that always rolls back. */
function scoped(q: DbSql, prefix: string): DbSql {
  const rewrite = (s: string) => s.replace(/\b(core|app|reference|identity_repair)\./g, `${prefix}_$1.`);
  const f = ((parts: TemplateStringsArray, ...values: unknown[]) => {
    const mapped = parts.map(rewrite); Object.defineProperty(mapped, 'raw', { value: parts.raw.map(rewrite) });
    return q(mapped as unknown as TemplateStringsArray, ...values as never[]);
  }) as unknown as DbSql;
  Object.assign(f, { unsafe: (s: string) => q.unsafe(rewrite(s)), begin: (fn: (tx: DbSql) => Promise<unknown>) => (q as any).savepoint((tx: DbSql) => fn(scoped(tx, prefix))) });
  return f;
}

const run = '00000000-0000-4000-8000-000000002001';
const recovery = '00000000-0000-4000-8000-000000002002';
const daily = '00000000-0000-4000-8000-000000002003';
const backedUp = JSON.stringify({ backup: { completedAt: '2026-11-08T02:10:00Z' } });

describe.skipIf(!isolated)('legacy authority fragments merged in a full processing run (isolated rollback fixture)', () => {
  it('merges the fragments the CUI prefix proves, keeps every row intact and skips the rest', async () => {
    const rollback = Error('fixture rollback');
    await expect(sql.begin(async tx => {
      const prefix = `authority_fragments_${process.pid}`;
      const clones = {
        app: ['data_repairs', 'processing_runs', 'collection_control', 'collection_audit'],
        core: ['entities', 'entity_sicap_ids', 'entity_redirects', 'direct_acquisitions', 'notices', 'awards', 'contract_winners', 'ted_notices', 'ted_lot_winners'],
        reference: ['authority_uat'],
      };
      for (const [schema, tables] of Object.entries(clones)) {
        await tx.unsafe(`create schema ${prefix}_${schema}`);
        for (const table of tables) await tx.unsafe(`create table ${prefix}_${schema}.${table} (like ${schema}.${table} including all)`);
      }
      await tx.unsafe(`create schema ${prefix}_identity_repair`);
      await tx.unsafe(`create table ${prefix}_identity_repair.manifest (document jsonb not null)`);
      await tx.unsafe(`create table ${prefix}_identity_repair.dimension (sicap_id integer primary key, cui text, name text not null)`);
      await tx.unsafe(`create table ${prefix}_identity_repair.groups (id integer primary key, raw text not null, identity jsonb not null, source_count bigint not null)`);
      await tx.unsafe(`create table ${prefix}_identity_repair.source_rows (sicap_da_id bigint primary key, group_id integer not null)`);
      const q = scoped(tx as unknown as DbSql, prefix);

      await q`insert into app.collection_control(id,paused,maintenance,revision) values(1,true,true,1)`;
      await q`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
        values(${run}::uuid,'2026-11-08','full',1,'{}','1','backup',${JSON.stringify({})}::jsonb)`;
      await q`insert into identity_repair.manifest values(${JSON.stringify({ version: 2, rows: 9, groups: 6, files: { 'rows.tsv': 'x' } })}::jsonb)`;
      // Targets with the CUI, fragments with the CUI as fabricated SICAP id (production ids of 4 November).
      await q`insert into core.entities(id,name_display,name_normalized,county,cui_canonical,cui_valid,first_seen,last_seen) values
        (2139786,'Comuna Racova','comuna racova','Bacau','4455226',true,'2020-01-01','2026-10-01'),
        (2153036,'COMUNA RACOVA(CONSILIUL LOCAL)','comuna racova consiliul local',null,null,false,'2018-04-01','2019-12-01'),
        (2138520,'PRIMARIA COMUNEI PARTESTII DE JOS','primaria comunei partestii de jos','Suceava','4441182',true,null,null),
        (2154027,'ComunA Pîrtestii de Jos','comuna pirtestii de jos',null,null,false,null,null),
        (2139754,'Liceul Tehnologic General David Praporgescu','liceul tehnologic general david praporgescu','Brasov','4253715',true,null,null),
        (2153062,'Liceul tehnologic G-ral David Praporgescu','liceul tehnologic g ral david praporgescu',null,null,false,null,null),
        (2205736,'Comuna Tibucani','comuna tibucani','Neamt','2614244',true,null,null),
        (2151208,'Comuna Tibucani (Primaria Comunei Tibucani)','comuna tibucani primaria comunei tibucani',null,null,false,null,null),
        (2100001,'Agentia Test','agentia test','Olt','5000001',true,null,null),
        (2100002,'Agentia Test veche','agentia test veche',null,null,false,null,null)`;
      await q`insert into core.entity_sicap_ids values (2153036,'authority',4455226),(2154027,'authority',4441182),(2153062,'authority',4253715),
        (2151208,'authority',2164244),(2100002,'authority',5000001),(2139786,'authority',23600)`;
      await q`insert into reference.authority_uat values (2153036,24711,3000),(2139786,24711,3000),(2154027,149780,2000)`;
      // A prefix that is a real SICAP id in the original dimension is not fabricated.
      await q`insert into identity_repair.dimension values (5000001,'9','ALTA AUTORITATE')`;
      await q`insert into identity_repair.groups values
        (6462,'4455226 COMUNA RACOVA(CONSILIUL LOCAL)','{"kind":"unresolved"}',2),
        (6600,'4441182 ComunA Pîrtestii de Jos','{"kind":"unresolved"}',1),
        (6488,'4253715 Liceul tehnologic "G-ral David Praporgescu"','{"kind":"unresolved"}',1),
        (4610,'2164244 Comuna Tibucani (Primaria Comunei Tibucani)','{"kind":"unresolved"}',2),
        (4415,'43215777 Colegiul Agricol "Nicolae Cornateanu"','{"kind":"unresolved"}',1),
        (7000,'5000001 Agentia Test veche','{"kind":"unresolved"}',1),
        (1,'4305857 Municipiul Cluj-Napoca','{"kind":"cui","cui":"4305857"}',1)`;
      await q`insert into identity_repair.source_rows values (101,6462),(102,6462),(103,6600),(104,6488),(105,4610),(106,4610),(107,4415),(108,7000),(109,1)`;
      await q`insert into core.direct_acquisitions(id,sicap_da_id,authority_entity_id,closing_value,raw_id,cpv_code) values
        (1,101,2153036,1000.50,null,'09310000-5'),(2,102,2153036,2000,null,'09310000-5'),(3,103,2154027,300,null,null),
        (4,104,2153062,400,null,null),(5,999,2153062,500,77,null),(6,105,2151208,600,null,null),(7,106,2151208,700,null,null),
        (8,107,2100001,800,null,null),(9,108,2100002,900,null,null)`;
      const holders = async () => Object.fromEntries((await q`select id::text, authority_entity_id::text a from core.direct_acquisitions order by id`).map(r => [r.id, r.a]));
      const before = await holders();
      const fingerprint = () => q`select count(*)::int n, sum(closing_value)::text amount,
        sum(hashtextextended((to_jsonb(d)-'authority_entity_id')::text,0)::numeric)::text fp from core.direct_acquisitions d`;
      const fp = await fingerprint();

      // Before the verified backup nothing changes; a daily run defers.
      await expect(runAuthorityFragmentRepair(q, run)).rejects.toThrow('backed-up');
      await q`update app.processing_runs set stage='authority-uat-repair',stages=${backedUp}::jsonb`;
      await q`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
        values(${daily}::uuid,'2026-11-05','daily',1,'{}','1','backup-verified',${backedUp}::jsonb)`;
      expect(await runAuthorityFragmentRepair(q, daily)).toBeNull();
      expect(await holders()).toEqual(before);

      // The CUI rule alone first; the reviewed Tibucani entry follows in the recovery run below.
      const unpinned = PINNED_FRAGMENTS.map(p => ({ ...p, approved: false }));
      const report = await runAuthorityFragmentRepair(q, run, () => {}, unpinned);
      expect(report).toMatchObject({ merged: 2, movedRows: 3, redirects: 2, skipped: 2, skippedBy: { 'not-fully-evacuated': 1, 'prefix-is-sicap-id': 1 } });
      expect(await holders()).toEqual({ ...before, 1: '2139786', 2: '2139786', 3: '2138520' });
      expect(await fingerprint()).toEqual(fp);
      expect(await q`select old_id::text, canonical_id::text, reason, evidence->'sourceStrings' strings, evidence->'correctedRows' n,
          evidence->'previousIdentity'->'sicap' sicap from core.entity_redirects order by old_id`).toEqual([
        { old_id: '2153036', canonical_id: '2139786', reason: AUTHORITY_FRAGMENT_REASON, strings: ['4455226 COMUNA RACOVA(CONSILIUL LOCAL)'], n: 2, sicap: ['authority:4455226'] },
        { old_id: '2154027', canonical_id: '2138520', reason: AUTHORITY_FRAGMENT_REASON, strings: ['4441182 ComunA Pîrtestii de Jos'], n: 1, sicap: ['authority:4441182'] },
      ]);
      // The fabricated SICAP ids go, the real ones stay; the UAT follows the institution.
      expect((await q`select entity_id::text||':'||sicap_id s from core.entity_sicap_ids order by 1`).map(r => r.s))
        .toEqual(['2100002:5000001', '2139786:23600', '2151208:2164244', '2153062:4253715']);
      expect(await q`select entity_id::text id, uat_siruta from reference.authority_uat order by entity_id`)
        .toEqual([{ id: '2138520', uat_siruta: 149780 }, { id: '2139786', uat_siruta: 24711 }]);
      expect((await q`select first_seen::date::text f from core.entities where id=2139786`)[0]!.f).toBe('2018-04-01');
      const [marker] = await q`select status,processing_run_id::text run_id from app.data_repairs where id=${AUTHORITY_FRAGMENT_REPAIR_ID}`;
      expect(marker).toEqual({ status: 'applied', run_id: run });
      expect((await q`select stage from app.processing_runs where id=${run}::uuid`)[0]!.stage).toBe('authority-fragment-repair');
      expect((await q`select count(*)::int n from app.collection_audit where action='authority-fragment-repair'`)[0]!.n).toBe(1);
      // Same run: the stored report.
      expect(await runAuthorityFragmentRepair(q, run, () => {}, unpinned)).toEqual(report);

      // A recovery run finds nothing left to move; with Tibucani approved it merges that one too.
      await q`insert into app.processing_runs(id,scheduled_day,trigger,scope,control_revision,before_control,raw_boundary,stage,stages)
        values(${recovery}::uuid,'2026-11-08','manual','full',1,'{}','1','backup-verified',${backedUp}::jsonb)`;
      const again = await runAuthorityFragmentRepair(q, recovery);
      expect(again).toMatchObject({ merged: 1, movedRows: 2, redirects: 3, skipped: 2, previous: { runId: run, report: { merged: 2 } } });
      expect((await holders())[6]).toBe('2205736');
      expect(await fingerprint()).toEqual(fp);
      expect((await q`select evidence->>'rule' rule from core.entity_redirects where old_id=2151208`)[0]!.rule).toContain('mistyped');
      // Completed by the verified publication: never runs again.
      await q`update app.data_repairs set status='completed' where id=${AUTHORITY_FRAGMENT_REPAIR_ID}`;
      expect(await runAuthorityFragmentRepair(q, recovery)).toBeNull();
      throw rollback;
    })).rejects.toBe(rollback);
  });

  it('reports itself skipped without the staged identity audit', async () => {
    const rollback = Error('fixture rollback');
    await expect(sql.begin(async tx => {
      const prefix = `authority_fragments_none_${process.pid}`;
      for (const [schema, tables] of Object.entries({ app: ['data_repairs', 'processing_runs', 'collection_control', 'collection_audit'] })) {
        await tx.unsafe(`create schema ${prefix}_${schema}`);
        for (const table of tables) await tx.unsafe(`create table ${prefix}_${schema}.${table} (like ${schema}.${table} including all)`);
      }
      const q = scoped(tx as unknown as DbSql, prefix);
      await q`insert into app.collection_control(id,paused,maintenance,revision) values(1,true,true,1)`;
      await q`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
        values(${run}::uuid,'2026-11-08','full',1,'{}','1','backup-verified',${backedUp}::jsonb)`;
      expect(await runAuthorityFragmentRepair(q, run)).toBeNull();
      expect((await q`select count(*)::int n from app.data_repairs`)[0]!.n).toBe(0);
      throw rollback;
    })).rejects.toBe(rollback);
  });
});
