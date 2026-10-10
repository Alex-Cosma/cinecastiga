import {afterAll,beforeEach,describe,expect,it} from 'vitest';
import {createDb} from '@seap/db';
import {collectionStatus} from './collection';
const url=process.env.TEST_DATABASE_URL;
if(url&&(!['localhost','127.0.0.1'].includes(new URL(url).hostname)||!new URL(url).pathname.startsWith('/seap_test_')))throw Error('Isolated local database required');
const db=url?createDb(url):null;afterAll(async()=>{await db?.sql.end()});
describe.skipIf(!db)('real recovery metadata aggregation',()=>{
 beforeEach(async()=>{const q=db!.sql;await q`truncate app.collection_tasks,app.collection_batches cascade`;await q`insert into app.collection_control(id) values(1) on conflict do nothing`;await q`insert into app.collection_proxy_control(id) values(1) on conflict do nothing`;});
 it('handles no batch without breaking the admin snapshot',async()=>{expect((await collectionStatus(db!.sql)).forecast).toBeNull();});
 it('accepts list-only inventory alongside full recovery without inflating it into detail work',async()=>{
  const q=db!.sql;
  await q`insert into app.collection_batches(id,end_day) values('inventory','2026-10-08')`;
  await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,status,params,result)
   values('inventory','historical','historical','tenders','list','complete','{"from":"2020-01-01","page":0,"inventoryOnly":true}','{"total":100}')`;
  const data=await collectionStatus(q);
  expect(data.forecast!.sampled.find(s=>s.stream==='tenders')).toEqual({stream:'tenders',sampled:1,units:1});
  expect(data.forecast!.layers).toEqual([]);
 });
 it('counts closed split authorities once and excludes failed/deferred work',async()=>{const q=db!.sql;await q`insert into app.collection_batches(id,end_day,created_at) values('fixture','2026-09-25',now()-interval '2 days')`;
 for(const [key,stream,kind,status,params,result] of [
 ['cat','catalogue','catalogue','complete',{page:0},{total:1}],
 ['root','da','da','split',{authorityId:7,page:0},{total:3000}],
 ['child1','da','da','complete',{authorityId:7,page:0},{total:1000}],
 ['child2','da','da','pending',{authorityId:7,page:0},null],
 ['tda','da','da','complete',{authorityId:8,page:0},{total:0}],
 ['t1','tenders','list','complete',{from:'2026-01-01',page:0},{total:3}],
 ['a1','awards','list','complete',{from:'2026-01-01',page:0},{total:2}],
 ['detail','awards','detail','deferred',{noticeId:1,page:0},null],
 ['contracts','awards','contracts','failed',{noticeId:1,page:0},null]
 ] as const)await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,status,params,result,finished_at) values('fixture',${key},${key},${stream},${kind},${status},${JSON.stringify(params)}::jsonb,${JSON.stringify(result)}::jsonb,now())`;
 const data=await collectionStatus(q);expect(data.forecast!.sampled.find(s=>s.stream==='da')).toEqual({stream:'da',sampled:1,units:2});expect(data.forecast!.completed).toBe(6);expect(data.forecast!.failed).toBe(1);expect(data.forecast!.deferred).toBe(1);expect(data.forecast!.state).toBe('gaps');expect(data.forecast!.minutesHigh).toBeNull();
 });
 it('counts CPV leaves and detail verification within each day and scan',async()=>{
  const q=db!.sql;await q`insert into app.collection_batches(id,end_day) values('national','2026-10-09')`;
  for(const [key,day,status] of [['one','2026-10-08','split'],['one-a','2026-10-08','complete'],['one-b','2026-10-08','complete'],['two','2026-10-09','pending']] as const){
   await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,status,params) values('national',${key},${key},'da','da',${status},${JSON.stringify({from:day,daScan:'2026-10-09',daStrategy:'cpv-day-v1',page:0})}::jsonb)`;
  }
  const data=await collectionStatus(q);expect(data.forecast!.sampled.find(s=>s.stream==='da')).toEqual({stream:'da',sampled:1,units:2});
 });
 it.each(['proxies','processing-complete','processing-failed','resume-archive-during-maintenance','notice-details-activation','da-national-activation'])('uses only completions since %s in its ten-minute window',async action=>{
  const q=db!.sql;await q`truncate app.collection_audit`;await q`update app.collection_proxy_control set enabled=false`;
  await q`update app.collection_control set min_seconds=1,max_seconds=1,daily_limit=null`;
  await q`insert into app.collection_batches(id,end_day,created_at) values('pace','2026-10-05',now()-interval '2 days')`;
  await q`insert into app.collection_audit(actor_id,actor_name,action,before,after,created_at) values('fixture','Fixture',${action},'{}','{}',now()-interval '3 minutes')`;
  await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,status,params,finished_at)
    select 'pace',i::text,i::text,'da','da','complete',jsonb_build_object('authorityId',i,'page',0),case when i<=90 then now()-interval '1 minute' else now()-interval '5 minutes' end from generate_series(1,190)i`;
  await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,status,params) values('pace','pending','pending','da','da','pending','{}')`;
  const data=await collectionStatus(q);expect(data.forecast!.rate!/1440).toBeGreaterThan(29);expect(data.forecast!.rate!/1440).toBeLessThan(31);
  expect(data.forecast!.etaBasis).toBe('known');expect(data.forecast!.minutesHigh).toBeGreaterThan(0);
 });

});
