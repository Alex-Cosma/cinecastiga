import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validCollectionOrigin } from "@/lib/admin/collection-origin";
import { adminFacts, decideFact, type FactAction, type FactChange } from "@/lib/facts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const ACTIONS: readonly FactAction[] = ["publish", "schedule", "reject", "withdraw", "restore", "edit"];

async function admin(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  return s && (s.user as { role?: string }).role === "admin" ? s.user : null;
}

/** The facts of „Știați că” for the console: proposals, scheduled, published and the rest (migration 0118). */
export async function GET(req: Request) {
  if (!await admin(req)) return NextResponse.json({ error: "Acces rezervat administratorilor." }, { status: 403, headers });
  try { return NextResponse.json(await adminFacts(), { headers }); }
  catch { return NextResponse.json({ error: "Lista faptelor nu poate fi citită acum." }, { status: 503, headers }); }
}

/** { id, action, publishOn?, figure?, unit?, statement?, context? }: an administrator's choice on one fact. */
export async function POST(req: Request) {
  const user = await admin(req);
  if (!user) return NextResponse.json({ error: "Acces rezervat administratorilor." }, { status: 403, headers });
  if (!validCollectionOrigin(req, process.env.NODE_ENV === "production" ? process.env.BETTER_AUTH_URL : undefined)) return NextResponse.json({ error: "Origine neacceptată." }, { status: 403, headers });
  if (!req.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Format neacceptat." }, { status: 415, headers });
  const raw = await req.text();
  if (raw.length > 4096) return NextResponse.json({ error: "Cerere prea mare." }, { status: 413, headers });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); if (!body || typeof body !== "object" || Array.isArray(body)) throw Error(); }
  catch { return NextResponse.json({ error: "Cerere invalidă." }, { status: 400, headers }); }
  const { id, action } = body;
  if (typeof id !== "string" || !/^\d{1,12}$/.test(id) || !ACTIONS.includes(action as FactAction)) return NextResponse.json({ error: "Cerere invalidă." }, { status: 400, headers });
  const change: FactChange = {};
  for (const key of ["publishOn", "figure", "unit", "statement", "context"] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "string") return NextResponse.json({ error: "Cerere invalidă." }, { status: 400, headers });
    change[key] = body[key] as string;
  }
  try {
    if (!await decideFact(id, action as FactAction, change, user.name || user.email)) return NextResponse.json({ error: "Alegerea nu se potrivește cu starea faptului. Actualizează lista." }, { status: 409, headers });
    return NextResponse.json({ ok: true }, { headers });
  } catch { return NextResponse.json({ error: "Alegerea nu a fost salvată. Reîncearcă." }, { status: 503, headers }); }
}
