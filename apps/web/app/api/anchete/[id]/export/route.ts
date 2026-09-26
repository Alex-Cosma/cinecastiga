import { sessionUserId } from "@/lib/session";
import { investigationExport } from "@/lib/evidence-bundle";
export const runtime="nodejs";
export const maxDuration=900;
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){
  const uid=await sessionUserId();if(!uid)return new Response("neautentificat",{status:401});
  const {id}=await ctx.params,url=new URL(req.url);
  return await investigationExport(uid,id,url.origin,url.searchParams.get("format")==="zip"?"zip":"md")??new Response("inexistent",{status:404});
}
