import { NextResponse } from "next/server";
import { getEntityPartnersPaged, type Role } from "@/lib/marts";
import { devlog } from "@/lib/devlog";

/**
 * GET /api/entity-partners — the entity page's counterparty list, paginated
 * client-side (10/page) across both channels (DAs + contract awards).
 * ?id&rol=furnizor|autoritate&page
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "id invalid" }, { status: 400 });
  }
  const role: Role = url.searchParams.get("rol") === "autoritate" ? "authority" : "supplier";
  const pageRaw = Number(url.searchParams.get("page"));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  devlog("entity-partners", { id, role, page });
  try {
    const { rows, total } = await getEntityPartnersPaged(id, role, page, 10);
    return NextResponse.json({ ok: true, rows, total, pageSize: 10 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Eroare: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
