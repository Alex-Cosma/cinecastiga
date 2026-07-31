import { NextResponse } from "next/server";
import { sessionUserId } from "@/lib/session";
import { deleteClip, updateClip } from "@/lib/anchete";

type Ctx = { params: Promise<{ id: string; cid: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "neautentificat" }, { status: 401 });
  const { id, cid } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    note?: string | null;
    pinned?: boolean;
  } | null;
  if (!body) return NextResponse.json({ error: "corp invalid" }, { status: 400 });
  const patch: { note?: string | null; pinned?: boolean } = {};
  if (body.note !== undefined)
    patch.note = body.note === null ? null : body.note.trim().slice(0, 2000) || null;
  if (body.pinned !== undefined) patch.pinned = !!body.pinned;
  const ok = await updateClip(uid, id, cid, patch);
  if (!ok) return NextResponse.json({ error: "inexistent" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "neautentificat" }, { status: 401 });
  const { id, cid } = await ctx.params;
  const ok = await deleteClip(uid, id, cid);
  if (!ok) return NextResponse.json({ error: "inexistent" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
