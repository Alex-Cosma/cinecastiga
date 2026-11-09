import { processingWritable } from "@seap/db";
import {runScheduledContractEvidence} from '../normalize/scheduled-contract-evidence.js';
import {MAX_REVOKED_GROUPS,revalidateApprovedContractIdentities} from '../normalize/revalidate-contract-identities.js';
import {discoverAndApproveContractIdentities} from '../normalize/discover-contract-identities.js';
import {runScheduledIdentityRepair} from '../normalize/scheduled-contract-identity.js';
import { runScheduledMoneyRepair } from '../normalize/scheduled-money-repair.js';
import { diagnosticError, createDb, createSnapshotHashCache, claimProcessing, claimRepairProcessing, claimRecoveryProcessing, claimMethodologyProcessing, failProcessing, finishProcessing, finishShadowProcessing, rollbackShadowSwap, processingStage, collectionHeartbeat, publishShadowCheckpoint, shadowBuildFromEnv, swapShadowSchemas, type PendingCheckpoint } from '@seap/db';
import {runScheduledReferenceRepair} from '../reference/scheduled-repair.js';
import {runAuthorityUatRepair} from '../reference/authority-uat-repair.js';
import {runAuthorityFragmentRepair} from '../reference/authority-fragment-repair.js';
import { runMonitoringRefresh, runShadowRefresh } from '../monitoring/refresh.js';
import { MAX_QUARANTINED_RECORDS } from '../monitoring/pipeline.js';
import {indexTopics} from '../search/index-topics.js';
import { ENTITIES_INDEX, ENTITIES_NEXT_INDEX, indexEntities, meiliClient, swapEntityIndexes } from '../search/index-entities.js';
import {deliverOperationalAlerts,smtpSender} from '../alerts/operational-alerts.js';

