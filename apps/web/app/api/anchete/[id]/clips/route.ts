import { after, NextResponse } from "next/server";
import { captureRequestError, processCapture } from "@/lib/evidence-captures";
import { sessionUserId } from "@/lib/session";
import { addClip, CLIP_KINDS, type ClipKind } from "@/lib/anchete";

export const runtime="nodejs";
export const maxDuration=900;
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "neautentificat" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    kind?: string;
    refId?: string | null;
    spec?: unknown;
    note?: string | null;
    snapshot?: Record<string, unknown> | null;
  } | null;
  if (!body || !CLIP_KINDS.includes(body.kind as ClipKind) || (body.note !== undefined && body.note !== null && typeof body.note !== "string"))
    return NextResponse.json({ error: "tip invalid" }, { status: 400 });
  try {
  const res = await addClip(uid, id, {
    kind: body.kind as ClipKind,
    refId: body.refId ?? null,
    spec: body.spec ?? null,
    note: body.note?.trim().slice(0, 2000) || null,
    clientSnapshot: body.snapshot ?? null,
  });
  if ("error" in res) return NextResponse.json(res, { status: 400 });
  if(res.captureId)after(()=>processCapture(uid,id,res.captureId!));
  return NextResponse.json(res,{status:res.captureId?202:200,headers:{"cache-control":"no-store"}});
  }catch(error){
    const message=captureRequestError(error);
    if(message)return NextResponse.json({error:message},{status:400,headers:{"cache-control":"no-store"}});
    throw error;
  }
}
