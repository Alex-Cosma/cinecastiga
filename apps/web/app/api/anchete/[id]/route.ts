import { NextResponse } from "next/server";
import { sessionUserId } from "@/lib/session";
import {
  deleteInvestigation,
  getDosar,
  INV_STATUSES,
  updateInvestigation,
  type InvStatus,
} from "@/lib/anchete";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "neautentificat" }, { status: 401 });
  const { id } = await ctx.params;
  const dosar = await getDosar(uid, id);
  if (!dosar) return NextResponse.json({ error: "inexistent" }, { status: 404 });
  return NextResponse.json(dosar, { headers:{ "Cache-Control":"no-store" } });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "neautentificat" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    title?: string;
    description?: string | null;
    status?: string;
  } | null;
  if (!body || typeof body!=="object" || Array.isArray(body) ||
    (body.title!==undefined && (typeof body.title!=="string" || body.title.length>200)) ||
    (body.description!==undefined && body.description!==null && (typeof body.description!=="string" || body.description.length>10000)))
    return NextResponse.json({ error: "Titlul poate avea maximum 200 de caractere; descrierea maximum 10.000." }, { status: 400 });
  const patch: { title?: string; description?: string | null; status?: InvStatus } = {};
  if (body.title !== undefined) {
    const tt = body.title.trim();
    if (!tt) return NextResponse.json({ error: "titlu gol" }, { status: 400 });
    patch.title = tt.slice(0, 200);
  }
  if (body.description !== undefined)
    patch.description = body.description === null ? null : body.description.trim() || null;
  if (body.status !== undefined) {
    if (!INV_STATUSES.includes(body.status as InvStatus))
      return NextResponse.json({ error: "status invalid" }, { status: 400 });
    patch.status = body.status as InvStatus;
  }
  const ok = await updateInvestigation(uid, id, patch);
  if (!ok) return NextResponse.json({ error: "inexistent" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "neautentificat" }, { status: 401 });
  const { id } = await ctx.params;
  const ok = await deleteInvestigation(uid, id);
  if (!ok) return NextResponse.json({ error: "inexistent" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