async function main() {
 const [command,id,arg]=process.argv.slice(2);
 if(!['claim','claim-repair','claim-recovery','claim-methodology','stage','freeze','refresh','swap','rollback','finish','fail'].includes(command??''))throw Error('Unknown processing command');
 if(!['claim','claim-repair','claim-methodology','rollback'].includes(command!)&&!/^[0-9a-f-]{36}$/.test(id??''))throw Error('A processing run ID is required');
 // The reserved publication session must survive hour-long risk stages.
 const url=new URL(process.env['DATABASE_URL']!);url.searchParams.set('max_lifetime','0');
 const {db,sql}=createDb(url.toString());
 let heartbeat:ReturnType<typeof setInterval>|undefined;
 try {
  if(command==='claim') {
   // The minute scheduler is also the operator alarm: when nothing starts,
   // including an orphan refusal, it mails new incidents to admins.
   let run:Awaited<ReturnType<typeof claimProcessing>>=null;
   // Blue/green (owner, 9 November 2026): PROCESSING_MODE=shadow builds into the shadow schemas with the site open.
   try{run=await claimProcessing(sql,undefined,process.env['PROCESSING_MODE']==='shadow'?'shadow':'in-place');if(run)console.log(run.id);}
   finally{if(!run)await deliverOperationalAlerts(sql,smtpSender(),process.env['ALERT_ORIGIN']||'https://cinecastiga.ro');}
   return;
  }
  if(command==='claim-repair'){const run=await claimRepairProcessing(sql,id!);console.log(run.id);return;}
  if(command==='claim-recovery'){const run=await claimRecoveryProcessing(sql,id!);console.log(run.id);return;}
  if(command==='claim-methodology'){const run=await claimMethodologyProcessing(sql);console.log(run.id);return;}
  if(command==='fail'){await failProcessing(sql,id!);return;}
  if(command==='rollback'){
   // Operator only (process-nightly.sh --rollback): yesterday's schemas back, until the next build drops them.
   if(shadowBuildFromEnv())throw Error('A rollback runs on the live connection');
   const report=await rollbackShadowSwap(sql,async tx=>{
    const [run]=await tx`select id,checkpoint_id,(pending_checkpoint->>'migrationsAtSwap')::int migrations from app.processing_runs
      where status='ready' and mode='shadow' order by completed_at desc limit 1`;
    const [busy]=await tx`select id from app.processing_runs where status='running' limit 1`;
    if(!run||busy)throw Error('A rollback needs the latest shadow publication and no running processing');
    const [applied]=await tx`select count(*)::int n from drizzle.__drizzle_migrations`;
    if(run.migrations!==applied!.n)throw Error('A deploy migrated the schemas after the swap: yesterday\'s schemas no longer match the code');
    // The site reads the newest ready checkpoint: yesterday's is published again, as the newest.
    const [previous]=await tx`select p.* from app.monitoring_refreshes p, app.monitoring_refreshes c where c.id=${run.checkpoint_id}
      and p.status='ready' and p.kind='coordinated' and p.version<c.version order by p.version desc limit 1`;
    if(!previous)throw Error('No earlier ready checkpoint to restore');
    await publishShadowCheckpoint(tx,{kind:'coordinated',methodology:previous.methodology,sourceCoverage:previous.source_coverage,
     validation:{...previous.validation,restoredFrom:String(previous.id),rolledBack:String(run.checkpoint_id)}});
    await tx`update app.processing_runs set error='Publicare retrasă de operator: datele precedente sunt din nou publice.' where id=${run.id}`;
    await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after)
     values('system:processor','Retragere autorizată','processing-rollback',${JSON.stringify({runId:run.id,checkpointId:run.checkpoint_id})}::jsonb,${JSON.stringify({restored:previous.id})}::jsonb)`;
   });
   const status=await swapEntityIndexes(meiliClient());
   console.log(`rollback: ${JSON.stringify(report)}, search ${status}`);
   if(status!=='succeeded')throw Error('Data rolled back; the search index swap did not succeed');
   return;
  }
  if(command==='finish'){await finishProcessing(sql,id!);return;}
  const [r]=await sql`select r.*,c.maintenance,c.paused from app.processing_runs r cross join app.collection_control c where r.id=${id!}::uuid and c.id=1`;
  if(!r||r.status!=='running'||!processingWritable(r))throw Error('Processing requires an active run and maintenance');
  if(command==='stage'){
   if(!['backup','backup-verified','shadow-prepare','restart','reopen'].includes(arg??''))throw Error('Unknown host stage');
   await processingStage(sql,id!,arg!);return;
  }
  if(command==='swap') {
   // The live connection, as seap: the rename, the checkpoint and the run's completion in one transaction.
   if(r.mode!=='shadow'||shadowBuildFromEnv())throw Error('A swap needs a shadow build and the live connection');
   await processingStage(sql,id!,'swap');
   const report=await swapShadowSchemas(sql,async tx=>{
    await finishShadowProcessing(tx,id!,pending=>publishShadowCheckpoint(tx,pending as unknown as PendingCheckpoint));
   },{buildRole:process.env['SEAP_BUILD_ROLE']??'seap_build'});
   console.log(`swap: ${JSON.stringify(report)}`);
   // Search follows the data: the index built from the shadow schemas becomes `entities` (yesterday's becomes entities_next).
   const status=await swapEntityIndexes(meiliClient());
   if(status!=='succeeded')throw Error(`Search index swap ${status}: the data is published, search still serves the previous index`);
   return;
  }
  if(command==='freeze') {
   // A shadow build leaves the document worker running: it writes only app and its files, and reads the live data.
   const [pending]=await sql`select
     (select count(*) from app.collection_requests where outcome='running')+
     (select count(*) from app.collection_tasks where status='running')+
     (select count(*) from app.document_jobs where status='running' and ${r.mode!=='shadow'}) n`;
   if(Number(pending!.n)!==0)throw Error('Workers have not drained completely');
   await sql`update app.processing_runs set raw_boundary=(select coalesce(max(id),0)::text from raw.raw_documents) where id=${id!}::uuid and raw_boundary is null`;
   return;
  }
  if(!r.raw_boundary||r.checkpoint_id||r.pending_checkpoint)throw Error('A frozen, not-yet-processed run is required');
  const shadow=r.mode==='shadow';
  // A shadow build writes only the shadow schemas: every connection rewritten, as the build role (no privilege on the live ones).
  if(shadow!==shadowBuildFromEnv())throw Error('A shadow build runs with SEAP_SHADOW_BUILD=1, an in-place run without it');
  const beat=async()=>{
   await sql`update app.processing_runs set heartbeat_at=clock_timestamp() where id=${id!}::uuid and status='running'`;
   await collectionHeartbeat(sql,`processor:${id}`,'processor','refresh');
  };
  await beat();heartbeat=setInterval(()=>{void beat().catch(()=>{});},10000);
  await runScheduledMoneyRepair(sql,id!,console.log);
  await runScheduledReferenceRepair(sql,id!,console.log);
  await runAuthorityUatRepair(sql,id!,console.log);
  // Full runs only: the merged authorities' signals are recalculated in the same run.
  await runAuthorityFragmentRepair(sql,id!,console.log);
  // Current snapshot hashes of approved identities, computed once and reused by
  // the identity gates of this run while nothing they read changes (source
  // version, migration 0083). In memory only: a new command starts empty.
  const identityHashes=createSnapshotHashCache(`processing:${id}`);
  const refresh={
   repairContractIdentities:async()=>({
    recoveredEvidence:await runScheduledContractEvidence(sql,id!),
    scheduled:await runScheduledIdentityRepair(sql,id!,console.log),
    revalidated:await revalidateApprovedContractIdentities(sql,id!,console.log,MAX_REVOKED_GROUPS,identityHashes),
    discovered:await discoverAndApproveContractIdentities(sql,id!,console.log,identityHashes),
   }),
   scope:r.scope==='full'?'full' as const:'daily' as const,maxRawId:BigInt(r.raw_boundary),maxQuarantined:MAX_QUARANTINED_RECORDS,
   log:console.log,onStage:(stage:string)=>processingStage(sql,id!,stage),identityHashes,
  };
  if(shadow){
   // Validated, not published: the swap publishes it.
   const pending=await runShadowRefresh(db,sql,refresh);
   await sql`update app.processing_runs set pending_checkpoint=${JSON.stringify(pending)}::jsonb where id=${id!}::uuid`;
  }else{
   const checkpoint=await runMonitoringRefresh(db,sql,{...refresh,mode:'coordinated'});
   await sql`update app.processing_runs set checkpoint_id=${checkpoint.id}::uuid where id=${id!}::uuid`;
  }
  console.log(`identity snapshot hashes: ${JSON.stringify(identityHashes.stats)}`);
  await processingStage(sql,id!,'search');
  const since=new Date().toISOString();
  const topics=await indexTopics(sql,console.log);
  // A shadow build fills the next index from the shadow schemas; the live `entities` keeps serving until the swap.
  const indexUid=shadow?ENTITIES_NEXT_INDEX:ENTITIES_INDEX;
  const report=await indexEntities(sql,{log:console.log,indexUid});
  const client=meiliClient(),stats=await client.index(indexUid).getStats();
  const [expected]=await sql`select count(distinct entity_id)::int n from marts.entity_profile`;
  const failures=await client.tasks.getTasks({indexUids:[indexUid],statuses:['failed','canceled'],types:['documentAdditionOrUpdate','documentDeletion','settingsUpdate'],afterEnqueuedAt:since,limit:1});
  if(stats.isIndexing||stats.numberOfDocuments!==expected!.n||failures.results.length)throw Error('Search validation failed');
  await sql`update app.processing_runs set search_verified=${JSON.stringify({...report,topics})}::jsonb where id=${id!}::uuid`;
  await collectionHeartbeat(sql,`processor:${id}`,'processor','complete');
 } finally {clearInterval(heartbeat);await sql.end({timeout:10});}
}
main().catch(error=>{console.error('Processing command failed. Maintenance must remain active; inspect the run, checkpoint and stage log.');console.error(JSON.stringify(diagnosticError(error)));process.exitCode=1;})
 // The command is finished and its connections closed. A lingering handle once
 // kept a failed refresh alive for 20+ minutes, so the host never recorded the
 // failure. The unref'd timer exits only if something else still holds the loop.
 .finally(()=>{setTimeout(()=>{console.error('Processing command exit forced after cleanup timeout');process.exit(process.exitCode??0);},30_000).unref();});
