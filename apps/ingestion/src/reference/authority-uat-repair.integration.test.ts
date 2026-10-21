import {afterAll,describe,expect,it} from 'vitest';
import {createDb,type DbSql} from '@seap/db';
import {AUTHORITY_UAT_CORRECTIONS,AUTHORITY_UAT_REPAIR_ID,runAuthorityUatRepair} from './authority-uat-repair.js';
const url=new URL(process.env.DATABASE_URL??'postgres://invalid/');
const isolated=['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/seap_test_');
const {sql}=createDb(isolated?url.toString():undefined);afterAll(()=>sql.end());
/** Every qualified table is redirected to clones inside a transaction that always rolls back. */
function scoped(q:DbSql,prefix:string):DbSql {
 const rewrite=(s:string)=>s.replace(/\b(core|app|reference)\./g,`${prefix}_$1.`);
 const f=((parts:TemplateStringsArray,...values:unknown[])=>{
  const mapped=parts.map(rewrite);Object.defineProperty(mapped,'raw',{value:parts.raw.map(rewrite)});
  return q(mapped as unknown as TemplateStringsArray,...values as never[]);
 }) as unknown as DbSql;
 Object.assign(f,{unsafe:(s:string)=>q.unsafe(rewrite(s)),begin:(fn:(tx:DbSql)=>Promise<unknown>)=>(q as any).savepoint((tx:DbSql)=>fn(scoped(tx,prefix)))});
 return f;
}
const run='00000000-0000-4000-8000-000000001515';
describe.skipIf(!isolated)('authority UAT county repair in the processing window (isolated rollback fixture)',()=>{
 it('corrects the pinned rows once, after the backup, and leaves everything else untouched',async()=>{
  const rollback=Error('fixture rollback');
  await expect(sql.begin(async tx=>{
   const prefix=`authority_uat_${process.pid}`;
   for(const [schema,tables] of Object.entries({app:['data_repairs','processing_runs','collection_control','collection_audit'],core:['entities'],reference:['uat','authority_uat']})){
    await tx.unsafe(`create schema ${prefix}_${schema}`);
    for(const table of tables)await tx.unsafe(`create table ${prefix}_${schema}.${table} (like ${schema}.${table} including all)`);
   }
   const q=scoped(tx as unknown as DbSql,prefix);
   await q`insert into app.collection_control(id,paused,maintenance,revision) values(1,true,true,1)`;
   await q`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
    values(${run}::uuid,'2026-10-22','daily',1,'{}','1','backup',${JSON.stringify({})}::jsonb)`;
   // 1 Oct snapshot rows: Vânători GL and Sfântu Gheorghe CV on the wrong codes, the
   // genuine Mehedinți town hall, and a Cobia row already changed by someone else.
   await q`insert into core.entities(id,name_display,name_normalized,county,cui_canonical,cui_valid) values
    (2142023,'COMUNA VANATORI (PRIMARIA VANATORI)','comuna vanatori primaria vanatori','Galati','4393212',true),(2146546,'Municipiul Sfantu Gheorghe','municipiul sfantu gheorghe','Covasna','4404605',true),
    (2139010,'COMUNA VANATORI','comuna vanatori','Mehedinti','4405440',true),(2139931,'Comuna Corabia (Primaria Cobia)','comuna corabia primaria cobia','Dambovita','4449429',true)`;
   await q`insert into reference.uat(siruta,name,county,tip,population) values(113849,'VÂNATORI','mehedinti','3',1964),(75150,'VÎNATORI','galati','3',4864),
    (94456,'SFÂNTU GHEORGHE','ialomita','3',2038),(63394,'MUNICIPIUL SFÎNTU GHEORGHE','covasna','1',56006),(66580,'COBIA','dambovita','3',4635)`;
   await q`insert into reference.authority_uat values(2142023,113849,1964),(2146546,94456,54651),(2139010,113849,1964),(2139931,1,1)`;
   const rows=()=>q`select entity_id::text id,uat_siruta siruta,population from reference.authority_uat order by entity_id`;

   // Before the verified backup nothing changes.
   await expect(runAuthorityUatRepair(q,run)).rejects.toThrow('backed-up');
   await q`update app.processing_runs set stage='backup-verified',stages=${JSON.stringify({backup:{completedAt:'2026-10-22T02:10:00Z'}})}::jsonb`;
   await q`update app.collection_control set maintenance=false`;
   await expect(runAuthorityUatRepair(q,run)).rejects.toThrow('backed-up');
   await q`update app.collection_control set maintenance=true`;
   expect((await rows()).map(r=>r.siruta)).toEqual([113849,1,113849,94456]);

   const report=await runAuthorityUatRepair(q,run);
   expect(report).toMatchObject({corrected:2,alreadyCorrected:0,skipped:9});
   expect(await rows()).toEqual([
    {id:'2139010',siruta:113849,population:1964},{id:'2139931',siruta:1,population:1},
    {id:'2142023',siruta:75150,population:4864},{id:'2146546',siruta:63394,population:56006}]);
   const outcome=(id:string)=>report!.rows.find((r:{entityId:string})=>r.entityId===id);
   expect(outcome('2139931')).toMatchObject({outcome:'skipped',reason:'mapping-changed'});
   expect(outcome('2140064')).toMatchObject({outcome:'skipped',reason:'entity-changed'});
   expect(report!.rows).toHaveLength(AUTHORITY_UAT_CORRECTIONS.length);
   const [marker]=await q`select status,processing_run_id::text run_id,scheduled_day::text as day from app.data_repairs where id=${AUTHORITY_UAT_REPAIR_ID}`;
   expect(marker).toEqual({status:'applied',run_id:run,day:'2026-10-22'});
   expect((await q`select stage from app.processing_runs`)[0]!.stage).toBe('authority-uat-repair');
   expect((await q`select count(*)::int n from app.collection_audit where action='authority-uat-repair'`)[0]!.n).toBe(1);

   // Same run: the stored report, no second write.
   expect(await runAuthorityUatRepair(q,run)).toEqual(report);
   // A recovery run after a failed publication finds the rows corrected and keeps the first evidence.
   const recovery='00000000-0000-4000-8000-000000001516';
   await q`insert into app.processing_runs(id,scheduled_day,trigger,scope,control_revision,before_control,raw_boundary,stage,stages)
    values(${recovery}::uuid,'2026-10-22','manual','full',1,'{}','1','backup-verified',${JSON.stringify({backup:{completedAt:'2026-10-22T09:00:00Z'}})}::jsonb)`;
   const again=await runAuthorityUatRepair(q,recovery);
   expect(again).toMatchObject({corrected:0,alreadyCorrected:2,skipped:9,previous:{runId:run,report:{corrected:2}}});
   expect((await rows()).map(r=>r.siruta)).toEqual([113849,1,75150,63394]);
   // Completed by the verified publication: never runs again.
   await q`update app.data_repairs set status='completed' where id=${AUTHORITY_UAT_REPAIR_ID}`;
   await q`update reference.authority_uat set uat_siruta=113849 where entity_id=2142023`;
   expect(await runAuthorityUatRepair(q,recovery)).toBeNull();
   expect((await rows()).find(r=>r.id==='2142023')!.siruta).toBe(113849);
   throw rollback;
  })).rejects.toBe(rollback);
 });
});
