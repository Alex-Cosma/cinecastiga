import {createHash} from 'node:crypto';
import type {DbSql} from '@seap/db';
import {task,CONTRACTS_AUDIT_TAG,CONTRACTS_AUDIT_VERSION,BACKGROUND_PRIORITY,type Task} from './plan.js';
/** Background tier, same as the award detail backfill: claimed only by enabled background lanes. */
export const CONTRACTS_AUDIT_PRIORITY=BACKGROUND_PRIORITY+10;
export const CONTRACTS_AUDIT_MAX=20000;
/** Advertised by a collector whose planner archives tagged contract pages under CONTRACTS_AUDIT_VERSION.
 * An older collector would archive them as award-contracts:v1 and normalize them; the enqueue refuses. */
export const CONTRACTS_AUDIT_CAPABILITY='contracts-audit:v1';
const COLLECTOR_CAPABILITIES=[CONTRACTS_AUDIT_CAPABILITY];
/** A collector lane heartbeats at least every few seconds, also while paused, blocked or in the quiet window. */
const COLLECTOR_ALIVE='2 minutes';
export function validateAuditTag(tag:unknown):string{
 if(typeof tag!=='string'||!CONTRACTS_AUDIT_TAG.test(tag))throw Error('--tag must match ^[a-z0-9-]{1,40}$');
 return tag;
}
/** Public caNoticeId integers, whitespace/comma separated. Positive safe integers only; duplicates collapse; sorted. */
export function parseAuditNoticeIds(text:string):number[]{
 const tokens=text.split(/[\s,]+/).filter(Boolean);
 const bad=tokens.find(x=>!/^[1-9][0-9]{0,15}$/.test(x)||!Number.isSafeInteger(Number(x)));
 if(bad!==undefined)throw Error(`Invalid caNoticeId: ${JSON.stringify(bad.slice(0,40))}`);
 const ids=[...new Set(tokens.map(Number))].sort((a,b)=>a-b);
 if(!ids.length)throw Error('No caNoticeId on stdin.');
 if(ids.length>CONTRACTS_AUDIT_MAX)throw Error(`At most ${CONTRACTS_AUDIT_MAX} notices per audit (got ${ids.length}).`);
 return ids;
}
export type ContractsAuditCommand={action:'enqueue'|'cancel';tag:string}|{action:'capability'};
export function parseContractsAuditArgs(args:string[]):ContractsAuditCommand{
 const usage='Usage: collection contracts-audit --tag=<tag> < ids | contracts-audit --cancel --tag=<tag> | contracts-audit --capability';
 if(args.length===1&&args[0]==='--capability')return {action:'capability'};
 const tags=args.filter(a=>a.startsWith('--tag='));
 if(tags.length!==1||args.some(a=>!a.startsWith('--tag=')&&a!=='--cancel')||args.filter(a=>a==='--cancel').length>1)throw Error(usage);
 return {action:args.includes('--cancel')?'cancel':'enqueue',tag:validateAuditTag(tags[0]!.slice('--tag='.length))};
}
export const auditTask=(batchId:string,noticeId:number,tag:string):Task=>task(batchId,'awards','contracts',{noticeId,page:0,audit:tag},CONTRACTS_AUDIT_PRIORITY);
/** Called once per collector process, after it holds the recovery lock. `worker` prefixes its lane heartbeats. */
export async function advertiseCollectorCapabilities(q:DbSql,worker:string){
 await q`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:collector','Colector','collector-capabilities','{}'::jsonb,${JSON.stringify({worker,capabilities:COLLECTOR_CAPABILITIES})}::jsonb)`;
}
/** The live collector (fresh lane heartbeat) is the one that last advertised, and it advertised the audit planner. */
export async function collectorCapability(q:DbSql){
 const [last]=await q`select after,created_at from app.collection_audit where action='collector-capabilities' order by id desc limit 1`;
 const after=(last?.after??{}) as {worker?:string;capabilities?:string[]};
 const worker=typeof after.worker==='string'?after.worker:null;
 const [alive]=worker?await q`select count(*)::int n,max(heartbeat_at) heartbeat_at from app.collection_workers where starts_with(id,${worker+':'}) and heartbeat_at>clock_timestamp()-${COLLECTOR_ALIVE}::interval`:[];
 return {worker,capabilities:after.capabilities??[],advertisedAt:last?.created_at??null,alive:Number(alive?.n??0)>0,lastHeartbeat:alive?.heartbeat_at??null,
  ready:Number(alive?.n??0)>0&&!!after.capabilities?.includes(CONTRACTS_AUDIT_CAPABILITY)};
}
/** Metadata only, no source traffic. Queues one fetch-only contracts task per notice in the background tier.
 * The pages are archived as CONTRACTS_AUDIT_VERSION and never normalized. Idempotent per (tag, notice). */
