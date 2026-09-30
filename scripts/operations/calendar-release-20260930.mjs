/** One-off authorized transition; does not replace or impersonate a scheduled run. */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createDb,collectionHeartbeat} from '@seap/db';
import {runMonitoringRefresh} from '../monitoring/refresh.js';
import {indexTopics} from '../search/index-topics.js';
import {indexEntities,meiliClient} from '../search/index-entities.js';
if(process.env.CALENDAR_RELEASE_APPLY!=='20260930')throw Error('Explicit calendar release required');
const command=process.argv[2]??'publish';
if(!['publish','reopen'].includes(command))throw Error('Unknown command');
const boundary=JSON.parse(await readFile('/reports/boundary.json','utf8'));
const url=new URL(process.env.DATABASE_URL);url.searchParams.set('max_lifetime','0');
const {db,sql}=createDb(url.toString());
const worker='calendar-release-20260930';
let heartbeat,stage='preflight';
const report={startedAt:new Date().toISOString(),status:'running',rawBoundary:boundary.rawBoundary};
async function save(){await writeFile('/reports/report.partial',JSON.stringify(report,null,2));await rename('/reports/report.partial','/reports/report.json');}
async function control(q){
 const [c]=await q`select *,current_database() database from app.collection_control where id=1 for update`;
 const [pending]=await q`select (select count(*) from app.collection_requests where outcome='running')+(select count(*) from app.collection_tasks where status='running')+(select count(*) from app.document_jobs where status='running') n, (select coalesce(max(id),0)::text from app.collection_requests) last_request, (select coalesce(max(id),0)::text from raw.raw_documents) raw_boundary`;
 if(c?.database!=='seap'||!c.paused||!c.maintenance||c.revision!==boundary.revision||c.blocked_reason||Number(pending.n)!==0||pending.last_request!==boundary.lastRequest||pending.raw_boundary!==boundary.rawBoundary)throw Error('Operator, source or boundary state changed; maintenance retained');
 return c;
}
try {
 await sql.begin(control);
 if(command==='reopen'){
  const verified=JSON.parse(await readFile('/reports/report.json','utf8'));
  if(verified.status!=='validated'||!verified.search||!verified.calendar?.length)throw Error('Validated report required');
  await sql.begin(async q=>{
   const c=await control(q);
   const [latest]=await q`select id,status,methodology from app.monitoring_refreshes order by version desc limit 1`;
   if(latest?.id!==verified.checkpoint.id||latest.status!=='ready'||latest.methodology.flags!=='rf-2026.6')throw Error('Verified checkpoint changed');
   await q`update app.collection_control set maintenance=false,paused=false,revision=revision+1,updated_at=clock_timestamp() where id=1`;
   await q`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('operator:codex','Tranziție calendar verificată','calendar-release-complete',${JSON.stringify({revision:c.revision})}::jsonb,${JSON.stringify({checkpointId:latest.id,revision:c.revision+1,maintenance:false,paused:false})}::jsonb)`;
  });
  console.log('Validated calendar release reopened; existing schedule and source settings preserved.');
 }else{
  await save();
  heartbeat=setInterval(()=>{void collectionHeartbeat(sql,worker,'processor',stage).catch(()=>{});},10000);
  const onStage=async value=>{stage=value;report.stage=value;report.stageStartedAt=new Date().toISOString();await save();await collectionHeartbeat(sql,worker,'processor',stage);console.log(`${report.stageStartedAt} stage=${stage}`);};
  const checkpoint=await runMonitoringRefresh(db,sql,{mode:'coordinated',scope:'full',maxRawId:BigInt(boundary.rawBoundary),log:console.log,onStage});
  report.checkpoint={id:checkpoint.id,version:checkpoint.version,status:checkpoint.status};
  await onStage('search');
  const since=new Date().toISOString();
  const topics=await indexTopics(sql,console.log);
  const entities=await indexEntities(sql,{log:console.log});
  const client=meiliClient(),stats=await client.index('entities').getStats();
  const [expected]=await sql`select count(distinct entity_id)::int n from marts.entity_profile`;
  const failures=await client.tasks.getTasks({indexUids:['entities'],statuses:['failed','canceled'],types:['documentAdditionOrUpdate','documentDeletion','settingsUpdate'],afterEnqueuedAt:since,limit:1});
  if(stats.isIndexing||stats.numberOfDocuments!==expected.n||failures.results.length)throw Error('Search validation failed');
  report.search={topics,entities,documents:stats.numberOfDocuments};
  await onStage('calendar-validation');
  const [sample]=await sql`select c.id from core.contracts c where extract(year from c.contract_date at time zone 'UTC')<>extract(year from c.contract_date at time zone 'Europe/Bucharest') and exists(select 1 from marts.contract_transactions t where t.contract_id=c.id) limit 1`;
  if(!sample)throw Error('No year-boundary contract available for verification');
  const examples=await sql`select id::text from core.contracts where ca_notice_contract_id in (106652551,107706970)`;
  if(examples.length!==2)throw Error('Expected calendar examples are missing');
  const ids=[...examples.map(r=>r.id),String(sample.id)];
  const rows=await sql`select c.id::text id,c.ca_notice_contract_id::text seap_id,to_char(c.contract_date at time zone 'Europe/Bucharest','YYYY-MM-DD') expected, min(t.finalization_date) projected_min,max(t.finalization_date) projected_max, s.date search_date,s.year search_year from core.contracts c join marts.contract_transactions t on t.contract_id=c.id join marts.topic_acquisitions s on s.id='contracts:'||c.id where c.id=any(${ids}::bigint[]) group by c.id,c.contract_date,s.date,s.year`;
  if(rows.length!==new Set(ids).size||rows.some(r=>r.expected!==r.projected_min||r.expected!==r.projected_max||r.expected!==r.search_date||Number(r.expected.slice(0,4))!==r.search_year))throw Error('Calendar projection differs from Romanian source dates');
  report.calendar=rows;
  await sql.begin(control);
  report.status='validated';report.completedAt=new Date().toISOString();await save();
  await collectionHeartbeat(sql,worker,'processor','validated-awaiting-reopen');
 }
}catch(error){
 if(command==='publish'){report.status='failed';report.failedStage=stage;report.completedAt=new Date().toISOString();report.error=error instanceof Error?error.message:'Unknown error';await save();}
 console.error('Calendar release failed; maintenance retained. Inspect the private report and checkpoint.');process.exitCode=1;
}finally{clearInterval(heartbeat);await sql.end({timeout:10});}
