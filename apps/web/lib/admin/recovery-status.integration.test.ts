import {afterAll,beforeEach,describe,expect,it} from 'vitest';
import {createDb} from '@seap/db';
import {collectionStatus} from './collection';
const url=process.env.TEST_DATABASE_URL;
if(url&&(!['localhost','127.0.0.1'].includes(new URL(url).hostname)||!new URL(url).pathname.startsWith('/seap_test_')))throw Error('Isolated local database required');
const db=url?createDb(url):null;afterAll(async()=>{await db?.sql.end()});
describe.skipIf(!db)('real recovery metadata aggregation',()=>{
 beforeEach(async()=>{const q=db!.sql;await q`truncate app.collection_tasks,app.collection_batches cascade`;await q`insert into app.collection_control(id) values(1) on conflict do nothing`;});
 it('handles no batch without breaking the admin snapshot',async()=>{expect((await collectionStatus(db!.sql)).forecast).toBeNull();});
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
 const data=await collectionStatus(q);expect(data.forecast!.sampled.find(s=>s.stream==='da')).toEqual({stream:'da',sampled:1,units:2});expect(data.forecast!.completed).toBe(6);expect(data.forecast!.failed).toBe(1);expect(data.forecast!.deferred).toBe(1);expect(data.forecast!.state).toBe('gaps');expect(data.forecast!.daysHigh).toBeNull();
 });
});
