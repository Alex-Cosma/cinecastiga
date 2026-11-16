import { monitoringApi,monitoringFound } from "@/lib/monitoring-api";
import { getMonitoringWatch,getMonitoringRun } from "@/lib/monitoring";
import { evaluateMonitoringWatch } from "@/lib/monitoring-engine";
export const runtime="nodejs";export const maxDuration=900;
export async function POST(_request:Request,ctx:{params:Promise<{id:string}>}){return monitoringApi(async userId=>{
  const{id}=await ctx.params;const before=monitoringFound(await getMonitoringWatch(userId,id));
  // `fresh`: the check made a new version; the same validated data answers with the run it already has (audit Z8-38).
  const runId=await evaluateMonitoringWatch(id);return {run:runId?(await getMonitoringRun(userId,id,runId))?.run??null:null,fresh:Boolean(runId)&&runId!==before.lastSuccessRunId};
});}
