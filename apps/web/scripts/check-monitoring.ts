/** Explicit worker only. It never starts collection or publishes a checkpoint.
 * pnpm --filter web exec tsx scripts/check-monitoring.ts [--checkpoint=UUID] [--limit=100]
 * Run after monitoring-refresh succeeds; repeating a checkpoint is idempotent. */
import { monitoringDatabase,checkAllMonitoringWatches } from "../lib/monitoring-engine";
import { isWorkspaceId } from "../lib/investigation-access";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
const limit=Number(process.argv.find(a=>a.startsWith("--limit="))?.slice(8)??"100");
const requested=process.argv.find(a=>a.startsWith("--checkpoint="))?.slice(13);
if(!Number.isSafeInteger(limit)||limit<1||limit>1000||requested&&!isWorkspaceId(requested))throw new Error("Use --limit=1..1000 and an optional valid --checkpoint=UUID");
try{loadEnvFile(resolve(import.meta.dirname,"../.env.local"));}catch{/* A deployment may supply its environment directly. */}
const sql=monitoringDatabase();
try{
  const report=await checkAllMonitoringWatches({limit,...(requested?{checkpointId:requested}:{})},sql);
  console.log(JSON.stringify(report));
  if(report.failed)process.exitCode=1;
}finally{await sql.end();}
