import { after } from "next/server";
import { monitoringApi } from "@/lib/monitoring-api";
import { createMonitoringWatch,listMonitoringWatches } from "@/lib/monitoring";
import { evaluateMonitoringWatch } from "@/lib/monitoring-engine";
export const runtime="nodejs";export const maxDuration=900;
export async function GET(request:Request){return monitoringApi(userId=>listMonitoringWatches(userId,new URL(request.url).searchParams.get("after")??undefined));}
export async function POST(request:Request){return monitoringApi(async userId=>{
  const watch=await createMonitoringWatch(userId,await request.json());
  after(async()=>{try{await evaluateMonitoringWatch(watch.id);}catch{/* Durable lastError is visible in the private watch. */}});
  return {watch};
});}
