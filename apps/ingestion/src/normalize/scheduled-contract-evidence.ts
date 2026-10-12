import type {DbSql} from '@seap/db';
import {importRecoveredIdentityArchives} from './contract-identity-archives.js';
export const CONTRACT_EVIDENCE_REPAIR_ID='contract-reporting-evidence-v1';

/** Operator-configured one-off import, after verified backup. A completed
 * marker is never replayed; subsequent refreshes read the persisted evidence. */
export async function runScheduledContractEvidence(q:DbSql,runId:string) {
 return q.begin(async tx=>{
  const sql=tx as unknown as DbSql;
  const [repair]=await sql`select * from app.data_repairs where id=${CONTRACT_EVIDENCE_REPAIR_ID} for update`;
  if(!repair||repair.status==='completed')return null;
  const [run]=await sql`select r.*,c.paused,c.maintenance,c.revision from app.processing_runs r cross join app.collection_control c
    where r.id=${runId}::uuid and c.id=1 for update of r,c`;
  if(!run||run.status!=='running'||!run.paused||!run.maintenance||run.control_revision!==run.revision||run.scope!=='full'
   ||run.stage!=='identity-repair'||!run.raw_boundary||!run.stages?.backup?.completedAt||!run.stages?.['backup-verified']?.completedAt||!run.stages?.normalize?.completedAt)
    throw Error('Recovered evidence requires a backed-up full publication');
  if(repair.scheduled_day>run.scheduled_day)throw Error('Reporting evidence import is scheduled for a later date');
  if(repair.status==='applied'&&repair.processing_run_id===runId)return repair.report;
  if(repair.status!=='scheduled')throw Error('Unfinished evidence import requires operator recovery');
  const files=repair.report?.configuration?.files;
  if(!Array.isArray(files)||!files.length)throw Error('Pinned evidence files are required');
  const imported=[];
  for(const file of files){
    if(typeof file.path!=='string'||typeof file.sha256!=='string'||typeof file.source!=='string')throw Error('Invalid evidence configuration');
    imported.push(await importRecoveredIdentityArchives(sql,file.path,file.sha256,file.source));
  }
  const report={configuration:repair.report.configuration,imported};
  await sql`update app.data_repairs set status='applied',processing_run_id=${runId}::uuid,
    applied_at=clock_timestamp(),report=${JSON.stringify(report)}::jsonb,error=null where id=${CONTRACT_EVIDENCE_REPAIR_ID}`;
  await sql`insert into app.collection_audit(actor_id,actor_name,action,before,after)
    values('system:processor','Recuperarea dovezilor istorice','identity-evidence-import','{}'::jsonb,${JSON.stringify({runId,...report})}::jsonb)`;
  return report;
 });
}
