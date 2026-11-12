import { NextResponse } from "next/server";
import { sharedSql } from "@/lib/shared-db";
import { readSignalEvidence } from "@/lib/signal-evidence";
import { readRadiografieEvidence, validateRadiografieSelection } from "@/lib/radiografie-evidence";
import { evidenceCsv } from "@/lib/ask/evidence";
import { readRecordTitles } from "@/lib/source-evidence";
import { EvidenceBusyError, withEvidenceSlot } from "@/lib/evidence-slots";

/** Public procurement sources. This endpoint never reads private case tables. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const kind = query.get("kind"), id = query.get("id") ?? "";
  if (!/^[1-9]\d{0,17}$/.test(id) || !["signal", "radiografie"].includes(kind ?? "")) return NextResponse.json({ error: "Selecție de surse invalidă." }, { status: 400 });
  const selection = validateRadiografieSelection({ type: query.get("type"), supplierId: query.get("supplierId"), patternId: query.get("patternId"), ...(query.has("expectedFingerprint")?{expectedFingerprint:query.get("expectedFingerprint")}:{}) });
  if (kind === "radiografie" && !selection) return NextResponse.json({ error: "Tipar invalid." }, { status: 400 });
  const json = query.get("format") === "json";
  const page = Number(query.get("page") ?? 0);
  if (json && (!Number.isSafeInteger(page) || page < 0 || page > 4000)) return NextResponse.json({error:"Pagină invalidă."},{status:400});
  const sql = sharedSql();
  try {
    // A few full source reads at once in the process (lib/evidence-slots.ts).
    const evidence = await withEvidenceSlot(() => sql.begin("isolation level repeatable read read only", async tx => {
      await tx`set local statement_timeout = '30s'`;
      return kind === "signal" ? readSignalEvidence(tx as unknown as typeof sql, id) : readRadiografieEvidence(tx as unknown as typeof sql, id, selection);
    }));
    if (!evidence) return NextResponse.json({ error: "Sursele nu mai sunt disponibile." }, { status: 404 });
    if (json) {
      const currentPage = Math.min(page, Math.max(0, Math.ceil(evidence.sourceCount / 50) - 1));
      const records=evidence.records.slice(currentPage*50,currentPage*50+50);
      const titles = await readRecordTitles(sql, records);
      return NextResponse.json({...evidence, records:records.map(r=>({...r,title:titles.get(`${r.src}:${r.refId}`)??null})),page:currentPage}, {headers:{"cache-control":"no-store"}});
    }
    const csv = evidenceCsv(evidence.records.map(row => ({ ...row, valueExact: row.originalValueExact === null ? "" : row.valueExact })));
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store",
      "content-disposition": `attachment; filename="surse-${kind}-${id}.csv"`, "x-source-rows": String(evidence.sourceCount),
      "x-source-methodology": evidence.methodology, "x-source-warnings": String(evidence.warnings.length),
      "x-source-missing-values": String(evidence.records.filter(row => row.originalValueExact === null).length) } });
  } catch (error) {
    if (error instanceof EvidenceBusyError) return NextResponse.json({ error: error.message }, { status: 503, headers: { "retry-after": "60" } });
    const bounded = error instanceof Error && error.message.startsWith("Această selecție depășește");
    return NextResponse.json({ error: bounded ? error.message : "Exportul nu a putut fi generat. Încearcă din nou sau restrânge selecția." }, { status: bounded ? 413 : 503 });
  }
}
