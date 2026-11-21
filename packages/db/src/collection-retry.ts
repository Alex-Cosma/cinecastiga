import type { DbSql } from './client.js';

export function collectionTaskId(context: unknown): number | null {
 const raw=(context as {taskId?:unknown}|null)?.taskId;
 const id=typeof raw==='string'&&/^[1-9]\d*$/.test(raw)?Number(raw):raw;
 return typeof id==='number'&&Number.isSafeInteger(id)&&id>0?id:null;
}

/** Caller owns the request and proxy session locks. Timeout scheduling and requeueing are
 * atomic so a restart during the wait cannot reset the budget or orphan the task.
 * Only recovery queries are replayable here; browser document sessions are not.
 * `true` schedules a proxy/5xx failure, 'source' a SEAP "Eroare de sistem" 400 or a redirect to SEAP's
 * error page (exhaustion leaves the task to the caller's isolated failure: no block, no proxy blame).
 */
export async function scheduleCollectionTimeout(q:DbSql,requestId:number,taskId:number|null,kind:boolean|'source'=false):Promise<boolean>{
 if(taskId===null)return false;
 const proxyFailure=kind===true,source=kind==='source';
 await q`begin`;
 try{
  const [c]=await q`select blocked_reason from app.collection_control where id=1 for update`;
  const [t]=await q`select status,stream from app.collection_tasks where id=${taskId} for update`;
  const [r]=await q`select timeouts,status from app.collection_retries where task_id=${taskId}`;
  const [attempt]=await q`select stream,status,proxy_id,diagnostics->>'abortReason' reason,diagnostics->'context'->>'taskId' task from app.collection_requests where id=${requestId} and outcome='failed'`;
  if(!c||c.blocked_reason||!t||t.status!=='running'||t.stream==='documents'||!attempt||(attempt.status!==null&&(Number(attempt.status)<200||Number(attempt.status)>=300)&&!(proxyFailure&&[407,408,500,502,503,504].includes(Number(attempt.status)))&&!(source&&(Number(attempt.status)===400||Number(attempt.status)>=300&&Number(attempt.status)<400)))||attempt.stream!==t.stream||(!proxyFailure&&!source&&attempt.reason!=='request_timeout')||attempt.task!==String(taskId)){
   await q`rollback`;return false;
  }
  const timeouts=Math.min(3,Number(r?.timeouts??0)+1),retryable=(!r||r.status==='pending')&&timeouts<3;
  const delay=timeouts===1?300:600;
  await q`insert into app.collection_retries(task_id,first_request_id,last_request_id,timeouts,status,retry_at)
   values(${taskId},${requestId},${requestId},${timeouts},${retryable?'pending':'stopped'},case when ${retryable} then clock_timestamp()+${delay}*interval '1 second' else null end)
   on conflict(task_id) do update set last_request_id=excluded.last_request_id,timeouts=excluded.timeouts,status=excluded.status,retry_at=excluded.retry_at,updated_at=clock_timestamp()`;
  if(retryable)await q`update app.collection_tasks set status='pending',started_at=null where id=${taskId}`;
  // TED has its own stream stop (the gate pauses 'ted'); never a global SEAP block.
  else if(!source&&!attempt.proxy_id&&t.stream!=='ted')await q`update app.collection_control set blocked_reason='Timeout repetat. Cele două reîncercări automate au fost epuizate. Verifică jurnalul înainte de reluare.',blocked_until=null where id=1`;
  if(!retryable&&!source&&attempt.proxy_id)await q`update app.collection_tasks set status='failed',error='Cerere prin proxy eșuată după trei încercări. Restul colectării continuă.',finished_at=clock_timestamp() where id=${taskId}`;
  const label=source?(Number(attempt.status)===400?'Eroare de sistem SEAP (HTTP 400).':`Eroare internă SEAP (HTTP ${attempt.status}).`):attempt.reason==='request_timeout'?'Timeout după 45 de secunde.':'Conexiune proxy eșuată.';
  await q`update app.collection_requests set diagnostics=diagnostics||${JSON.stringify({retry:{taskId,timeouts,scheduled:retryable,delaySeconds:retryable?delay:null}})}::jsonb,error=${retryable?`${label} Reîncercare automată ${timeouts}/2 după ${delay/60} minute.`:`${label} Limita reîncercărilor automate a fost atinsă.`} where id=${requestId}`;
  await q`commit`;return retryable;
 }catch(error){await q`rollback`.catch(()=>{});throw error;}
}

/**
 * A TED 429 (owner, 21 November 2026): the TED stream is not paused. The same task waits and goes again later:
 * 2, 4, 8, 16, 32 and then 60 minutes after the TED 429s of the last six hours, or TED's own Retry-After when longer. The 5xx retry budget of the task (`timeouts`) is kept as it was (at least 1, the table's
 * floor). Caller owns the request lock; false when the task is not a running TED task (the gate then pauses as before).
 */
export async function scheduleTedRateLimitRetry(q:DbSql,requestId:number,taskId:number|null,retryAfterSeconds:number|null):Promise<number|null>{
 if(taskId===null)return null;
 await q`begin`;
 try{
  const [t]=await q`select status,stream from app.collection_tasks where id=${taskId} for update`;
  if(!t||t.status!=='running'||t.stream!=='ted'){await q`rollback`;return null;}
  const [n]=await q`select count(*)::int n from app.collection_requests where stream='ted' and status=429 and started_at>clock_timestamp()-interval '6 hours'`;
  const delay=Math.max(retryAfterSeconds??0,Math.min(3600,120*2**Math.max(0,Number(n?.n??1)-1)));
  await q`insert into app.collection_retries(task_id,first_request_id,last_request_id,timeouts,status,retry_at)
   values(${taskId},${requestId},${requestId},1,'pending',clock_timestamp()+${delay}*interval '1 second')
   on conflict(task_id) do update set last_request_id=excluded.last_request_id,status='pending',retry_at=excluded.retry_at,updated_at=clock_timestamp()`;
  await q`update app.collection_tasks set status='pending',started_at=null where id=${taskId}`;
  await q`update app.collection_requests set diagnostics=diagnostics||${JSON.stringify({retry:{taskId,rateLimited:true,delaySeconds:delay}})}::jsonb,
   error=${`TED a răspuns cu 429. Reîncercare automată după ${Math.round(delay/60)} minute; fluxul TED continuă.`} where id=${requestId}`;
  await q`commit`;return delay;
 }catch(error){await q`rollback`.catch(()=>{});throw error;}
}
