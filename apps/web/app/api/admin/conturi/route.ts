import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { adminSession, allAccounts } from "@/lib/admin/accounts";
import { ACCOUNT_COLUMNS, ACCOUNT_READERS } from "@/lib/admin/table-columns";
import { readFilters } from "@/lib/table-filters/codec";
import { memoryFacet } from "@/lib/table-filters/memory";

/** GET /api/admin/conturi?optiuni=<column>[&cauta=…] plus the columns' parameters: one funnel of the accounts table (admins only). */
export async function GET(req: Request) {
  const h = await headers();
  if (!(await adminSession(h))) return NextResponse.json({ ok: false, error: "Doar pentru administratori." }, { status: 403 });
  const url = new URL(req.url);
  const get = (key: string) => url.searchParams.get(key);
  const key = get("optiuni") ?? "";
  if (!ACCOUNT_COLUMNS.some((c) => c.key === key)) return NextResponse.json({ ok: false, error: "coloană necunoscută" }, { status: 400 });
  const users = await allAccounts(h);
  const emails = new Map(users.map((u) => [u.id, u.email]));
  const facet = memoryFacet(ACCOUNT_COLUMNS, ACCOUNT_READERS, users, key, readFilters(ACCOUNT_COLUMNS, get),
    { term: (get("cauta") ?? "").slice(0, 80), labelOf: (v) => (key === "cont" ? emails.get(v) : undefined) });
  return NextResponse.json({ ok: true, facet }, { headers: { "cache-control": "no-store" } });
}
