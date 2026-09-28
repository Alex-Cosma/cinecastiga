import { NextResponse } from "next/server";
import { sessionUserId } from "@/lib/session";
import { recipeStore, RecipeTitleTakenError } from "@/lib/recipes";
import { recipeInput } from "@/lib/ask/recipe-input";
const headers = { "cache-control":"private, no-store" };
export async function GET(req: Request) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error:"Autentifică-te pentru întrebările tale salvate." }, { status:401, headers });
  const copyTitle = new URL(req.url).searchParams.get("copyTitle");
  if (copyTitle !== null) {
    if (!copyTitle.trim() || copyTitle.length > 160) return NextResponse.json({ error:"Alege un nume de cel mult 160 de caractere." }, { status:400, headers });
    return NextResponse.json({ title:await recipeStore().suggestCopyTitle(uid, copyTitle) }, { headers });
  }
  return NextResponse.json({ recipes:await recipeStore().list(uid, new URL(req.url).searchParams.get("q")?.trim().slice(0,160) ?? "") }, { headers });
}
export async function POST(req: Request) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error:"Autentifică-te pentru a salva întrebarea." }, { status:401, headers });
  const input = recipeInput(await req.json().catch(() => null));
  if ("error" in input) return NextResponse.json(input, { status:400, headers });
  try { return NextResponse.json(await recipeStore().create(uid, input), { status:201, headers }); }
  catch (e) {
    if (e instanceof RecipeTitleTakenError) return NextResponse.json({ error:e.message, code:"title_taken" }, { status:409, headers });
    throw e;
  }
}
