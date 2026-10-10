// Dated, owner-authorized single-request recheck. Not a scheduled job.
import {writeFile} from 'node:fs/promises';
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
  if(c.revision!==107||!c.paused||c.maintenance||c.blocked_reason!==block)throw Error('Control changed');
  const [busy]=await tx`select (select count(*) from app.processing_runs where status='running')+(select count(*) from app.document_jobs where status='running')+(select count(*) from app.collection_requests where outcome='running')+(select count(*) from app.collection_tasks where status='running') n`;
  if(Number(busy.n))throw Error('Active work');
  if((await tx`select id from app.collection_audit where actor_id='ops:inventory-recheck-20261010'`).length)throw Error('Already attempted');
  const [t]=await tx`select * from app.collection_tasks where id=542533 for update`;
  if(t.status!=='failed'||t.params.page!==1||t.params.from!=='2024-11-28')throw Error('Task changed');
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('ops:inventory-recheck-20261010','Reverificare inventar','manual-single-recheck',${JSON.stringify({control:c,task:t})}::jsonb,'{"maxRequests":1,"integrityChecksUnchanged":true}')`;
  await tx`update app.collection_control set paused=false,blocked_reason=null,blocked_until=null,revision=108,updated_at=clock_timestamp() where id=1`;
  await tx`update app.collection_tasks set status='running',started_at=clock_timestamp(),finished_at=null where id=542533`;
  return t;
 });
 claimed=true;
 const response=await fetchTask(getElicitatieClient(),t);
 await writeFile('/reports/recheck-response.json',JSON.stringify(response),{mode:0o600,flag:'wx'});
 const previous=await q`select result from app.collection_tasks where batch_id=${t.batch_id} and partition=${t.partition} and status='complete' order by (params->>'page')::int`;
 const plan=planResponse(t,response,previous.map(r=>r.result),'2026-10-09');
 if(plan.children.length||plan.result.total!==180||plan.docs.length!==80)throw Error('Unexpected partition size');
 await q.begin(async tx=>{
  const [c]=await tx`select revision from app.collection_control where id=1 for update`;
  if(c.revision!==108)throw Error('Operator state changed');
  const inventory=await compareNoticeInventory(tx,t,response.items);
  const archive=await archiveDocumentsSql(tx,plan.docs);
  await tx`update app.collection_tasks set status='complete',error=null,result=${JSON.stringify({...plan.result,inventory,archived:archive.inserted,duplicates:archive.skipped})}::jsonb,finished_at=clock_timestamp() where id=542533 and status='running'`;
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('ops:inventory-recheck-20261010','Reverificare inventar','manual-recheck-passed','{}',${JSON.stringify({task:542533,total:180,pageRecords:80,archive,inventory})}::jsonb)`;
 });
 passed=true;
 console.log(JSON.stringify({passed:true,total:180,pageRecords:80}));
}catch(error){
 console.error(error.message);process.exitCode=1;
 if(claimed)await q`update app.collection_tasks set status='failed',error=${String(error.message).slice(0,500)},finished_at=clock_timestamp() where id=542533 and status='running'`;
}finally{
 if(claimed)await q`update app.collection_control set paused=true,blocked_reason=${passed?null:block},revision=109,updated_at=clock_timestamp() where id=1 and revision=108`;
 await lock`select pg_advisory_unlock(${RECOVERY_LOCK[0]},${RECOVERY_LOCK[1]})`;lock.release();await closeSharedDb();
}
