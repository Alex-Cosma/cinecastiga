import { ConnectionError } from "@/lib/connections";
import { getPeerCandidates,parsePeerCandidatesInput } from "@/lib/peers";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  try{return Response.json(await getPeerCandidates(parsePeerCandidatesInput(new URL(request.url).searchParams)),{headers:{"Cache-Control":"no-store"}});}
  catch(error){
    if(error instanceof ConnectionError)return Response.json({error:error.message},{status:error.status,headers:{"Cache-Control":"no-store"}});
    console.error("Peer candidate search failed",error instanceof Error?error.name:"UnknownError");
    return Response.json({error:"Căutarea nu a putut fi încărcată. Reîncearcă."},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
