import { monitoringApi,monitoringFound } from "@/lib/monitoring-api";
import { getMonitoringWatch,getMonitoringRun } from "@/lib/monitoring";
import { evaluateMonitoringWatch } from "@/lib/monitoring-engine";
export const runtime="nodejs";export const maxDuration=900;
export async function POST(_request:Request,ctx:{params:Promise<{id:string}>}){return monitoringApi(async userId=>{
  const{id}=await ctx.params;monitoringFound(await getMonitoringWatch(userId,id));
  const runId=await evaluateMonitoringWatch(id);return {run:runId?(await getMonitoringRun(userId,id,runId))?.run??null:null};
});}
