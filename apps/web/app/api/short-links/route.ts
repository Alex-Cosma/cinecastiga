import { NextResponse } from "next/server";
import { validCollectionOrigin } from "@/lib/admin/collection-origin";
import { SHORT_LINK_PATH, SHORT_TARGET_MAX, shortLinkTarget } from "@/lib/short-links-shared";
import { shortLinkClientKey, shortLinkStore, ShortLinkLimitError } from "@/lib/short-links";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

/** POST {target: <a path of the site>} → {path: "/l/k7Qm2xPa"}. The page copies the long address when this fails. */
export async function POST(request: Request) {
  const production = process.env.NODE_ENV === "production";
  if (!validCollectionOrigin(request, production ? process.env.BETTER_AUTH_URL : undefined)) return NextResponse.json({ error: "Pagina a expirat." }, { status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Format invalid." }, { status: 400, headers });
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > SHORT_TARGET_MAX + 64) return NextResponse.json({ error: "Adresa e prea lungă." }, { status: 413, headers });
    body = JSON.parse(text);
  } catch { return NextResponse.json({ error: "Format invalid." }, { status: 400, headers }); }
  const target = shortLinkTarget(body && typeof body === "object" ? (body as { target?: unknown }).target : null);
  if (!target) return NextResponse.json({ error: "Adresa nu poate fi scurtată." }, { status: 400, headers });
  try {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error("Short link secret unavailable");
    const code = await shortLinkStore().create(target, shortLinkClientKey(request, secret, production));
    return NextResponse.json({ path: `${SHORT_LINK_PATH}${code}` }, { status: 200, headers });
  } catch (e) {
    if (e instanceof ShortLinkLimitError) return NextResponse.json({ error: "Prea multe linkuri noi într-un interval scurt." }, { status: 429, headers: { ...headers, "Retry-After": "600" } });
    return NextResponse.json({ error: "Linkul scurt nu a putut fi creat." }, { status: 503, headers });
  }
}
