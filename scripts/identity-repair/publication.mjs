/** Dated, one-off publication. Never scheduled and never called by ordinary deploys. */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createDb,collectionHeartbeat,withMonitoringWrite,diagnosticError} from '@seap/db';
import {runMonitoringRefresh} from '../monitoring/refresh.js';
import {indexTopics} from '../search/index-topics.js';
import {indexEntities,meiliClient} from '../search/index-entities.js';
import {validateIdentityRepair} from './validate-repair.mjs';
import {pending,control,claim} from './publication-control.mjs';
if(process.env.IDENTITY_REPAIR_APPLY!=='20261001-approved-copy')throw Error('Explicit dated publication required');
const command=process.argv[2];
if(!['start','freeze','invalidate','publish','reopen'].includes(command))throw Error('Unknown publication command');
const url=new URL(process.env.DATABASE_URL);
if(url.pathname!=='/seap')throw Error('Wrong publication database');
url.searchParams.set('max_lifetime','0');
const {db,sql}=createDb(url.toString());
const read=async name=>JSON.parse(await readFile('/reports/'+name+'.json','utf8'));
async function save(name,value){await writeFile('/reports/'+name+'.partial',JSON.stringify(value,null,2));await rename('/reports/'+name+'.partial','/reports/'+name+'.json');}
let timer,stage='preflight';
const report={status:'running',startedAt:new Date().toISOString()};

try {
 if(command==='start'){
  const expected=Number(process.env.IDENTITY_EXPECTED_REVISION);
  const proof=await read('validated-copy');
  if(!Number.isSafeInteger(expected)||proof.status!=='validated'||!proof.routesPassed||!proof.checkpointId
   ||!proof.proofFiles||!proof.planFingerprint||!proof.plannedRows||!proof.aliases)throw Error('Validated copy and pinned revision required');
  const before=await sql.begin(q=>claim(q,expected));
  await save('before',before);
 }else if(command==='freeze'){
  const before=await read('before'),proof=await read('validated-copy');
  const boundary=await sql.begin(async q=>{
   const work=await pending(q);
   const b={revision:before.revision+1,rawBoundary:work.raw,lastRequest:work.request,
    proofFiles:proof.proofFiles,plannedRows:proof.plannedRows,planFingerprint:proof.planFingerprint,aliases:proof.aliases};
   await control(q,b);return b;
  });
  await save('boundary',boundary);
 }else{
  const boundary=await read('boundary');
  await sql.begin(q=>control(q,boundary));
  if(command==='invalidate'){
   await withMonitoringWrite(sql,'verified historical authority identity repair',async()=>{});
  }else if(command==='reopen'){
   const verified=await read('report'),before=await read('before');
   if(verified.status!=='validated'||!verified.search||!verified.checks)throw Error('Validated publication required');
   await sql.begin(async q=>{
    const c=await control(q,boundary);
    const [latest]=await q`select id,status from app.monitoring_refreshes order by version desc limit 1`;
    if(latest?.id!==verified.checkpoint.id||latest.status!=='ready')throw Error('Published checkpoint changed');
    const paused=before.paused||!!c.blocked_reason;
    await q`update app.collection_control set maintenance=false,paused=${paused},revision=revision+1,updated_at=clock_timestamp() where id=1`;
    await q`insert into app.collection_audit(actor_id,actor_name,action,before,after)
     values('operator:identity-repair','Corectare identități istorice','identity-repair-complete',
      ${JSON.stringify({revision:c.revision})}::jsonb,${JSON.stringify({checkpointId:latest.id,maintenance:false,paused})}::jsonb)`;
   });
   await collectionHeartbeat(sql,'identity-repair-20261001','processor','complete');
  }else{
   await save('report',report);
   const onStage=async value=>{stage=value;report.stage=value;report.stageStartedAt=new Date().toISOString();await save('report',report);await collectionHeartbeat(sql,'identity-repair-20261001','processor',stage);console.log(`${report.stageStartedAt} stage=${stage}`);};
   timer=setInterval(()=>{void collectionHeartbeat(sql,'identity-repair-20261001','processor',stage).catch(()=>{});},10000);
   const checkpoint=await runMonitoringRefresh(db,sql,{mode:'coordinated',scope:'full',maxRawId:BigInt(boundary.rawBoundary),log:console.log,onStage});
   report.checkpoint={id:checkpoint.id,version:checkpoint.version,status:checkpoint.status};
   await onStage('search');
   const since=new Date().toISOString(),topics=await indexTopics(sql,console.log),entities=await indexEntities(sql,{log:console.log});
   const client=meiliClient(),stats=await client.index('entities').getStats();
   const [expected]=await sql`select count(distinct entity_id)::int n from marts.entity_profile`;
   const tasks=await client.tasks.getTasks({indexUids:['entities'],statuses:['failed','canceled','processing','enqueued'],afterEnqueuedAt:since,limit:1});
   if(stats.isIndexing||stats.numberOfDocuments!==expected.n||tasks.results.length)throw Error('Search validation failed');
   report.search={topics,entities,documents:stats.numberOfDocuments};
   await onStage('identity-validation');
   report.checks=await validateIdentityRepair(sql);
   if(report.checks.rows.planned!==boundary.plannedRows||report.checks.rows.aliases!==boundary.aliases)throw Error('Correction differs from validated copy');
   await sql.begin(q=>control(q,boundary));
   report.status='validated';report.completedAt=new Date().toISOString();await save('report',report);
   await collectionHeartbeat(sql,'identity-repair-20261001','processor','validated-awaiting-reopen');
  }
 }
}catch(error){
 const diagnostic=JSON.parse((JSON.stringify(diagnosticError(error))??'"Unknown error"').replace(/(postgres(?:ql)?:\/\/)[^\s/@]+@/gi,'$1[redacted]@'));
 if(command==='publish'){report.status='failed';report.failedStage=stage;report.error=diagnostic;report.completedAt=new Date().toISOString();await save('report',report);}
 console.error('Identity publication stopped; maintenance must remain active. Inspect the stage and database logs.');
 console.error(JSON.stringify(diagnostic));
 process.exitCode=1;
}finally{clearInterval(timer);await sql.end({timeout:10});}
