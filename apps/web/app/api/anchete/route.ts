import { NextResponse } from "next/server";
import { sessionUserId } from "@/lib/session";
import { createInvestigation, listInvestigations } from "@/lib/anchete";

export async function GET() {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "neautentificat" }, { status: 401 });
  return NextResponse.json({ investigations: await listInvestigations(uid) }, { headers:{ "Cache-Control":"no-store" } });
}

export async function POST(req: Request) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "neautentificat" }, { status: 401 });
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({error:"Date invalide."},{status:400});
  const input=body as Record<string,unknown>;
  if(typeof input.title!=="string" || !input.title.trim() || input.title.length>200 ||
    (input.description!==undefined && input.description!==null && (typeof input.description!=="string" || input.description.length>10000)))
    return NextResponse.json({error:"Titlul este obligatoriu (maximum 200 de caractere); descrierea poate avea maximum 10.000."},{status:400});
  const id=await createInvestigation(uid,input.title.trim(),typeof input.description==="string"?input.description.trim()||null:null);
  return NextResponse.json({id},{headers:{"Cache-Control":"no-store"}});
}
