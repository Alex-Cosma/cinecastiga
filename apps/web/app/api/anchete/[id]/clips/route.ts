import { NextResponse } from "next/server";
import { sessionUserId } from "@/lib/session";
import { addClip, CLIP_KINDS, type ClipKind } from "@/lib/anchete";

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
  if (!body || !CLIP_KINDS.includes(body.kind as ClipKind))
    return NextResponse.json({ error: "tip invalid" }, { status: 400 });
  const res = await addClip(uid, id, {
    kind: body.kind as ClipKind,
    refId: body.refId ?? null,
    spec: body.spec ?? null,
    note: body.note?.trim().slice(0, 2000) || null,
    clientSnapshot: body.snapshot ?? null,
  });
  if ("error" in res) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}
