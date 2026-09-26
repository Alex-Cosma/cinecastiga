import { monitoringApi,monitoringFound } from "@/lib/monitoring-api";
import { getMonitoringWatch,updateMonitoringWatch } from "@/lib/monitoring";
type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,ctx:Context){return monitoringApi(async userId=>({watch:monitoringFound(await getMonitoringWatch(userId,(await ctx.params).id))}));}
export async function PATCH(request:Request,ctx:Context){return monitoringApi(async userId=>({watch:monitoringFound(await updateMonitoringWatch(userId,(await ctx.params).id,await request.json()))}));}
