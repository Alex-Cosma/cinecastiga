// Single-use recovery of task 256792 after deploying the winner-order fix.
// Default: read-only rehearsal. --apply: transactionally accept the saved page,
// enqueue its successor and clear only the inspected block. No SEAP HTTP calls.
import {createDb,diagnosticError} from '/app/packages/db/dist/index.js';
import {planResponse} from '/app/apps/ingestion/dist/collection/plan.js';
import {insertTasks} from '/app/apps/ingestion/dist/collection/runner.js';
const {sql}=createDb();
const actor='ops:winner-order-20261007';
const block='Sarcina 256792: SEAP a modificat un contract între pagini; necesită reverificare.';
try{
 const report=await sql.begin(async q=>{
  const [control]=await q`select * from app.collection_control where id=1 for update`;
  if(control.revision!==91||control.maintenance||control.paused||control.blocked_reason!==block)throw Error('Operator state changed');
  if((await q`select id from app.collection_audit where actor_id=${actor}`).length)throw Error('Recovery already applied');
  const [busy]=await q`select (select count(*) from app.collection_requests where outcome='running')+(select count(*) from app.collection_tasks where status='running')+(select count(*) from app.processing_runs where status='running') n`;
  if(Number(busy.n))throw Error('Work is not drained');
  const rows=await q`select * from app.collection_tasks where partition='awards:contracts:100648909::' order by (params->>'page')::int for update`;
  if(rows.length!==3||Number(rows[0].id)!==256373||Number(rows[1].id)!==256790||Number(rows[2].id)!==256792||rows.slice(0,2).some(r=>r.status!=='complete')||rows[2].status!=='failed')throw Error('Page history changed');
  const failed=rows[2];
  const [request]=await q`select * from app.collection_requests where id=55309`;
  if(request?.status!==200||request.outcome!=='success'||!request.diagnostics.response.complete||request.diagnostics.response.sha256!=='941bdcecdc89ab1dcc197ecf12bfbce5ad6fed3f668d91d370871461fa5e638c'||Number(request.diagnostics.taskFailure.taskId)!==Number(failed.id))throw Error('Saved response evidence changed');
  const response=request.diagnostics.taskFailure.response;
  const plan=planResponse(failed,response,rows.slice(0,2).map(r=>r.result),'2026-10-06');
  if(plan.docs.length||plan.status!=='complete'||plan.children.length!==1||plan.children[0].params.page!==3||plan.result.total!==1041||plan.result.ids.length!==200)throw Error('Unexpected replay plan');
  const summary={taskId:failed.id,requestId:request.id,noticeId:100648909,total:1041,completedPage:2,nextPage:3,sourceRequests:0};
  if(!process.argv.includes('--apply'))return {...summary,applied:false};
  await insertTasks(q,plan.children);
  await q`update app.collection_tasks set status='complete',result=${JSON.stringify({...plan.result,archived:0,duplicates:0,recoveredFromRequest:55309})}::jsonb,error=null,finished_at=clock_timestamp() where id=${failed.id}`;
  await q`update app.collection_control set blocked_reason=null,blocked_until=null,revision=revision+1,updated_at=clock_timestamp() where id=1`;
  await q`insert into app.collection_audit(actor_id,actor_name,action,before,after) values(${actor},'Recuperare paginare verificată','retry-task',${JSON.stringify({revision:control.revision,blockedReason:control.blocked_reason,taskStatus:failed.status,taskError:failed.error})}::jsonb,${JSON.stringify({...summary,revision:92,taskStatus:'complete'})}::jsonb)`;
  return {...summary,applied:true,revision:92};
 });
 console.log(JSON.stringify(report));
}catch(e){console.error(JSON.stringify(diagnosticError(e)));process.exitCode=1;}finally{await sql.end({timeout:10});}
