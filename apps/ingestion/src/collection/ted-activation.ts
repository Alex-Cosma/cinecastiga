import type {DbSql} from '@seap/db';
import {insertTasks} from './runner.js';
import {latestArchivedTedDay,TED_OVERLAP_DAYS,tedListTask} from './ted.js';

/** Explicit, audited operator action; metadata only, no source traffic. Seeds one
 * TED search per publication day from the latest day already archived in raw
 * (minus the overlap) up to the recovery batch's closed end day. Afterwards the
 * daily scope advance adds each newly closed day. Pausing the 'ted' stream stops it. */
export async function enableTedCollection(q:DbSql){
 return q.begin(async tx=>{
  const batches=await tx`select * from app.collection_batches order by created_at for update`;
  if(batches.length!==1||!batches[0]!.follow_latest)throw Error('One continuous recovery batch (follow_latest) is required.');
  const b=batches[0]!;
  if((await tx`select 1 from app.collection_tasks where batch_id=${b.id} and stream='ted' limit 1`).length)return {batchId:b.id,alreadyActive:true,added:0};
  const latest=await latestArchivedTedDay(tx as unknown as DbSql);
  if(!latest)throw Error('No TED eForms award notice in raw: seed one window with scrape-ted before enabling the stream.');
  const days=await tx`select d::date::text unit_day from generate_series(${latest}::date-${TED_OVERLAP_DAYS-1}::int,${b.end_day}::date,interval '1 day') d`;
  if(!days.length||days.length>400)throw Error(`Inspect the TED scope before enabling it: ${days.length} days from ${latest} to ${b.end_day}.`);
  const scan=String(b.end_day),tasks=days.map(d=>tedListTask(String(b.id),String(d.unit_day),scan));
  await insertTasks(tx as unknown as DbSql,tasks);
  const [c]=await tx`select paused_streams from app.collection_control where id=1`;
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:ted-activation','Colector','ted-enabled',${JSON.stringify({batchId:b.id,tedTasks:0})}::jsonb,${JSON.stringify({batchId:b.id,latestArchivedDay:latest,from:days[0]!.unit_day,to:scan,days:tasks.length,pausedStreams:c?.paused_streams??[]})}::jsonb)`;
  await tx`update app.collection_batches set status='collecting' where id=${b.id}`;
  return {batchId:b.id,latestArchivedDay:latest,from:String(days[0]!.unit_day),to:scan,added:tasks.length};
 });
}
