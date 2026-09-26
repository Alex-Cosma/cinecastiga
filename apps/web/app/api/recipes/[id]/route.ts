import { NextResponse } from "next/server";
import { sessionUserId } from "@/lib/session";
import { recipeStore } from "@/lib/recipes";
import { recipeIdValid, recipeInput } from "@/lib/ask/recipe-input";
const headers = { "cache-control":"private, no-store" };
type Context = { params:Promise<{ id:string }> };
export async function GET(req: Request, context: Context) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error:"Autentificare necesară." }, { status:401, headers });
  const { id } = await context.params;
  if (!recipeIdValid(id)) return NextResponse.json({ error:"Rețetă negăsită." }, { status:404, headers });
  const raw = new URL(req.url).searchParams.get("version");
  if (raw !== null && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1)) return NextResponse.json({ error:"Versiune invalidă." }, { status:400, headers });
  const recipe = await recipeStore().open(uid, id, raw === null ? undefined : Number(raw));
  return recipe ? NextResponse.json({ recipe }, { headers }) : NextResponse.json({ error:"Rețetă sau versiune negăsită." }, { status:404, headers });
}
export async function POST(req: Request, context: Context) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error:"Autentificare necesară." }, { status:401, headers });
  const { id } = await context.params;
  if (!recipeIdValid(id)) return NextResponse.json({ error:"Rețetă negăsită." }, { status:404, headers });
  const input = recipeInput(await req.json().catch(() => null), true);
  if ("error" in input) return NextResponse.json(input, { status:400, headers });
  const result = await recipeStore().revise(uid, id, input);
  if ("error" in result) return NextResponse.json({ error:result.error === "missing" ? "Rețetă negăsită." : "Rețeta are o versiune mai nouă. Redeschide-o sau salvează separat; modificările tale sunt păstrate." }, { status:result.error === "missing" ? 404 : 409, headers });
  return NextResponse.json(result, { status:201, headers });
}
