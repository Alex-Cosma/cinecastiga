import { monitoringApi,monitoringFound } from "@/lib/monitoring-api";
import { getMonitoringWatch,listMonitoringRuns } from "@/lib/monitoring";
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){return monitoringApi(async userId=>{
  const{id}=await ctx.params;monitoringFound(await getMonitoringWatch(userId,id));
  const after=new URL(request.url).searchParams.get("after");return listMonitoringRuns(userId,{watchId:id,...(after?{after}:{})});
});}
