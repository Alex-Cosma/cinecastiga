import { NextResponse } from "next/server";
import { sessionUserId } from "@/lib/session";
import { createInvestigation, listInvestigations } from "@/lib/anchete";

export async function GET() {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "neautentificat" }, { status: 401 });
  return NextResponse.json({ investigations: await listInvestigations(uid) });
}

export async function POST(req: Request) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "neautentificat" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    title?: string;
    description?: string;
  } | null;
  const title = body?.title?.trim();
  if (!title) return NextResponse.json({ error: "titlu obligatoriu" }, { status: 400 });
  const id = await createInvestigation(uid, title.slice(0, 200), body?.description?.trim() || null);
  return NextResponse.json({ id });
}
