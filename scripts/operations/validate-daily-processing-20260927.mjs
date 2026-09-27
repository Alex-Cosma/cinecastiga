/** One-off read-model rehearsal on the already repaired isolated clone. No search/source HTTP. */
import {createDb} from '@seap/db';
import {runMonitoringRefresh} from '../monitoring/refresh.js';
import {writeFile} from 'node:fs/promises';
const url=new URL(process.env.DATABASE_URL);
if(url.pathname!=='/seap_benchmark_20260927')throw Error('Dedicated repaired clone required');
url.searchParams.set('max_lifetime','0');
const {db,sql}=createDb(url.toString());
const reportPath='/report/daily-validation.json';
async function fingerprint(table){
 const [r]=await sql.unsafe(`select count(*)::text n,
 coalesce(sum(hashtextextended(to_jsonb(t)::text,0)::numeric),0)::text fingerprint0,
 coalesce(sum(hashtextextended(to_jsonb(t)::text,1)::numeric),0)::text fingerprint1 from ${table} t`);
 return r;
}
async function risk(){
 const out={};for(const table of ['core.flags','marts.entity_flags','marts.flag_instances'])out[table]=await fingerprint(table);
 return out;
}
let report={status:'running',startedAt:new Date().toISOString(),sourceRequests:0,searchChanged:false,stages:{}};
function completeStage(at){
 if(report.stage&&report.stageStartedAt)report.stages[report.stage]={
  startedAt:report.stageStartedAt,completedAt:at,
  durationMs:new Date(at).getTime()-new Date(report.stageStartedAt).getTime(),
 };
}
try {
 const [prior]=await sql`select id,status,completed_at,validation from app.monitoring_refreshes order by version desc limit 1`;
 if(prior?.status!=='ready'||!prior.validation?.stages?.flags)throw Error('A repaired full baseline must already be ready');
 const [raw]=await sql`select max(id)::text id from raw.raw_documents`;
 const before=await risk();report={...report,priorId:prior.id,before};
 await writeFile(reportPath,JSON.stringify(report,null,2));
 report.calculationStartedAt=new Date().toISOString();
 const checkpoint=await runMonitoringRefresh(db,sql,{mode:'coordinated',scope:'daily',maxRawId:BigInt(raw.id),log:console.log,
   onStage:async stage=>{const at=new Date().toISOString();completeStage(at);report={...report,stage,stageStartedAt:at};await writeFile(reportPath,JSON.stringify(report,null,2));}});
 report.calculationCompletedAt=new Date().toISOString();
 report.recalculationMs=new Date(report.calculationCompletedAt).getTime()-new Date(report.calculationStartedAt).getTime();
 completeStage(report.calculationCompletedAt);
 const after=await risk();
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Daily refresh changed retained risk tables');
 if(checkpoint.validation.risk.checkpointId!==String(prior.id)||checkpoint.validation.risk.calculatedAt!==new Date(prior.completed_at).toISOString())throw Error('Risk provenance changed');
 if(checkpoint.validation.stages.flags||checkpoint.validation.stages['flag-marts'])throw Error('Risk stages ran during daily scope');
 report={...report,status:'ready',completedAt:new Date().toISOString(),after,checkpoint};
 await writeFile(reportPath,JSON.stringify(report,null,2));
 console.log(JSON.stringify({dailyValidated:true,checkpoint:checkpoint.id,checks:checkpoint.validation.checks.length}));
}catch(error){
 report={...report,status:'failed',completedAt:new Date().toISOString(),error:error instanceof Error?error.message:'Validation failed'};
 await writeFile(reportPath,JSON.stringify(report,null,2));process.exitCode=1;
}finally{await sql.end({timeout:10});}
