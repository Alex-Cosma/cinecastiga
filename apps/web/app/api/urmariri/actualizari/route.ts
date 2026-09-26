import { getMonitoringRefreshStatus } from "@seap/db";
import { monitoringApi } from "@/lib/monitoring-api";
import { listMonitoringRuns,monitoringHealth } from "@/lib/monitoring";
import { monitoringDatabase } from "@/lib/monitoring-engine";
export async function GET(request:Request){return monitoringApi(async userId=>{
  const params=new URL(request.url).searchParams,after=params.get("after");
  return {...await listMonitoringRuns(userId,{inbox:true,unread:params.get("unread")==="1",...(after?{after}:{})}),refresh:await getMonitoringRefreshStatus(monitoringDatabase()),health:await monitoringHealth(userId)};
});}
