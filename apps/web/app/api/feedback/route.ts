import { NextResponse } from "next/server";
import { validCollectionOrigin } from "@/lib/admin/collection-origin";
import { feedbackInput } from "@/lib/feedback-shared";
import { feedbackBody } from "@/lib/feedback-http";
import { feedbackClientKey, feedbackStore, FeedbackConflictError, FeedbackLimitError } from "@/lib/feedback";
export const runtime = "nodejs";
const headers = { "Cache-Control":"no-store" };
export async function POST(request:Request) {
  const production = process.env.NODE_ENV === "production";
  if (!validCollectionOrigin(request,production ? process.env.BETTER_AUTH_URL : undefined)) return NextResponse.json({ error:"Pagina a expirat. Reîncarcă și încearcă din nou." },{ status:403,headers });
  let body:unknown;
  try { body = await feedbackBody(request); } catch (e) { return NextResponse.json({ error:"Formular invalid sau prea mare. Trimite cel mult 3.000 de caractere." },{ status:e instanceof Error && e.message === "size" ? 413 : 400,headers }); }
  const input = feedbackInput(body);
  if ("error" in input) return NextResponse.json(input,{ status:400,headers });
  try {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error("Feedback secret unavailable");
    await feedbackStore().submit(input,feedbackClientKey(request,secret,production));
    return NextResponse.json({ ok:true },{ status:201,headers });
  } catch (e) {
    if (e instanceof FeedbackLimitError) return NextResponse.json({ error:"Au fost trimise prea multe mesaje într-un interval scurt. Încearcă din nou mai târziu; mesajul tău rămâne în formular." },{ status:429,headers:{ ...headers,"Retry-After":"600" } });
    if (e instanceof FeedbackConflictError) return NextResponse.json({ error:"Acest formular a fost deja trimis. Închide-l și deschide unul nou pentru alt mesaj." },{ status:409,headers });
    return NextResponse.json({ error:"Mesajul nu a putut fi confirmat. Încearcă din nou; aceeași trimitere nu va crea un duplicat." },{ status:503,headers });
  }
}
