import { NextResponse } from "next/server";
import { getEntityTransactions, getEntityTxYearCounts, type Role, type TxQuery } from "@/lib/marts";
import { devlog } from "@/lib/devlog";

/**
 * GET /api/entity-tx — the entity page's transaction table, client-driven:
 * 10 rows/page, sortable, filterable by year + flag + channel WITHOUT a full
 * page reload. ?id&rol=furnizor|autoritate&page&sort&dir&an&sem&tip=da|contracts
 * With &doar=ani: the records per year of each channel under the signal and
 * excluded filters only (the year panel's counts), no rows.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "id invalid" }, { status: 400 });
  }
  const role: Role = url.searchParams.get("rol") === "autoritate" ? "authority" : "supplier";
  const q: TxQuery = { pageSize: 10, excluded: url.searchParams.get("excluse") === "1" };
  const page = Number(url.searchParams.get("page"));
  q.page = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const sort = url.searchParams.get("sort");
  if (sort === "value" || sort === "date") q.sort = sort;
  const dir = url.searchParams.get("dir");
  if (dir === "asc" || dir === "desc") q.dir = dir;
  const an = url.searchParams.get("an");
  if (an) {
    const ys = an.split(",").filter((y) => /^\d{4}$/.test(y));
    if (ys.length > 0) q.years = ys;
  }
  const sem = url.searchParams.get("sem");
  if (sem && /^[a-z_]{1,40}$/.test(sem)) q.flagCode = sem;
  const tip = url.searchParams.get("tip");
  if (tip === "da" || tip === "contracts") q.src = tip;
  const yearsOnly = url.searchParams.get("doar") === "ani";
  devlog("entity-tx", { id, role, yearsOnly, ...q });

  try {
    if (yearsOnly) {
      const counts = await getEntityTxYearCounts(id, role, { ...(q.flagCode ? { flagCode: q.flagCode } : {}), ...(q.excluded ? { excluded: true } : {}) });
      return NextResponse.json({ ok: true, counts });
    }
    const { rows, total } = await getEntityTransactions(id, role, q);
    return NextResponse.json({ ok: true, rows, total, pageSize: 10 });
  } catch (e) {
    // The technical cause goes to the server log, never to the reader.
    console.error("entity-tx", { id, role, ...q }, e);
    return NextResponse.json(
      { ok: false, error: "Înregistrările nu au putut fi încărcate acum. Încearcă din nou peste câteva momente." },
      { status: 500 },
    );
  }
}
