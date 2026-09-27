import {afterAll,beforeEach,describe,it,expect} from 'vitest';
import {createDb,runCollectionRequest,type DbSql} from '@seap/db';
import {insertTasks,recoveryStep} from './runner.js';
import {task} from './plan.js';
const url=process.env['TEST_DATABASE_URL'];
if(url&&new URL(url).pathname!=='/seap_test_collection_migration')throw Error('Dedicated schema-change fixture required');
describe.skipIf(!url)('additive migration with an existing prepared worker session',()=>{
 const single=url?new URL(url):undefined;single?.searchParams.set('max','1');
 const {sql:q}=createDb(single?.toString()),{sql:ddl}=createDb(url);
 beforeEach(async()=>{
  await q`truncate app.collection_tasks,app.collection_batches,app.collection_requests cascade`;
  await q`insert into app.collection_control(id) values(1) on conflict do nothing`;
  await q`update app.collection_control set paused=false,maintenance=false,blocked_reason=null,blocked_until=null,paused_streams='[]',daily_limit=null,next_allowed_at=null,min_seconds=1,max_seconds=1`;
 });
 afterAll(async()=>{await ddl`alter table app.collection_control drop column if exists fixture_added_setting`;await q.end({timeout:5});await ddl.end({timeout:5});});
 it('continues claiming tasks after a new control column is added',async()=>{
  await q`insert into app.collection_batches(id,end_day,next_stream) values('schema-fixture','2026-09-25',0)`;
  await insertTasks(q,[7848,7849].map(authorityId=>task('schema-fixture','da','da',{authorityId,from:'2026-07-01',to:'2026-09-25',page:0})));
  const fetcher=async()=>({total:0,items:[]});
  expect(await recoveryStep(q,fetcher)).toBe(true);
  await ddl`alter table app.collection_control add column fixture_added_setting boolean default false`;
  try{expect(await recoveryStep(q,fetcher)).toBe(true);expect((await q`select count(*)::int n from app.collection_tasks where status='complete'`)[0]?.n).toBe(2);}
  finally{await ddl`alter table app.collection_control drop column fixture_added_setting`;}
 });
 it('keeps the reserved admission query valid and archives both simulated responses',async()=>{
  const reserved=await q.reserve();
  const request=()=>runCollectionRequest(reserved as unknown as DbSql,{stream:'tenders',worker:'schema-fixture',method:'POST',url:'https://www.e-licitatie.ro/api-pub/NoticeCommon/GetCNoticeList/'},async()=>({value:true,status:200}));
  try{
   expect(await request()).toBe(true);
   await ddl`alter table app.collection_control add column fixture_added_setting boolean default false`;
   try{expect(await request()).toBe(true);}
   finally{await ddl`alter table app.collection_control drop column fixture_added_setting`;}
  }finally{reserved.release();}
  expect((await q`select count(*)::int n from app.collection_requests where outcome='success'`)[0]?.n).toBe(2);
  expect((await q`select blocked_reason from app.collection_control`)[0]?.blocked_reason).toBeNull();
 });
});
