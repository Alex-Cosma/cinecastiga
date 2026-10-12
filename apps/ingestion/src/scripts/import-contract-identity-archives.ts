import {createDb,type DbSql} from '@seap/db';
import {importRecoveredIdentityArchives} from '../normalize/contract-identity-archives.js';
const [file,sha256,source,runId]=process.argv.slice(2);
if(!file||!sha256||!source)throw Error('Usage: import-contract-identity-archives FILE SHA256 SOURCE [FROZEN_PROCESSING_RUN_ID]');
const url=new URL(process.env.DATABASE_URL!);
const isolated=['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.pathname.startsWith('/seap_test_');
const {sql}=createDb();
try {
 const report=await sql.begin(async tx=>{
  const q=tx as unknown as DbSql;
  if(!isolated){
   if(!runId)throw Error('Production evidence import requires an explicit backed-up processing run');
   const [run]=await q`select r.*,c.paused,c.maintenance,c.revision from app.processing_runs r cross join app.collection_control c
    where r.id=${runId}::uuid and c.id=1 for update of r,c`;
   if(!run||run.status!=='running'||!run.paused||!run.maintenance||run.control_revision!==run.revision
    ||!run.raw_boundary||!run.stages?.backup?.completedAt||!run.stages?.['backup-verified']?.completedAt)
     throw Error('Import requires frozen, backed-up maintenance');
  }
  const result=await importRecoveredIdentityArchives(q,file,sha256,source);
  if(!isolated)await q`insert into app.collection_audit(actor_id,actor_name,action,before,after)
   values('system:repair','Dovezi istorice recuperate','identity-evidence-import','{}'::jsonb,${JSON.stringify({runId,...result})}::jsonb)`;
  return result;
 });
 console.log(JSON.stringify(report));
}finally{await sql.end();}
