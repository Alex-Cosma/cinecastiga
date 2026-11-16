import { ConnectionError } from "@/lib/connections";
import { getPeers,parsePeerInput } from "@/lib/peers";
import { uatName } from "@/lib/map-search";
import type { PeerPopulation, PeersResult } from "@/lib/peers-shared";

/** The members' places named as on the map (UX audit Z4-34: „Zărnești · Brașov”, not „Orasul Zarnesti (Primaria …)”). */
function withPlaceNames(result: PeersResult): PeersResult {
  const name = (p: PeerPopulation | undefined) => { if (p && p.level !== "county") { const n = uatName(p.siruta); if (n) p.placeName = n; } };
  name(result.focal?.population);
  for (const member of result.members) name(member.population);
  return result;
}
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    // `member`: one member of the group with its identity, for its sources (a dot or a neighbour of the swarm).
    const params = new URL(request.url).searchParams, member = params.get("member");
    params.delete("member");
    if (member !== null && !/^[1-9]\d{0,15}$/.test(member)) return Response.json({error:"Membru necunoscut."},{status:400,headers:{"Cache-Control":"no-store"}});
    return Response.json(withPlaceNames(await getPeers(parsePeerInput(params),undefined,member ? {memberId:member} : {})),{headers:{"Cache-Control":"no-store"}});
  }
  catch(error) {
    if (error instanceof ConnectionError) return Response.json({error:error.message},{status:error.status,headers:{"Cache-Control":"no-store"}});
    console.error("Peer comparison query failed",error instanceof Error ? error.name : "UnknownError");
    return Response.json({error:"Comparația nu a putut fi încărcată. Reîncearcă."},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
