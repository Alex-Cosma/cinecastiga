import type {DbSql} from '@seap/db';
import {insertTasks} from './runner.js';
import {latestArchivedTedIssue,tedPackageTask} from './ted.js';

/** Explicit, audited operator action; metadata only, no source traffic.
 *
 * Queues the OJ S daily package of the latest issue already archived in raw (derived
 * from efbc:GazetteID, re-downloaded for overlap; unchanged notices are skipped by
 * content hash). Each completed package queues the next issue; the TED tick in
 * advance.ts retries a not-yet-published issue hourly. Pausing the 'ted' stream stops it.
 *
 * Migration from the per-notice XML design: legacy `ted-xml` tasks and day searches not
 * linked to a package (`ted-list` without `ojs`) that are still pending or failed are
 * marked `split` (superseded, previous status/error kept in `result`) in the same
 * transaction, with one `ted-enabled` audit row listing them. They are never fetched. */
export async function enableTedCollection(q:DbSql,now?:Date){
 return q.begin(async tx=>{
  const batches=await tx`select * from app.collection_batches order by created_at for update`;
  if(batches.length!==1||!batches[0]!.follow_latest)throw Error('One continuous recovery batch (follow_latest) is required.');
  const b=batches[0]!;
  if((await tx`select 1 from app.collection_tasks where batch_id=${b.id} and stream='ted' and kind='ted-package' limit 1`).length)return {batchId:b.id,alreadyActive:true,added:0};
  if((await tx`select 1 from app.collection_tasks where batch_id=${b.id} and stream='ted' and status='running' limit 1`).length)throw Error('A TED task is running: stop the collector before enabling the daily packages.');
  const latest=await latestArchivedTedIssue(tx as unknown as DbSql);
  if(!latest)throw Error('No TED eForms award notice with an OJ S issue in raw: seed one window with scrape-ted-bulk before enabling the stream.');
  const superseded=await tx`with legacy as (
    select id,kind,status,error from app.collection_tasks where batch_id=${b.id} and stream='ted' and status in ('pending','failed')
     and (kind='ted-xml' or kind='ted-list' and not (params ? 'ojs')) for update)
   update app.collection_tasks t set status='split',finished_at=coalesce(t.finished_at,clock_timestamp()),
    error='Înlocuită de pachetul zilnic OJ S (migrare ted-enable); nu se mai descarcă.',
    result=coalesce(t.result,'{}'::jsonb)||jsonb_build_object('supersededBy','ted-package','previousStatus',legacy.status,'previousError',legacy.error)
   from legacy where t.id=legacy.id returning t.id,legacy.kind,legacy.status`;
  const ids=superseded.map(r=>r.id);
  if(ids.length)await tx`update app.collection_retries set status='resolved',retry_at=null,updated_at=clock_timestamp() where task_id=any(${ids}::bigint[]) and status in ('pending','stopped')`;
  const counts:Record<string,number>={};for(const r of superseded){const k=`${r.kind}:${r.status}`;counts[k]=(counts[k]??0)+1;}
  const [clock]=await tx`select to_char(coalesce(${now?.toISOString()??null}::timestamptz,clock_timestamp()) at time zone 'Europe/Bucharest','YYYY-MM-DD"T"HH24') attempt`;
  const first=tedPackageTask(String(b.id),latest.ojs,String(clock!.attempt));
  await insertTasks(tx as unknown as DbSql,[first]);
  const [c]=await tx`select paused_streams from app.collection_control where id=1`;
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:ted-activation','Colector','ted-enabled',${JSON.stringify({batchId:b.id,packageTasks:0,legacy:counts})}::jsonb,${JSON.stringify({batchId:b.id,source:'ojs-daily-package',fromIssue:latest.ojs,latestArchivedDay:latest.day,superseded:ids.length,supersededTaskIds:ids.slice(0,1000).map(Number),pausedStreams:c?.paused_streams??[]})}::jsonb)`;
  await tx`update app.collection_batches set status='collecting' where id=${b.id}`;
  return {batchId:b.id,fromIssue:latest.ojs,latestArchivedDay:latest.day,superseded:ids.length,added:1};
 });
}
