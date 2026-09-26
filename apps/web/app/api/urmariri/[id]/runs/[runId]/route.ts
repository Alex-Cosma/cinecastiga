import { monitoringApi,monitoringFound } from "@/lib/monitoring-api";
import { getMonitoringRun,reviewMonitoringRun } from "@/lib/monitoring";
import { monitoringObject,MonitoringError } from "@/lib/monitoring-input";
type Context={params:Promise<{id:string;runId:string}>};
export async function GET(_request:Request,ctx:Context){return monitoringApi(async userId=>{const{id,runId}=await ctx.params;return monitoringFound(await getMonitoringRun(userId,id,runId));});}
export async function PATCH(request:Request,ctx:Context){return monitoringApi(async userId=>{
  const{id,runId}=await ctx.params,body=monitoringObject(await request.json());
  if(typeof body.reviewed!=="boolean"||Object.keys(body).some(k=>k!=="reviewed"))throw new MonitoringError("Alege dacă actualizarea a fost verificată.");
  monitoringFound(await reviewMonitoringRun(userId,id,runId,body.reviewed));return {run:monitoringFound(await getMonitoringRun(userId,id,runId)).run};
});}
