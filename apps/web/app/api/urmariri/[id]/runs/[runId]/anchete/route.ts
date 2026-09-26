import { monitoringApi,monitoringFound } from "@/lib/monitoring-api";
import { addMonitoringRunToCase } from "@/lib/monitoring-case";
import { monitoringObject,MonitoringError } from "@/lib/monitoring-input";
export const runtime="nodejs";export const maxDuration=900;
export async function POST(request:Request,ctx:{params:Promise<{id:string;runId:string}>}){return monitoringApi(async userId=>{
  const{id,runId}=await ctx.params,body=monitoringObject(await request.json());
  if(typeof body.investigationId!=="string"||body.createTask!==undefined&&typeof body.createTask!=="boolean"||Object.keys(body).some(k=>!["investigationId","createTask"].includes(k)))throw new MonitoringError("Alege o anchetă și dacă vrei să creezi o sarcină de verificare.");
  return monitoringFound(await addMonitoringRunToCase(userId,id,runId,body.investigationId,body.createTask===true));
});}
