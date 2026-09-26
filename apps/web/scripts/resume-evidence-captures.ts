/** Resume durable jobs after a process restart. Run explicitly on the intended
 * database; each job rechecks the originating user's current edit permission.
 * Usage: pnpm --filter web exec tsx scripts/resume-evidence-captures.ts --limit=20
 * Add --failed to retry failed jobs too. No completed version is overwritten. */
import { captureDatabase,processCapture } from "../lib/evidence-captures";
import { getInvestigationAccess } from "../lib/investigation-access";
const raw=process.argv.find(a=>a.startsWith("--limit="))?.slice(8)??"20",limit=Number(raw);
if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error("--limit must be an integer between 1 and 100");
const sql=captureDatabase();
try{
  const jobs=await sql`select id::text,investigation_id::text,created_by from app.evidence_captures
    where status='queued' or (status='running' and started_at<now()-interval '5 minutes')
      or (${process.argv.includes("--failed")} and status='failed') order by created_at,id limit ${limit}`;
  let completed=0,failed=0,denied=0;
  for(const job of jobs){
    if(!(await getInvestigationAccess(job.created_by,job.investigation_id,sql))?.canEdit){denied++;continue;}
    await processCapture(job.created_by,job.investigation_id,job.id,sql);
    const [status]=await sql`select status from app.evidence_captures where id=${job.id}`;
    if(status?.status==="complete")completed++;else failed++;
  }
  console.log(JSON.stringify({selected:jobs.length,completed,failedOrActive:failed,permissionNoLongerValid:denied}));
}finally{await sql.end();}
