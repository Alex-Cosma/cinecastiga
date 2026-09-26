import { monitoringApi,monitoringFound } from "@/lib/monitoring-api";
import { monitoringDeltaRows } from "@/lib/monitoring";
export async function GET(request:Request,ctx:{params:Promise<{id:string;runId:string}>}){return monitoringApi(async userId=>{
  const{id,runId}=await ctx.params,params=new URL(request.url).searchParams;
  return monitoringFound(await monitoringDeltaRows(userId,id,runId,{after:params.get("after"),relevant:params.get("relevant")==="1"}));
});}
