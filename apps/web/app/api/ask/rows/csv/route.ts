import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { validateSpec } from "@/lib/ask/spec";
import { ground } from "@/lib/ask/ground";
import {
  runRows,
  CSV_MAX_ROWS,
  DRILL_SORTS,
  type DrillOpts,
  type DrillRow,
  type DrillSort,
} from "@/lib/ask/compile";
import { devlog } from "@/lib/devlog";

/**
 * POST /api/ask/rows/csv — full-result CSV export of the drill rows behind an
 * answer: ALL rows matching the spec (not one page), same sort/stream as the
 * on-screen table, capped at CSV_MAX_ROWS. Includes the e-licitatie/TED source
 * links so every exported row stays verifiable.
 */

const g = globalThis as unknown as { __seapAskSql?: DbSql };
function db(): DbSql {
  if (!g.__seapAskSql) g.__seapAskSql = createDb().sql;
  return g.__seapAskSql;
}

function csvQ(s: string | null): string {
  if (s === null || s === "") return "";
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function seapLink(r: DrillRow): string {
  if (r.src === "da") {
    return r.refId ? `https://e-licitatie.ro/pub/direct-acquisition/view/${r.refId}` : "";
  }
  return r.caNoticeId
    ? `https://e-licitatie.ro/pub/notices/ca-notices/view-c/${r.caNoticeId}`
    : "";
}

export async function POST(req: Request) {
  let body: { spec?: unknown; sort?: unknown; dir?: unknown; stream?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Body invalid (JSON)." }, { status: 400 });
  }
  const v = validateSpec(body.spec);
  if ("error" in v) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  const opts: DrillOpts = { limit: CSV_MAX_ROWS };
  if (typeof body.sort === "string" && body.sort in DRILL_SORTS) opts.sort = body.sort as DrillSort;
  if (body.dir === "asc" || body.dir === "desc") opts.dir = body.dir;
  if (body.stream === "da" || body.stream === "contracts") opts.stream = body.stream;
  devlog("csv", { spec: v, ...opts });

  const sql = db();
  try {
    const grounding = await ground(sql, v.filters);
    const result = await runRows(sql, v, grounding, 0, opts);
    if ("error" in result) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
    }
    const header =
      "cod,data,autoritate,judet,furnizor,domeniu_cpv,valoare_ron,sursa,link_seap,link_ted";
    const lines = result.rows.map((r) =>
      [
        csvQ(r.daCode),
        r.date ?? "",
        csvQ(r.authority),
        csvQ(r.county),
        csvQ(r.supplier),
        csvQ(r.cpvName),
        String(r.value),
        r.src === "da" ? "achizitie_directa" : "contract",
        seapLink(r),
        r.tedPubnum ? `https://ted.europa.eu/en/notice/-/detail/${r.tedPubnum}` : "",
      ].join(","),
    );
    const truncated = result.total > result.rows.length;
    const name = truncated
      ? `randuri-primele-${result.rows.length}-din-${result.total}.csv`
      : `randuri-${result.rows.length}.csv`;
    // ﻿ BOM: Excel otherwise misreads UTF-8 diacritics.
    const csv = "﻿" + [header, ...lines].join("\n") + "\n";
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}"`,
        "x-total-rows": String(result.total),
        "x-exported-rows": String(result.rows.length),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const timeout = msg.includes("statement timeout");
    return NextResponse.json(
      {
        ok: false,
        error: timeout
          ? "Exportul a depășit limita de timp (20s). Restrânge întrebarea (un județ, o perioadă) și încearcă din nou."
          : `Eroare la export: ${msg}`,
      },
      { status: timeout ? 200 : 500 },
    );
  }
}
