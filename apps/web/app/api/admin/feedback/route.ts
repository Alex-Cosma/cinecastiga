import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validCollectionOrigin } from "@/lib/admin/collection-origin";
import { feedbackIdValid } from "@/lib/feedback-shared";
import { feedbackStore } from "@/lib/feedback";
export const runtime = "nodejs";
const headers = { "Cache-Control":"private, no-store" };
async function isAdmin(request:Request) { const session = await auth.api.getSession({ headers:request.headers }); return session && (session.user as { role?:string }).role === "admin"; }
export async function GET(request:Request) {
  if (!await isAdmin(request)) return NextResponse.json({ error:"Acces rezervat administratorilor." },{ status:403,headers });
  const page = new URL(request.url).searchParams.get("page") ?? "1";
  if (!/^[1-9]\d{0,5}$/.test(page)) return NextResponse.json({ error:"Pagină invalidă." },{ status:400,headers });
  try { return NextResponse.json(await feedbackStore().list(Number(page)),{ headers }); }
  catch { return NextResponse.json({ error:"Mesajele nu pot fi citite acum. Încearcă din nou." },{ status:503,headers }); }
}
export async function DELETE(request:Request) {
  if (!await isAdmin(request)) return NextResponse.json({ error:"Acces rezervat administratorilor." },{ status:403,headers });
  if (!validCollectionOrigin(request,process.env.NODE_ENV === "production" ? process.env.BETTER_AUTH_URL : undefined)) return NextResponse.json({ error:"Origine neacceptată." },{ status:403,headers });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!feedbackIdValid(id)) return NextResponse.json({ error:"Mesaj invalid." },{ status:400,headers });
  try { await feedbackStore().remove(id); return NextResponse.json({ ok:true },{ headers }); }
  catch { return NextResponse.json({ error:"Ștergerea nu a putut fi confirmată. Reîncearcă." },{ status:503,headers }); }
}
