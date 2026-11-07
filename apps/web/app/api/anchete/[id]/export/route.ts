import { sessionUserId } from "@/lib/session";
import { investigationExport } from "@/lib/evidence-bundle";
import { hostOrigin, publicOrigin } from "@/lib/evidence-sheet";
export const runtime="nodejs";
export const maxDuration=900;
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){
  const uid=await sessionUserId();if(!uid)return new Response("neautentificat",{status:401});
  const {id}=await ctx.params,url=new URL(req.url);
  // Links in the export use the address the reader used (the public one in production), not the server's own.
  return await investigationExport(uid,id,publicOrigin(hostOrigin(req.headers.get("host"),url.origin)),url.searchParams.get("format")==="zip"?"zip":"md")??new Response("inexistent",{status:404});
}
