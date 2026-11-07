import { NextResponse } from "next/server";
import { sessionUserId } from "@/lib/session";
import { createInvestigation, listInvestigations } from "@/lib/anchete";
import { readClipSubject, readSavedIn } from "@/lib/clip-subject";

/** The dossiers of the account. With `kind` and `ref` (the save dialog), also which of them already hold that item
 *  (`savedIn`: dossier id → item id) and what the item is (`subject`), so a second save is never silent. */
export async function GET(req: Request) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "neautentificat" }, { status: 401 });
  const url = new URL(req.url), kind = url.searchParams.get("kind"), ref = url.searchParams.get("ref");
  let spec: unknown = null;
  try { spec = JSON.parse(url.searchParams.get("spec") ?? "null"); } catch { spec = null; }
  const [investigations, savedIn, subject] = await Promise.all([listInvestigations(uid),
    kind && ref ? readSavedIn(uid, kind, ref, spec) : Promise.resolve({}),
    kind && ref ? readClipSubject(kind, ref).catch(() => null) : Promise.resolve(null)]);
  return NextResponse.json({ investigations, ...(kind ? { savedIn, subject } : {}) }, { headers:{ "Cache-Control":"no-store" } });
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
