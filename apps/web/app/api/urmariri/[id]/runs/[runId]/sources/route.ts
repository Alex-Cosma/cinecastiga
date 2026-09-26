import { monitoringApi,monitoringFound } from "@/lib/monitoring-api";
import { monitoringSourceRows } from "@/lib/monitoring";
export async function GET(request:Request,ctx:{params:Promise<{id:string;runId:string}>}){return monitoringApi(async userId=>{
  const{id,runId}=await ctx.params;return monitoringFound(await monitoringSourceRows(userId,id,runId,new URL(request.url).searchParams.get("after")));
});}
