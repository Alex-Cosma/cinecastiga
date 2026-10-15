import {afterAll,beforeAll,beforeEach,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {insertTasks,recoveryStep} from './runner.js';
import {task} from './plan.js';
import {DA_STRATEGY} from './da-partition.js';
import {activateNationalDa} from './da-activation.js';
import {advanceRecovery} from './advance.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_/.test(new URL(url).pathname.slice(1)))throw Error('Isolated DB required');
const {sql:q}=createDb(url);afterAll(async()=>{await q.end();});
const day='2026-10-08',params={from:day,to:day,daScan:day,daStrategy:DA_STRATEGY,page:0};
describe.skipIf(!url)('persistent national DA discovery (isolated DB, no source traffic)',()=>{
 beforeAll(async()=>{await q`insert into app.collection_control(id) values(1) on conflict do nothing`;await q`insert into core.cpv_codes(code,name_ro,revision,division) values('33690000-3','Fixture','Rev.2','33') on conflict do nothing`;});
 beforeEach(async()=>{
  await q`truncate app.collection_tasks,app.collection_batches cascade`;await q`truncate app.collection_audit`;
  await q`delete from core.direct_acquisitions where sicap_da_id in (990009001,990009002)`;
  await q`delete from raw.raw_documents where external_id in ('da:990009001','da:990009002')`;
  await q`update app.collection_control set paused=false,maintenance=false,blocked_reason=null,paused_streams='[]',daily_limit=null`;
  await q`insert into app.collection_batches(id,end_day,seed_end_day,follow_latest,next_stream) values('fixture',${day},${day},true,0)`;
 });
 it('persists split children and archives only owned IDs after a worker restart',async()=>{
  await insertTasks(q,[task('fixture','da','da',params)]);
  await recoveryStep(q,async()=>({total:2000,items:[],searchTooLong:true}));
  expect((await q`select count(*)::int n from app.collection_tasks where status='pending'`)[0]!.n).toBe(46);
  expect((await q`select count(*)::int n from raw.raw_documents where external_id='da:990009001'`)[0]!.n).toBe(0);
  await q`update app.collection_tasks set status='complete' where params->>'cpvPrefix'<>'33'`;
  await recoveryStep(q,async()=>({total:1,items:[{directAcquisitionId:990009001,cpvCode:'33690000-3 - Test',finalizationDate:day+'T12:00:00+03:00'}]}));
  expect((await q`select count(*)::int n from raw.raw_documents where external_id='da:990009001'`)[0]!.n).toBe(1);
 });
 it('schedules a disappeared record detail atomically and preserves its reopened source',async()=>{
  await q`insert into core.direct_acquisitions(sicap_da_id,cpv_code,finalization_date) values(990009001,'33690000-3',${day+'T12:00:00+03:00'})`;
  await insertTasks(q,[task('fixture','da','da',{...params,cpvPrefix:'33'})]);
  await recoveryStep(q,async()=>({total:0,items:[]}));
  expect((await q`select params,status from app.collection_tasks where kind='da-detail'`)[0]).toMatchObject({status:'pending',params:{noticeId:990009001}});
  await recoveryStep(q,async()=>({directAcquisitionID:990009001,finalizationDate:null,sysDirectAcquisitionStateID:5}));
  expect((await q`select endpoint_version from raw.raw_documents where external_id='da:990009001'`)[0]!.endpoint_version).toBe('da-detail:v1');
  expect((await q`select finalization_date from core.direct_acquisitions where sicap_da_id=990009001`)[0]!.finalization_date).not.toBeNull(); // normalization remains nightly
 });
 it('stops on a genuine unexplained omission instead of silently deleting it',async()=>{
  await insertTasks(q,[task('fixture','da','da-detail',{...params,cpvPrefix:'33',noticeId:990009001})]);
  await recoveryStep(q,async()=>({directAcquisitionID:990009001,cpvCode:{text:'Label',localeKey:'33690000-3'},finalizationDate:day+'T12:00:00+03:00',sysDirectAcquisitionStateID:7}));
  expect((await q`select status from app.collection_tasks`)[0]!.status).toBe('failed');
  expect((await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason).toContain('omite');
 });
 it('requires pause/drain, replaces untouched work only and is idempotent',async()=>{
  await insertTasks(q,[task('fixture','da','da',{from:day,to:day,authorityId:77,page:0}),task('fixture','da','da',{from:day,to:day,authorityId:78,page:0})]);
  const [retry]=await q`select id from app.collection_tasks where params->>'authorityId'='78'`;
  await q`insert into app.collection_retries(task_id,first_request_id,last_request_id,timeouts,status,retry_at) values(${retry!.id},1,2,1,'pending',now()+interval '5 minutes')`;
  await expect(activateNationalDa(q)).rejects.toThrow('Pause');await q`update app.collection_control set paused=true`;
  const result=await activateNationalDa(q);expect(result).toMatchObject({added:7,superseded:1,strategy:DA_STRATEGY});
  expect((await q`select status from app.collection_tasks where id=${retry!.id}`)[0]!.status).toBe('pending');
  expect((await q`select timeouts from app.collection_retries`)[0]!.timeouts).toBe(1);
  const [audit]=await q`select before from app.collection_audit where action='da-national-activation'`;
  expect(audit!.before).toMatchObject({pendingTasks:1});expect(audit!.before.tasks).toBeUndefined();
  expect(await activateNationalDa(q)).toMatchObject({alreadyActive:true,added:0});
  expect((await q`select paused from app.collection_control`)[0]!.paused).toBe(true);
 });
 it('extends the day horizon with a trailing week, without 38000 new authorities',async()=>{
  await q`update app.collection_batches set da_strategy=${DA_STRATEGY}`;
  await advanceRecovery(q,{now:new Date('2026-10-10T08:00:00Z')});
  const da=await q`select params from app.collection_tasks where kind='da'`;
  expect(da).toHaveLength(7);expect(da.every(t=>t.params.daStrategy===DA_STRATEGY&&t.params.daScan==='2026-10-09'&&!t.params.authorityId)).toBe(true);
  expect(await advanceRecovery(q,{now:new Date('2026-10-10T08:00:00Z')})).toMatchObject({added:0});
 });
 it('ordinary authority catalogue refresh no longer recreates legacy work',async()=>{
  await q`update app.collection_batches set da_strategy=${DA_STRATEGY}`;
  await insertTasks(q,[task('fixture','catalogue','catalogue',{page:0})]);
  await recoveryStep(q,async()=>({total:1,items:[{id:77}]}));
  expect(await q`select id from app.collection_tasks where kind='da'`).toHaveLength(0);
 });
});
