import type { DbSql } from './client.js';

export function collectionTaskId(context: unknown): number | null {
 const raw=(context as {taskId?:unknown}|null)?.taskId;
 const id=typeof raw==='string'&&/^[1-9]\d*$/.test(raw)?Number(raw):raw;
 return typeof id==='number'&&Number.isSafeInteger(id)&&id>0?id:null;
}

/** Caller holds the global source lock. Timeout scheduling and requeueing are
 * atomic so a restart during the wait cannot reset the budget or orphan the task.
 * Only recovery queries are replayable here; browser document sessions are not.
 */
export async function scheduleCollectionTimeout(q:DbSql,requestId:number,taskId:number|null,proxyFailure=false):Promise<boolean>{
 if(taskId===null)return false;
 await q`begin`;
 try{
  const [c]=await q`select blocked_reason from app.collection_control where id=1 for update`;
  const [t]=await q`select status,stream from app.collection_tasks where id=${taskId} for update`;
  const [r]=await q`select timeouts,status from app.collection_retries where task_id=${taskId}`;
  const [attempt]=await q`select stream,status,proxy_id,diagnostics->>'abortReason' reason,diagnostics->'context'->>'taskId' task from app.collection_requests where id=${requestId} and outcome='failed'`;
  if(!c||c.blocked_reason||!t||t.status!=='running'||t.stream==='documents'||!attempt||(attempt.status!==null&&(Number(attempt.status)<200||Number(attempt.status)>=300)&&!(proxyFailure&&[407,408,500,502,503,504].includes(Number(attempt.status))))||attempt.stream!==t.stream||(!proxyFailure&&attempt.reason!=='request_timeout')||attempt.task!==String(taskId)){
   await q`rollback`;return false;
  }
  const timeouts=Math.min(3,Number(r?.timeouts??0)+1),retryable=(!r||r.status==='pending')&&timeouts<3;
  const delay=timeouts===1?300:600;
  await q`insert into app.collection_retries(task_id,first_request_id,last_request_id,timeouts,status,retry_at)
   values(${taskId},${requestId},${requestId},${timeouts},${retryable?'pending':'stopped'},case when ${retryable} then clock_timestamp()+${delay}*interval '1 second' else null end)
   on conflict(task_id) do update set last_request_id=excluded.last_request_id,timeouts=excluded.timeouts,status=excluded.status,retry_at=excluded.retry_at,updated_at=clock_timestamp()`;
  if(retryable)await q`update app.collection_tasks set status='pending',started_at=null where id=${taskId}`;
  else if(!attempt.proxy_id)await q`update app.collection_control set blocked_reason='Timeout repetat. Cele două reîncercări automate au fost epuizate. Verifică jurnalul înainte de reluare.',blocked_until=null where id=1`;
  if(!retryable&&attempt.proxy_id)await q`update app.collection_tasks set status='failed',error='Cerere prin proxy eșuată după trei încercări. Restul colectării continuă.',finished_at=clock_timestamp() where id=${taskId}`;
  const label=attempt.reason==='request_timeout'?'Timeout după 45 de secunde.':'Conexiune proxy eșuată.';
  await q`update app.collection_requests set diagnostics=diagnostics||${JSON.stringify({retry:{taskId,timeouts,scheduled:retryable,delaySeconds:retryable?delay:null}})}::jsonb,error=${retryable?`${label} Reîncercare automată ${timeouts}/2 după ${delay/60} minute.`:`${label} Limita reîncercărilor automate a fost atinsă.`} where id=${requestId}`;
  await q`commit`;return retryable;
 }catch(error){await q`rollback`.catch(()=>{});throw error;}
}
