import {afterAll,beforeEach,describe,expect,it} from 'vitest';
import {createDb} from '../src/client.js';
import {claimProcessing,processingStage,failProcessing,finishProcessing,processingSchedule} from '../src/processing.js';
const url=process.env['TEST_DATABASE_URL'];
if(url&&!/^seap_test_/.test(new URL(url).pathname.slice(1)))throw Error('Isolated test database required');
const suite=url?describe:describe.skip;
suite('scheduled publication state machine (no network)',()=>{
 const {sql:q}=createDb(url);
 beforeEach(async()=>{
  await q`truncate app.processing_runs,app.collection_audit,app.monitoring_refreshes cascade`;
  await q`insert into app.collection_control(id) values(1) on conflict do nothing`;
  await q`update app.collection_control set revision=1,paused=false,maintenance=false,blocked_reason=null,
    processing_enabled=true,processing_enabled_at='2026-09-26T00:00:00Z',processing_time='05:00',risk_weekday=0 where id=1`;
 });
 afterAll(async()=>{await q.end({timeout:5});});
 const sunday=new Date('2026-09-27T02:00:00Z'),monday=new Date('2026-09-28T02:00:00Z');
 it('uses Romanian 05:00, runs risk on Sunday, and admits only one concurrent claimant',async()=>{
  expect(await claimProcessing(q,new Date('2026-09-27T01:59:59Z'))).toBeNull();
  const claims=await Promise.all([claimProcessing(q,sunday),claimProcessing(q,sunday)]);
  expect(claims.filter(Boolean)).toHaveLength(1);expect(claims.find(Boolean)?.scope).toBe('full');
  expect((await q`select paused,maintenance,revision from app.collection_control`)[0]).toMatchObject({paused:true,maintenance:true,revision:2});
 });
 it('runs daily without risk on Monday and never starts immediately upon late activation',async()=>{
  await q`update app.collection_control set processing_enabled_at='2026-09-28T03:00:00Z'`;
  expect(await claimProcessing(q,new Date('2026-09-28T04:00:00Z'))).toBeNull();
  await q`update app.collection_control set processing_enabled_at='2026-09-26T00:00:00Z'`;
  expect((await claimProcessing(q,monday))?.scope).toBe('daily');
 });
 it('accounts for winter offset and does not repeat a local day',async()=>{
  expect(await claimProcessing(q,new Date('2026-10-25T02:59:59Z'))).toBeNull();
  const run=await claimProcessing(q,new Date('2026-10-25T03:00:00Z'));expect(run?.scope).toBe('full');
  await failProcessing(q,run!.id);
  await q`update app.collection_control set maintenance=false,paused=false`;
  expect(await claimProcessing(q,new Date('2026-10-25T04:00:00Z'))).toBeNull();
 });
 it('disabled schedule or existing maintenance prevents starting',async()=>{
  await q`update app.collection_control set processing_enabled=false`;expect(await claimProcessing(q,sunday)).toBeNull();
  await q`update app.collection_control set processing_enabled=true,maintenance=true`;expect(await claimProcessing(q,sunday)).toBeNull();
 });
 it('retains maintenance on failures and records the failing stage without retry',async()=>{
  const run=(await claimProcessing(q,monday))!;await processingStage(q,run.id,'backup');await failProcessing(q,run.id);
  expect((await q`select status,stage,error from app.processing_runs`)[0]).toMatchObject({status:'failed',stage:'backup'});
  expect((await q`select maintenance,paused from app.collection_control`)[0]).toMatchObject({maintenance:true,paused:true});
  expect(await claimProcessing(q,monday)).toBeNull();
 });
 async function verified(id:string){
  const [cp]=await q`insert into app.monitoring_refreshes(kind,status,completed_at) values('coordinated','ready',now()) returning id`;
  await q`update app.processing_runs set checkpoint_id=${cp!.id},search_verified='{"documents":3}' where id=${id}::uuid`;
  await processingStage(q,id,'reopen');
 }
 it('requires both checkpoint and search checks before reopening',async()=>{
  const run=(await claimProcessing(q,monday))!;
  await expect(finishProcessing(q,run.id)).rejects.toThrow('maintenance retained');
  await verified(run.id);await finishProcessing(q,run.id);
  expect((await q`select maintenance,paused from app.collection_control`)[0]).toMatchObject({maintenance:false,paused:false});
  expect((await q`select status,stages from app.processing_runs`)[0]).toMatchObject({status:'ready',stages:{reopen:expect.any(Object)}});
  expect(await claimProcessing(q,monday)).toBeNull();
 });
 it('does not override a subsequent administrator change',async()=>{
  const run=(await claimProcessing(q,monday))!;await verified(run.id);
  await q`update app.collection_control set revision=revision+1`;
  await expect(finishProcessing(q,run.id)).rejects.toThrow('operator state changed');
  expect((await q`select maintenance from app.collection_control`)[0]!.maintenance).toBe(true);
 });
 it('preserves manual pauses and independent source blocks after publication',async()=>{
  for(const state of ['paused','blocked']){
   await q`truncate app.processing_runs,app.monitoring_refreshes cascade`;
   await q`update app.collection_control set paused=${state==='paused'},maintenance=false,blocked_reason=${state==='blocked'?'source failure':null}`;
   const run=(await claimProcessing(q,monday))!;await verified(run.id);await finishProcessing(q,run.id);
   expect((await q`select paused,maintenance from app.collection_control`)[0]).toMatchObject({paused:true,maintenance:false});
  }
 });
 it('reports no next run for a disabled schedule',async()=>{
  await q`update app.collection_control set processing_enabled=false`;
  expect(await processingSchedule(q)).toEqual({next_at:null,next_risk_at:null});
 });
});
