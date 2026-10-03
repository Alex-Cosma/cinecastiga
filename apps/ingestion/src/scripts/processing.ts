import {runScheduledIdentityRepair} from '../normalize/scheduled-contract-identity.js';
import { runScheduledMoneyRepair } from '../normalize/scheduled-money-repair.js';
import { createDb, claimProcessing, failProcessing, finishProcessing, processingStage, collectionHeartbeat } from '@seap/db';
import { runMonitoringRefresh } from '../monitoring/refresh.js';
import {indexTopics} from '../search/index-topics.js';
import { indexEntities, meiliClient } from '../search/index-entities.js';

async function main() {
 const [command,id,arg]=process.argv.slice(2);
 if(!['claim','stage','freeze','refresh','finish','fail'].includes(command??''))throw Error('Unknown processing command');
 if(command!=='claim'&&!/^[0-9a-f-]{36}$/.test(id??''))throw Error('A processing run ID is required');
 // The reserved publication session must survive hour-long risk stages.
 const url=new URL(process.env['DATABASE_URL']!);url.searchParams.set('max_lifetime','0');
 const {db,sql}=createDb(url.toString());
 let heartbeat:ReturnType<typeof setInterval>|undefined;
 try {
  if(command==='claim') {const run=await claimProcessing(sql);if(run)console.log(run.id);return;}
  if(command==='fail'){await failProcessing(sql,id!);return;}
  if(command==='finish'){await finishProcessing(sql,id!);return;}
  const [r]=await sql`select r.*,c.maintenance,c.paused from app.processing_runs r cross join app.collection_control c where r.id=${id!}::uuid and c.id=1`;
  if(!r||r.status!=='running'||!r.maintenance||!r.paused)throw Error('Processing requires an active run and maintenance');
  if(command==='stage'){
   if(!['backup','backup-verified','restart','reopen'].includes(arg??''))throw Error('Unknown host stage');
   await processingStage(sql,id!,arg!);return;
  }
  if(command==='freeze') {
   const [pending]=await sql`select
     (select count(*) from app.collection_requests where outcome='running')+
     (select count(*) from app.collection_tasks where status='running')+
     (select count(*) from app.document_jobs where status='running') n`;
   if(Number(pending!.n)!==0)throw Error('Workers have not drained completely');
   await sql`update app.processing_runs set raw_boundary=(select coalesce(max(id),0)::text from raw.raw_documents) where id=${id!}::uuid and raw_boundary is null`;
   return;
  }
  if(!r.raw_boundary||r.checkpoint_id)throw Error('A frozen, not-yet-processed run is required');
  const beat=async()=>{
   await sql`update app.processing_runs set heartbeat_at=clock_timestamp() where id=${id!}::uuid and status='running'`;
   await collectionHeartbeat(sql,`processor:${id}`,'processor','refresh');
  };
  await beat();heartbeat=setInterval(()=>{void beat().catch(()=>{});},10000);
  await runScheduledMoneyRepair(sql,id!,console.log);
  const checkpoint=await runMonitoringRefresh(db,sql,{
   repairContractIdentities:()=>runScheduledIdentityRepair(sql,id!,console.log),
   mode:'coordinated',scope:r.scope==='full'?'full':'daily',maxRawId:BigInt(r.raw_boundary),
   log:console.log,onStage:stage=>processingStage(sql,id!,stage),
  });
  await sql`update app.processing_runs set checkpoint_id=${checkpoint.id}::uuid where id=${id!}::uuid`;
  await processingStage(sql,id!,'search');
  const since=new Date().toISOString();
  const topics=await indexTopics(sql,console.log);
  const report=await indexEntities(sql,{log:console.log});
  const client=meiliClient(),stats=await client.index('entities').getStats();
  const [expected]=await sql`select count(distinct entity_id)::int n from marts.entity_profile`;
  const failures=await client.tasks.getTasks({indexUids:['entities'],statuses:['failed','canceled'],types:['documentAdditionOrUpdate','documentDeletion','settingsUpdate'],afterEnqueuedAt:since,limit:1});
  if(stats.isIndexing||stats.numberOfDocuments!==expected!.n||failures.results.length)throw Error('Search validation failed');
  await sql`update app.processing_runs set search_verified=${JSON.stringify({...report,topics})}::jsonb where id=${id!}::uuid`;
  await collectionHeartbeat(sql,`processor:${id}`,'processor','complete');
 } finally {clearInterval(heartbeat);await sql.end({timeout:10});}
}
main().catch(()=>{console.error('Processing command failed. Maintenance must remain active; inspect the run, checkpoint and stage log.');process.exitCode=1;});
