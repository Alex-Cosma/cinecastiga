import { NextResponse } from "next/server";
import { sessionUserId } from "@/lib/session";
import { getCapturedRows } from "@/lib/evidence-captures";
export async function GET(request:Request,context:{params:Promise<{id:string;captureId:string}>}){
  const userId=await sessionUserId();
  if(!userId)return NextResponse.json({error:"neautentificat"},{status:401});
  const{id,captureId}=await context.params;
  const result=await getCapturedRows(userId,id,captureId,Number(new URL(request.url).searchParams.get("after")??0));
  return NextResponse.json(result??{error:"captură indisponibilă"},{status:result?200:404,headers:{"cache-control":"no-store"}});
}
