// Dated, one-shot publication recovery. No change to the independent source block.
import {readFile,writeFile} from 'node:fs/promises';
import {createDb} from '/app/packages/db/dist/index.js';
const {sql}=createDb();
try{
 const copy=JSON.parse(await readFile('/reports/copy-proof.json','utf8'));
 const live=JSON.parse(await readFile('/reports/live-preflight.json','utf8'));
 if(!copy.identity.after.valid||copy.marts.validation.differences!==0||copy.marts.validation.actual!==10004||live.groups!==8045||live.publications!==20519||live.versionedGroups!==34||live.canonicalChanges!==34||live.boundary!=='18294756')throw Error('Complete copied and live source verification required');
 const run=await sql.begin(async q=>{
  const [control]=await q`select * from app.collection_control where id=1 for update`;
  if(control.revision!==105||!control.maintenance||!control.paused||control.blocked_reason!=='Sarcina 542533: SEAP a repetat înregistrări între pagini.')throw Error('Operator state changed');
  const [old]=await q`select * from app.processing_runs where id='45928c24-9856-42d0-90b4-161286eb2c8a'::uuid`;
  if(old.status!=='failed'||old.stage!=='identity-quality'||old.raw_boundary!=='18294756')throw Error('Failed publication changed');
  const [busy]=await q`select (select count(*) from app.processing_runs where status='running')+(select count(*) from app.collection_requests where outcome='running')+(select count(*) from app.collection_tasks where status='running')+(select count(*) from app.document_jobs where status='running') n`;
  if(Number(busy.n)!==0)throw Error('Work must drain before recovery');
  if((await q`select id from app.collection_audit where actor_id='ops:publication-20261010'`).length)throw Error('Already attempted; inspect the recorded run');
  const [r]=await q`insert into app.processing_runs(scheduled_day,trigger,scope,control_revision,before_control)
   values((clock_timestamp() at time zone 'Europe/Bucharest')::date,'manual','full',106,${JSON.stringify({paused:true,revision:105,recoveryOf:old.id})}::jsonb) returning id`;
  await q`update app.collection_control set collection_during_maintenance=false,revision=106,updated_at=clock_timestamp() where id=1`;
  await q`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('ops:publication-20261010','Recuperare după verificarea versiunilor','processing-start',${JSON.stringify({revision:105,failedRun:old.id})}::jsonb,${JSON.stringify({runId:r.id,policy:'latest verified version once, all source history preserved',livePreflight:live})}::jsonb)`;
  return r;
 });
 await writeFile('/reports/run-id',run.id+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({runId:run.id}));
}finally{await sql.end({timeout:5});}
