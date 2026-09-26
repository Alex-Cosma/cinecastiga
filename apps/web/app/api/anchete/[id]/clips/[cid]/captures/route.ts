import { after, NextResponse } from "next/server";
import { sessionUserId } from "@/lib/session";
import { captureRequestError, processCapture, recaptureClip } from "@/lib/evidence-captures";

export const runtime="nodejs";
export const maxDuration=900;
export async function POST(_request:Request,context:{params:Promise<{id:string;cid:string}>}){
  const userId=await sessionUserId();
  if(!userId)return NextResponse.json({error:"neautentificat"},{status:401});
  const{id,cid}=await context.params;
  try{
    const capture=await recaptureClip(userId,id,cid);
    if(!capture)return NextResponse.json({error:"inexistent sau fără drept de editare"},{status:404});
    after(()=>processCapture(userId,id,capture.id));
    return NextResponse.json({capture},{status:202,headers:{"cache-control":"no-store"}});
  }catch(error){return NextResponse.json({error:captureRequestError(error)??"Captura nu poate fi creată pentru această probă."},{status:400});}
}
