// Explicit, single-use incident recovery. Requires verified backup + copied rehearsal.
import {readFile,writeFile} from 'node:fs/promises';
import {createDb,diagnosticError} from '/app/packages/db/dist/index.js';
import {PARSERS} from '/app/apps/ingestion/dist/normalize/parsers.js';
import {planResponse} from '/app/apps/ingestion/dist/collection/plan.js';
import {insertTasks} from '/app/apps/ingestion/dist/collection/runner.js';
import {archiveDocumentsSql} from '/app/apps/ingestion/dist/scrape/archive.js';
import {repairIdentities} from './repair-identities.mjs';
const {db,sql}=createDb();
const failure='a089c12c-592d-4700-8749-77f24dcd17ee';
try{
 const proof=JSON.parse(await readFile('/reports/copy-validation.json','utf8'));
 if(proof.status!=='passed'||proof.oldReferences!==0||proof.replayed!==4)throw Error('Validated isolated copy required');
 const [c]=await sql`select * from app.collection_control where id=1`;
 if(c.revision!==89||!c.maintenance||!c.paused||c.blocked_reason!=='Sarcina 190888: Dimensiunea paginii depășește limita cerută.')throw Error('Unexpected control');
 if((await sql`select id from app.processing_runs where status='running'`).length)throw Error('Processing active');
 if((await sql`select id from app.collection_audit where actor_id='ops:recovery-20261007' and action='identity-repair'`).length)throw Error('Repair already attempted; inspect audit');
 const [old]=await sql`select * from app.processing_runs where id=${failure}::uuid`;
 if(old.status!=='failed'||old.stage!=='normalize'||old.raw_boundary!=='17561343')throw Error('Failed run changed');
 const [busy]=await sql`select (select count(*) from app.collection_requests where outcome='running')+(select count(*) from app.collection_tasks where status='running')+(select count(*) from app.document_jobs where status='running') n`;
 if(Number(busy.n))throw Error('Work must be drained');
 const repairs=await repairIdentities(sql);
 await sql`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('ops:recovery-20261007','Recuperare verificată','identity-repair',${JSON.stringify({failedRun:failure,revision:89})}::jsonb,${JSON.stringify({repairs})}::jsonb)`;
 const rows=await sql`select id,payload from raw.raw_documents where id in(17438578,17545919,17556115,17556311) order by id`;
 if(rows.length!==4)throw Error('Missing quarantined source');
 for(const r of rows){const parser=PARSERS['award-contracts:v1'];await db.transaction(async tx=>parser.load({tx,cpvCatalog:new Set(),cpvByPrefix:new Map(),units:new Map()},BigInt(r.id),parser.schema.parse(r.payload)));}
 // Preserve the original failure and all HTTP attempts; archive reconciled pages
 // offline, so no redundant source requests or undocumented discarded rows.
 const requests=await sql`select * from app.collection_requests where id in(51915,51980,51981) order by id`;
 if(requests.length!==3||requests.some(r=>r.status!==200||r.outcome!=='success'))throw Error('Probe evidence incomplete');
 const responses=requests.map(r=>r.id==51915?r.diagnostics.taskFailure.response:r.diagnostics.response.body);
 let [task]=await sql`select * from app.collection_tasks where id=190888`;
 if(task.status!=='failed')throw Error('Failed task changed');
 const plans=[],prior=[];
 for(let page=0;page<3;page++){
  const plan=planResponse(task,responses[page],prior,'2026-10-06');plans.push({task,plan});prior.push(plan.result);task=plan.children[0];
 }
 const final=plans[2].plan;
 if(final.children.length||final.docs[0]?.payload.items.length!==585)throw Error('Population does not reconcile');
 await sql.begin(async q=>{
  const [control]=await q`select * from app.collection_control where id=1 for update`;
  if(control.revision!==89||!control.maintenance||control.blocked_reason!==c.blocked_reason)throw Error('Operator state changed');
  const archived=await archiveDocumentsSql(q,final.docs);
  for(const {task,plan} of plans){
   await insertTasks(q,[task]);
   await q`update app.collection_tasks set status='complete',result=${JSON.stringify({...plan.result,incident:'20261007',archived:plan.docs.length?archived.inserted:0})}::jsonb,finished_at=clock_timestamp() where batch_id=${task.batch_id} and key=${task.key}`;
  }
  await q`update app.collection_control set blocked_reason=null,blocked_until=null where id=1`;
  await q`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('ops:recovery-20261007','Recuperare verificată','retry-task',${JSON.stringify({taskId:190888,error:c.blocked_reason})}::jsonb,${JSON.stringify({requests:[51915,51980,51981],distinctContracts:585,archived,quarantineRawIds:rows.map(r=>String(r.id)),quarantineReplayed:true})}::jsonb)`;
 });
 const run=await sql.begin(async q=>{
  const [control]=await q`select * from app.collection_control where id=1 for update`;
  if(control.revision!==89||!control.maintenance||!control.paused||control.blocked_reason)throw Error('Publication state changed');
  const [r]=await q`insert into app.processing_runs(scheduled_day,trigger,scope,control_revision,before_control,raw_boundary) values('2026-10-07','manual','full',90,${JSON.stringify({paused:old.before_control.paused,revision:89,recoveryOf:failure})}::jsonb,(select max(id)::text from raw.raw_documents)) returning id`;
  await q`update app.collection_control set revision=90,updated_at=clock_timestamp() where id=1`;
  await q`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('ops:recovery-20261007','Recuperare verificată','processing-start',${JSON.stringify({failedRun:failure})}::jsonb,${JSON.stringify({runId:r.id,scope:'full',oneOff:true})}::jsonb)`;
  return r;
 });
 await writeFile('/reports/run-id',run.id+'\n',{mode:0o600});
 console.log(JSON.stringify({repairs,replayed:rows.length,pagination:{unique:585,requests:0},runId:run.id}));
}catch(e){console.error(JSON.stringify(diagnosticError(e)));process.exitCode=1;}finally{await sql.end({timeout:10});}
