import { NextResponse } from "next/server";
import { getEntityTransactions, getEntityTxYears, type Role, type TxQuery } from "@/lib/marts";
import { devlog } from "@/lib/devlog";

/**
 * GET /api/entity-tx — the entity page's transaction table, client-driven:
 * 10 rows/page, sortable, filterable by year + flag WITHOUT a full page
 * reload. ?id&rol=furnizor|autoritate&page&sort&dir&an&sem
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "id invalid" }, { status: 400 });
  }
  const role: Role = url.searchParams.get("rol") === "autoritate" ? "authority" : "supplier";
  const q: TxQuery = { pageSize: 10 };
  const page = Number(url.searchParams.get("page"));
  q.page = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const sort = url.searchParams.get("sort");
  if (sort === "value" || sort === "date" || sort === "gap") q.sort = sort;
  const dir = url.searchParams.get("dir");
  if (dir === "asc" || dir === "desc") q.dir = dir;
  const an = url.searchParams.get("an");
  if (an) {
    const ys = an.split(",").filter((y) => /^\d{4}$/.test(y));
    if (ys.length > 0) q.years = ys;
  }
  const sem = url.searchParams.get("sem");
  if (sem && /^[a-z_]{1,40}$/.test(sem)) q.flagCode = sem;
  devlog("entity-tx", { id, role, ...q });

  try {
    const [{ rows, total }, years] = await Promise.all([
      getEntityTransactions(id, role, q),
      getEntityTxYears(id, role),
    ]);
    return NextResponse.json({ ok: true, rows, total, years, pageSize: 10 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Eroare: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
