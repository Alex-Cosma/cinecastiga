import { after, NextResponse } from "next/server";
import { sessionUserId } from "@/lib/session";
import { getCapture, processCapture } from "@/lib/evidence-captures";
import { getInvestigationAccess } from "@/lib/investigation-access";
type Context={params:Promise<{id:string;captureId:string}>};
export const runtime="nodejs";
export const maxDuration=900;
export async function GET(_request:Request,context:Context){
  const userId=await sessionUserId();
  if(!userId)return NextResponse.json({error:"neautentificat"},{status:401});
  const{id,captureId}=await context.params;
  const capture=await getCapture(userId,id,captureId);
  return NextResponse.json(capture?{capture}:{error:"inexistent"},{status:capture?200:404,headers:{"cache-control":"no-store"}});
}
export async function POST(_request:Request,context:Context){
  const userId=await sessionUserId();
  if(!userId)return NextResponse.json({error:"neautentificat"},{status:401});
  const{id,captureId}=await context.params;
  const access=await getInvestigationAccess(userId,id);
  if(!access?.canEdit)return NextResponse.json({error:"fără drept de editare"},{status:403});
  const capture=await getCapture(userId,id,captureId);
  if(!capture)return NextResponse.json({error:"inexistent"},{status:404});
  if(capture.status!=="complete")after(()=>processCapture(userId,id,captureId));
  return NextResponse.json({capture},{status:capture.status==="complete"?200:202,headers:{"cache-control":"no-store"}});
}
