/** Guard and heartbeat for an explicitly authorized one-off live TED repair. */
import {createDb,collectionHeartbeat,withMonitoringWrite} from '@seap/db';
import {DA_CEILING_SEED_ROWS} from '@seap/domain';
import {spawn} from 'node:child_process';
import {Meilisearch} from 'meilisearch';
const [command,...args]=process.argv.slice(2);
if(process.env.TED_REPAIR_APPLY!=='20260927'||!['replay-ted','monitoring-refresh','index-search','seed-legal-eras'].includes(command))throw Error('Explicit live repair command required');
const {sql}=createDb();
let heartbeat;
try {
 const [c]=await sql`select current_database() database,paused,maintenance from app.collection_control where id=1`;
 if(c?.database!=='seap'||!c.paused||!c.maintenance)throw Error('Live repair requires production maintenance and paused collection');
 const worker='ted-repair-20260927';
 await collectionHeartbeat(sql,worker,'processor',command);
 heartbeat=setInterval(()=>{void collectionHeartbeat(sql,worker,'processor',command).catch(()=>{});},10000);
 if(command==='seed-legal-eras') {
  await withMonitoringWrite(sql,command,()=>sql.begin(async tx=>{
   await tx`delete from core.risk_thresholds where key in ('da_ceiling_goods_services','da_ceiling_works')`;
   for(const r of DA_CEILING_SEED_ROWS)await tx`insert into core.risk_thresholds(key,valid_from,valid_to,value_num,note) values(${r.key},${r.validFrom}::date,${r.validTo}::date,${r.valueNum},${r.note})`;
  }));
 } else {
  const startedAt=new Date();
  const child=spawn(process.execPath,[new URL(`./${command}.js`,import.meta.url).pathname,...args],{stdio:'inherit'});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(signal?1:code??1));});
  if(code!==0)throw Error(`Repair stage ${command} failed with exit ${code}`);
  if(command==='index-search') {
   const client=new Meilisearch({host:process.env.MEILISEARCH_URL,apiKey:process.env.MEILISEARCH_KEY});
   const stats=await client.index('entities').getStats();
   const [expected]=await sql`select count(distinct ep.entity_id)::int n from marts.entity_profile ep join core.entities e on e.id=ep.entity_id`;
   const failed=await client.tasks.getTasks({indexUids:['entities'],statuses:['failed','canceled'],types:['documentAdditionOrUpdate','documentDeletion','settingsUpdate'],afterEnqueuedAt:startedAt.toISOString(),limit:1});
   if(stats.isIndexing||stats.numberOfDocuments!==expected.n||failed.results.length)throw Error('Search index did not pass count/task validation');
   console.log(JSON.stringify({searchValidated:true,documents:stats.numberOfDocuments}));
  }
 }
 await collectionHeartbeat(sql,worker,'processor','complete');
} catch(error) {
 console.error(error instanceof Error?error.message:'Live repair stage failed');process.exitCode=1;
} finally {clearInterval(heartbeat);await sql.end();}
