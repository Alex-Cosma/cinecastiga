import { NextResponse } from "next/server";
import { sessionUserId } from "@/lib/session";
import { recipeStore } from "@/lib/recipes";
import { recipeInput } from "@/lib/ask/recipe-input";
const headers = { "cache-control":"private, no-store" };
export async function GET() {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error:"Autentifică-te pentru rețetele tale private." }, { status:401, headers });
  return NextResponse.json({ recipes:await recipeStore().list(uid) }, { headers });
}
export async function POST(req: Request) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error:"Autentifică-te pentru a salva o rețetă privată." }, { status:401, headers });
  const input = recipeInput(await req.json().catch(() => null));
  if ("error" in input) return NextResponse.json(input, { status:400, headers });
  return NextResponse.json(await recipeStore().create(uid, input), { status:201, headers });
}
