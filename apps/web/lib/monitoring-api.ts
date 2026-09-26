import { NextResponse } from "next/server";
import { sessionUserId } from "./session";
import { MonitoringError } from "./monitoring-input";
export const monitoringJson=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
export async function monitoringApi(work:(userId:string)=>Promise<unknown>){
  const userId=await sessionUserId();if(!userId)return monitoringJson({error:"Autentifică-te pentru urmăriri private."},401);
  try{return monitoringJson(await work(userId));}catch(error){
    return monitoringJson({error:error instanceof MonitoringError?error.message:"Nu am putut finaliza acțiunea. Datele salvate sunt păstrate; reîncearcă."},error instanceof MonitoringError?error.status:500);
  }
}
export function monitoringFound<T>(value:T|null):T {if(value===null)throw new MonitoringError("Urmărirea sau actualizarea nu este disponibilă.",404);return value;}
