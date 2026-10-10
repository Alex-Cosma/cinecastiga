// Dated, owner-authorized single-request recheck. Not a scheduled job.
import {writeFile,readFile} from 'node:fs/promises';
import {getSharedSql,closeSharedDb} from '/app/apps/ingestion/dist/db.js';
import {getElicitatieClient} from '/app/apps/ingestion/dist/scrape/elicitatie/client.js';
import {fetchTask,RECOVERY_LOCK} from '/app/apps/ingestion/dist/collection/runner.js';
import {planResponse} from '/app/apps/ingestion/dist/collection/plan.js';
import {compareNoticeInventory} from '/app/apps/ingestion/dist/collection/inventory.js';
import {archiveDocumentsSql} from '/app/apps/ingestion/dist/scrape/archive.js';
const q=getSharedSql(),lock=await q.reserve();
const block='Sarcina 542533: SEAP a repetat înregistrări între pagini.';
let claimed=false,passed=false;
try{
 const [l]=await lock`select pg_try_advisory_lock(${RECOVERY_LOCK[0]},${RECOVERY_LOCK[1]}) acquired`;
 if(!l.acquired)throw Error('Collector is running');
 const t=await q.begin(async tx=>{
  const [c]=await tx`select * from app.collection_control where id=1 for update`;
  if(c.revision!==109||!c.paused||c.maintenance||c.blocked_reason!==block)throw Error('Control changed');
  const [busy]=await tx`select (select count(*) from app.processing_runs where status='running')+(select count(*) from app.document_jobs where status='running')+(select count(*) from app.collection_requests where outcome='running')+(select count(*) from app.collection_tasks where status='running') n`;
  if(Number(busy.n))throw Error('Active work');
  if((await tx`select id from app.collection_audit where actor_id='ops:inventory-first-page-20261010'`).length)throw Error('Already attempted');
  const [t]=await tx`select * from app.collection_tasks where id=537029 for update`;
  if(t.status!=='complete'||t.params.page!==0||t.params.from!=='2024-11-28')throw Error('Task changed');
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('ops:inventory-first-page-20261010','Reverificare inventar','manual-single-recheck',${JSON.stringify({control:c,task:t})}::jsonb,'{"maxRequests":1,"integrityChecksUnchanged":true}')`;
  await tx`update app.collection_control set paused=false,blocked_reason=null,blocked_until=null,revision=110,updated_at=clock_timestamp() where id=1`;
  await tx`update app.collection_tasks set status='running',started_at=clock_timestamp(),finished_at=null where id=537029`;
  return t;
 });
 claimed=true;
 const response=await fetchTask(getElicitatieClient(),t);
 await writeFile('/reports/first-response.json',JSON.stringify(response),{mode:0o600,flag:'wx'});
 const second=JSON.parse(await readFile('/reports/recheck-response.json','utf8'));
 const [last]=await q`select * from app.collection_tasks where id=542533`;
 const firstPlan=planResponse(t,response,[],'2026-10-09');
 const plan=planResponse(last,second,[firstPlan.result],'2026-10-09');
 if(plan.children.length||plan.result.total!==180||plan.docs.length!==80||firstPlan.docs.length!==100)throw Error('Unexpected partition size');
 await q.begin(async tx=>{
  const [c]=await tx`select revision from app.collection_control where id=1 for update`;
  if(c.revision!==110)throw Error('Operator state changed');
  for(const [target,p,data] of [[t,firstPlan,response],[last,plan,second]]){
   const inventory=await compareNoticeInventory(tx,target,data.items);
   const archive=await archiveDocumentsSql(tx,p.docs);
   await tx`update app.collection_tasks set status='complete',error=null,result=${JSON.stringify({...p.result,inventory,archived:archive.inserted,duplicates:archive.skipped})}::jsonb,finished_at=clock_timestamp() where id=${target.id}`;
  }
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('ops:inventory-first-page-20261010','Reverificare inventar','manual-recheck-passed','{}','{"total":180,"distinct":180,"pages":[100,80]}')`;

 });
 passed=true;
 console.log(JSON.stringify({passed:true,total:180,pageRecords:80}));
}catch(error){
 console.error(error.message);process.exitCode=1;
 if(claimed)await q`update app.collection_tasks set status='complete',finished_at=clock_timestamp() where id=537029 and status='running'`;
}finally{
 if(claimed)await q`update app.collection_control set paused=true,blocked_reason=${passed?null:block},revision=111,updated_at=clock_timestamp() where id=1 and revision=110`;
 await lock`select pg_advisory_unlock(${RECOVERY_LOCK[0]},${RECOVERY_LOCK[1]})`;lock.release();await closeSharedDb();
}
