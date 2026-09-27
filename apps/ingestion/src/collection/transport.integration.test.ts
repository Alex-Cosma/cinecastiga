import {afterAll,afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {createDb,withCollectionStream} from '@seap/db';
import {listNotices} from '@seap/scraper-clients';
import {getElicitatieClient} from '../scrape/elicitatie/client.js';
import {closeSharedDb} from '../db.js';
const url=process.env['TEST_DATABASE_URL'];
if(url&&(!/^seap_test_/.test(new URL(url).pathname.slice(1))||process.env['DATABASE_URL']!==url))throw Error('Explicit isolated shared database required');
const {sql:q}=createDb(url);
describe.skipIf(!url)('collector wire diagnostics (mock transport, real isolated ledger)',()=>{
 beforeEach(async()=>{await q`truncate app.collection_requests`;await q`insert into app.collection_control(id) values(1) on conflict do nothing`;await q`update app.collection_control set paused=false,maintenance=false,paused_streams='[]',blocked_reason=null,blocked_until=null,next_allowed_at=null,daily_limit=null,min_seconds=1,max_seconds=1`;});
 afterEach(()=>vi.unstubAllGlobals());
 afterAll(async()=>{await closeSharedDb();await q.end();});
 const request=()=>withCollectionStream('tenders',()=>listNotices(getElicitatieClient(),{sysNoticeTypeIds:[2],startPublicationDate:'2026-03-11',endPublicationDate:'2026-03-11',pageIndex:1,pageSize:100}),{taskId:42});
 it('archives failed HTTP body and headers with exact query and task identity, without retry',async()=>{
  const fetch=vi.fn(async()=>new Response('{"message":"maintenance","token":"private"}',{status:503,headers:{'content-type':'application/json','retry-after':'120','set-cookie':'hidden'}}));vi.stubGlobal('fetch',fetch);
  await expect(request()).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);
  const [row]=await q`select * from app.collection_requests`;
  expect(row).toMatchObject({status:503,outcome:'failed',parameters:{pageIndex:1},diagnostics:{context:{taskId:42},response:{body:{message:'maintenance',token:'[redacted]'},complete:true,headers:{'retry-after':'120','set-cookie':'[redacted]'}}}});
  expect(JSON.stringify(row!.diagnostics)).not.toContain('private');
 });
 it('keeps malformed JSON with its HTTP200 status as failed transport diagnostics',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('{broken',{status:200,headers:{'content-type':'application/json'}})));
  await expect(request()).rejects.toThrow();
  const [row]=await q`select * from app.collection_requests`;
  expect(row).toMatchObject({status:200,outcome:'failed',diagnostics:{response:{body:'{broken',complete:true}}});
  const [control]=await q`select blocked_reason from app.collection_control`;expect(control!.blocked_reason).toBeTruthy();
 });
 it('propagates scheduled timeout suspension through the actual HTTP client without a hidden retry',async()=>{
  await q`insert into app.collection_batches(id,end_day) values('wire-retry','2026-09-25') on conflict do nothing`;
  const [t]=await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,status) values('wire-retry','wire-retry','wire-retry','tenders','list','{}','running') on conflict(batch_id,key) do update set status='running' returning id`;
  const fetch=vi.fn(async(_input:unknown,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(Error('wire timeout')),{once:true})));
  vi.stubGlobal('fetch',fetch);
  const original=setTimeout,timer=vi.spyOn(globalThis,'setTimeout').mockImplementation(((fn:any,ms:any,...args:any[])=>original(fn,ms===45000?20:ms,...args)) as typeof setTimeout);
  try{
   await expect(withCollectionStream('tenders',()=>listNotices(getElicitatieClient(),{sysNoticeTypeIds:[2],startPublicationDate:'2026-03-11',endPublicationDate:'2026-03-11',pageIndex:1,pageSize:100}),{taskId:t!.id})).rejects.toMatchObject({name:'CollectionSuspendedError'});
   expect(fetch).toHaveBeenCalledTimes(1);
   expect((await q`select status,timeouts from app.collection_retries where task_id=${t!.id}`)[0]).toMatchObject({status:'pending',timeouts:1});
   expect((await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason).toBeNull();
  }finally{timer.mockRestore();await q`truncate app.collection_retries`;}
 });

});
