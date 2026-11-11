import {afterAll,beforeEach,describe,expect,it} from 'vitest';
import {createDb} from '@seap/db';
import {daDetailStatus} from './historical-status';
const url=process.env['TEST_DATABASE_URL'];
if(url&&!/^seap_test_/.test(new URL(url).pathname.slice(1)))throw Error('Isolated test DB required');
const db=url?createDb(url):null;
describe.skipIf(!db)('direct-award lines download status (isolated DB)',()=>{
 const q=db?.sql as NonNullable<typeof db>['sql'];
 beforeEach(async()=>{
  await q`truncate app.collection_tasks,app.collection_batches cascade`;await q`truncate app.da_detail_backfill_days`;
  await q`delete from app.collection_audit where action like 'da-detail-backfill%'`;
  await q`insert into app.collection_batches(id,end_day,next_stream) values('fixture','2026-09-25',0)`;
 });
 afterAll(async()=>{await q?.end();});
 it('is empty before any schedule',async()=>{
  const s=await daDetailStatus(q,'fixture',0);
  expect(s).toMatchObject({pending:0,complete:0,failed:0,lastEnqueue:null,walk:null,lanes:0});expect(s.days).toHaveLength(14);
 });
 it('adds removed tasks to live ones, by day, and keeps other background work out',async()=>{
  const row=(key:string,status:string,ago:string|null,stream='da',kind='da-detail',priority=71,error:string|null=null)=>q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,priority,status,finished_at,error)
   values('fixture',${key},${key},${stream},${kind},'{"page":0,"backfill":true}'::jsonb,${priority},${status},now()-${ago}::interval,${error})`;
  await row('a','complete','10 minutes');await row('b','complete','5 hours');await row('c','pending',null);await row('d','running',null);
  await row('e','failed','1 hour','da','da-detail',71,'Detaliu SEAP indisponibil (HTTP 404); celelalte anunțuri continuă.');
  await row('award','complete','10 minutes','awards','detail',60);await row('ordinary','complete','10 minutes','da','da-detail',3);
  await q`insert into app.da_detail_backfill_days(day,complete) values((now() at time zone 'Europe/Bucharest')::date-2,1000),((now() at time zone 'Europe/Bucharest')::date-40,500)`;
  await q`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:da-detail-backfill','Operator','da-detail-backfill','{}'::jsonb,
   '{"queued":4,"pilot":false,"floor":"2020-01-01","start":"2026-11-10","forwardTo":"2026-11-10","cursor":{"tier":1,"day":"2026-06-14"},"universe":9000,"remaining":7000}'::jsonb)`;
  await q`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:da-detail-backfill','Operator','da-detail-backfill','{}'::jsonb,'{"queued":20,"pilot":true}'::jsonb)`;
  const s=await daDetailStatus(q,'fixture',3);
  expect(s).toMatchObject({pending:1,running:1,complete:1502,failed:1,lastHour:1,lastDay:2,lanes:3,lastEnqueue:{queued:20,auto:false},
   walk:{floor:'2020-01-01',cursor:{tier:1,day:'2026-06-14'},universe:9000,remaining:7000}});
  expect(s.errors).toEqual([{error:'Detaliu SEAP indisponibil (HTTP 404); celelalte anunțuri continuă.',n:1}]);
  expect(s.days.at(-3)!.complete).toBe(1000);expect(s.days.reduce((t,d)=>t+d.complete,0)).toBe(1002);
 });
});