export async function enqueueContractsAudit(q:DbSql,{tag,ids,actor='operator'}:{tag:string;ids:number[];actor?:string}){
 validateAuditTag(tag);
 if(!ids.length||ids.length>CONTRACTS_AUDIT_MAX||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw Error(`Between 1 and ${CONTRACTS_AUDIT_MAX} positive notice IDs are required.`);
 const sorted=[...new Set(ids)].sort((a,b)=>a-b);
 if(sorted.length!==ids.length)throw Error('Notice IDs must be distinct.');
 const capability=await collectorCapability(q);
 if(!capability.ready)throw Error(`The running collector does not advertise ${CONTRACTS_AUDIT_CAPABILITY} (${capability.alive?'live collector without the capability':'no live collector that advertised capabilities'}). Deploy and restart the collector first; nothing was queued.`);
 const sha256=createHash('sha256').update(sorted.join('\n')).digest('hex');
 return q.begin(async tx=>{
  await tx`set local lock_timeout='10s'`;
  const batches=await tx`select id,status from app.collection_batches order by created_at`;
  if(batches.length!==1||batches[0]!.status!=='collecting')throw Error('Exactly one collecting recovery batch is required.');
  if((await tx`select id from app.processing_runs where status='running' limit 1`).length)throw Error('A processing run is running; enqueue after it finishes.');
  const batchId=String(batches[0]!.id);
  // Never strand tasks in a batch that just closed; claims wait on this lock only for the inserts.
  await tx`select id from app.collection_batches where id=${batchId} for update`;
  const [control]=await tx`select revision,background_lanes from app.collection_control where id=1`;
  const tasks=sorted.map(id=>auditTask(batchId,id,tag));
  let queued=0;
  for(let i=0;i<tasks.length;i+=1000){
   const added=await tx`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,priority)
    select batch_id,key,partition,stream,kind,params,priority from jsonb_to_recordset(${JSON.stringify(tasks.slice(i,i+1000))}::jsonb) as x(batch_id text,key text,partition text,stream text,kind text,params jsonb,priority int)
    on conflict(batch_id,key) do nothing returning key`;
   queued+=added.length;
  }
  const result={batchId,tag,notices:sorted.length,queued,alreadyQueued:sorted.length-queued,sha256,endpointVersion:CONTRACTS_AUDIT_VERSION,normalized:false,priority:CONTRACTS_AUDIT_PRIORITY};
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:contracts-audit',${`Operator — verificare contracte (${actor})`.slice(0,150)},'contracts-audit',
   ${JSON.stringify({batchId,revision:control?.revision,backgroundLanes:control?.background_lanes,collector:capability.worker})}::jsonb,${JSON.stringify({...result,actor})}::jsonb)`;
  return result;
 });
}
/** Metadata only. Pending tasks of the tag stop as `split` (superseded, not a recovery gap). Running ones finish. */
export async function cancelContractsAudit(q:DbSql,{tag,actor='operator'}:{tag:string;actor?:string}){
 validateAuditTag(tag);
 return q.begin(async tx=>{
  const cancelled=await tx`update app.collection_tasks set status='split',finished_at=clock_timestamp(),error=${`Verificare contracte anulată de operator (${tag}).`}
   where stream='awards' and kind='contracts' and status='pending' and params->>'audit'=${tag} returning id::text`;
  const ids=cancelled.map(r=>String(r.id));
  if(ids.length)await tx`update app.collection_retries set status='stopped',retry_at=null,updated_at=clock_timestamp() where task_id=any(${ids}::bigint[]) and status='pending'`;
  const [left]=await tx`select count(*) filter(where status='running')::int running,count(*) filter(where status='complete')::int complete,count(*) filter(where status='failed')::int failed
   from app.collection_tasks where stream='awards' and kind='contracts' and params->>'audit'=${tag}`;
  const result={tag,cancelled:ids.length,running:Number(left?.running??0),complete:Number(left?.complete??0),failed:Number(left?.failed??0)};
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:contracts-audit',${`Operator — verificare contracte (${actor})`.slice(0,150)},'contracts-audit-cancel','{}'::jsonb,${JSON.stringify({...result,actor})}::jsonb)`;
  return result;
 });
}
