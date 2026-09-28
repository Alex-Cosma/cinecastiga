import { NextResponse } from "next/server";
import { createDb } from "@seap/db";
import { readSignalEvidence } from "@/lib/signal-evidence";
import { readRadiografieEvidence, validateRadiografieSelection } from "@/lib/radiografie-evidence";
import { evidenceCsv } from "@/lib/ask/evidence";

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
  const { sql } = createDb();
  try {
    const evidence = await sql.begin("isolation level repeatable read read only", async tx => {
      await tx`set local statement_timeout = '30s'`;
      return kind === "signal" ? readSignalEvidence(tx as unknown as typeof sql, id) : readRadiografieEvidence(tx as unknown as typeof sql, id, selection);
    });
    if (!evidence) return NextResponse.json({ error: "Sursele nu mai sunt disponibile." }, { status: 404 });
    if (json) {
      const currentPage = Math.min(page, Math.max(0, Math.ceil(evidence.sourceCount / 50) - 1));
      const records=evidence.records.slice(currentPage*50,currentPage*50+50);
      const daIds=records.filter(r=>r.src==="da").map(r=>r.refId),contractIds=records.filter(r=>r.src==="contracts").map(r=>r.refId);
      const titles = new Map<string,string>();
      if(daIds.length)for(const row of await sql`select da.sicap_da_id::text id, raw.payload->>'directAcquisitionName' title from core.direct_acquisitions da left join raw.raw_documents raw on raw.id=da.raw_id where da.sicap_da_id=any(${daIds}::bigint[])`)if(row.title)titles.set(`da:${row.id}`,String(row.title));
      if(contractIds.length)for(const row of await sql`select ca_notice_contract_id::text id,title from core.contracts where ca_notice_contract_id=any(${contractIds}::bigint[])`)if(row.title)titles.set(`contracts:${row.id}`,String(row.title));
      return NextResponse.json({...evidence, records:records.map(r=>({...r,title:titles.get(`${r.src}:${r.refId}`)??null})),page:currentPage}, {headers:{"cache-control":"no-store"}});
    }
    const csv = evidenceCsv(evidence.records.map(row => ({ ...row, valueExact: row.originalValueExact === null ? "" : row.valueExact })));
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store",
      "content-disposition": `attachment; filename="surse-${kind}-${id}.csv"`, "x-source-rows": String(evidence.sourceCount),
      "x-source-methodology": evidence.methodology, "x-source-warnings": String(evidence.warnings.length),
      "x-source-missing-values": String(evidence.records.filter(row => row.originalValueExact === null).length) } });
  } catch (error) {
    const bounded = error instanceof Error && error.message.startsWith("Această selecție depășește");
    return NextResponse.json({ error: bounded ? error.message : "Exportul nu a putut fi generat. Încearcă din nou sau restrânge selecția." }, { status: bounded ? 413 : 503 });
  } finally { await sql.end(); }
}
