import { NextResponse } from "next/server";
import type { DbSql } from "@seap/db";
import { sharedSql } from "@/lib/shared-db";
import { readSignalEvidence } from "@/lib/signal-evidence";
import { readRecordTitles } from "@/lib/source-evidence";
import { readFlaggedDas, type CaseRecord } from "@/lib/signal-case";
import { caseRecordRows } from "@/lib/signal-case-rows";
import { decemberRecords } from "@/lib/signal-mirror";
import { compareRecordRows, parseRecordSort, RECORDS_PAGE } from "@/lib/record-rows";
import { EvidenceBusyError, withEvidenceSlot } from "@/lib/evidence-slots";

export const dynamic = "force-dynamic";
const ID = /^[1-9]\d{0,17}$/;

/**
 * One page of a long case list on an entity's pattern page (owner, 12 November 2026): the signal's records, or one
 * year's December for the year-end pattern, in the order the reader chose, RECORDS_PAGE at a time. The selection is
 * the signal's own sources (lib/signal-evidence.ts), as the page, its CSV and a capture read them; only the rows of
 * the page travel, with their titles. Public sources only.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const query = new URL(request.url).searchParams;
  const entity = query.get("entitate") ?? "";
  const role = query.get("rol") === "furnizor" ? "supplier" : query.get("rol") === "autoritate" ? "authority" : null;
  const list = query.get("lista") === "decembrie" ? "decembrie" : "toate";
  const page = Number(query.get("pagina") ?? 0);
  if (!ID.test(id) || !ID.test(entity) || !role || !Number.isSafeInteger(page) || page < 0 || page > 10_000) {
    return NextResponse.json({ error: "Cerere invalidă." }, { status: 400 });
  }
  const sort = parseRecordSort(query.get("ordine"), query.get("sens"));
  const sql = sharedSql();
  try {
    const result = await withEvidenceSlot(() => sql.begin("isolation level repeatable read read only", async (tx) => {
      const q = tx as unknown as DbSql;
      await q`set local statement_timeout = '30s'`;
      const source = await readSignalEvidence(q, id);
      if (!source) return null;
      const code = String(source.context.code ?? "");
      let records = source.records as CaseRecord[];
      // The year the page shows for the year-end pattern (lib/signal-mirror.ts yearEnd): the evidence's, else the period.
      if (list === "decembrie") records = decemberRecords(records, String((source.context.evidence as Record<string, unknown> | undefined)?.year ?? source.context.period ?? ""));
      const alsoIn = await readFlaggedDas(q, { role, entity });
      // A title order needs every title; the other orders, only the page's.
      const titled = async (rs: readonly CaseRecord[]) => {
        const titles = await readRecordTitles(q, rs);
        return rs.map((r) => ({ ...r, title: titles.get(`${r.src}:${r.refId}`) ?? null }));
      };
      const all = sort.key === "title" ? await titled(records) : records.map((r) => ({ ...r, title: r.title ?? null }));
      const rows = caseRecordRows(all, alsoIn, code).map((row, i) => ({ row, record: all[i]! }));
      rows.sort((a, b) => compareRecordRows(a.row, b.row, sort));
      const pages = Math.max(1, Math.ceil(rows.length / RECORDS_PAGE));
      const current = Math.min(page, pages - 1);
      const slice = rows.slice(current * RECORDS_PAGE, (current + 1) * RECORDS_PAGE);
      const out = sort.key === "title" ? slice.map((s) => s.row)
        : caseRecordRows(await titled(slice.map((s) => s.record)), alsoIn, code).map((row, i) => ({ ...row, key: slice[i]!.row.key }));
      return { rows: out, total: rows.length, page: current, pages };
    }));
    if (!result) return NextResponse.json({ error: "Semnalul nu mai este disponibil." }, { status: 404 });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof EvidenceBusyError) return NextResponse.json({ error: error.message }, { status: 503, headers: { "retry-after": "60" } });
    console.error("semnale/inregistrari", error);
    return NextResponse.json({ error: "Nu am putut citi înregistrările. Încearcă din nou." }, { status: 503 });
  }
}
