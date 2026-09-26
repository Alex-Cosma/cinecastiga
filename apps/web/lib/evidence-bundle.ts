import { createHash } from "node:crypto";
import type { DbSql } from "@seap/db";
import { getInvestigationAccess, isWorkspaceId, type InvestigationAccess } from "./investigation-access";
import { readInvestigationWorkspace } from "./investigation-workspace";
import { captureDatabase, CAPTURE_METHODOLOGY } from "./evidence-captures";
import { textChunks, zip64, type ZipEntry } from "./evidence-zip";
import type { FrozenRecord } from "./evidence-captures-shared";

const json=(value:unknown)=>JSON.stringify(value,null,2)+"\n";
const md=(value:unknown)=>String(value??"").replace(/[\\`*_{}[\]<>#|]/g,"\\$&");
// All CSV fields are quoted. Text which spreadsheets treat as a formula is
// prefixed with an apostrophe; exact numeric fields remain unchanged.
export function csvCell(value:unknown,numeric=false):string{
  let text=value==null?"":String(value);
  if(!numeric&&/^[\s]*[=+@-]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
const csvLine=(values:unknown[],numerics:number[]=[])=>values.map((v,i)=>csvCell(v,numerics.includes(i))).join(",")+"\r\n";
interface BundleData { investigation:Record<string,unknown>;clips:Record<string,unknown>[];captures:Record<string,unknown>[];workspace:Awaited<ReturnType<typeof readInvestigationWorkspace>>;exportedAt:string }
async function readBundle(q:DbSql,id:string,access:InvestigationAccess):Promise<BundleData>{
  const [investigation]=await q`select id,title,description,status,created_at,updated_at from app.investigations where id=${id}`;
  const clips=await q`select id,kind,ref_id,spec,snapshot,note,pinned,created_at from app.clips where investigation_id=${id} order by created_at,id`;
  const captures=await q`select * from app.evidence_captures where investigation_id=${id} order by clip_id,version`;
  return {investigation:investigation!,clips:[...clips],captures:[...captures],workspace:await readInvestigationWorkspace(q,id,access,{allRevisions:true}),exportedAt:new Date().toISOString()};
}
export function bundleMarkdown(data:BundleData,base:string):string{
  const inv=data.investigation;
  const lines=[`# ${md(inv.title)}`,"",md(inv.description),"",`Exportat: ${data.exportedAt}. Stare: ${md(inv.status)}.`,"",
    "> Valorile sunt date înregistrate, nu plăți verificate. Semnalele statistice sunt piste de verificare, nu dovezi de nereguli.","",
    "Capturile complete sunt înregistrări server ale surselor și selecției la momentul indicat. O versiune nouă nu o înlocuiește pe cea veche. Exportul nu include fișierele originale PDF/P7S. Pasajele din documente păstrează pagina, amprenta și legăturile către originalele arhivate în aplicație și sursa SEAP.","",
    "CSV: sumele și identificatorii sunt text zecimal exact; la import setați aceste coloane ca text. Câmpurile text care ar putea fi formule sunt protejate cu apostrof; JSON păstrează textul original. O valoare goală înseamnă lipsă, nu zero.",""];
  for(const clip of data.clips){
    lines.push(`## ${md(clip.kind)} · ${md(clip.ref_id??clip.id)}`,"",md(clip.note),"");
    if(clip.kind==="document_quote"){
      const s=(clip.snapshot??{}) as Record<string,unknown>;
      lines.push(`### ${md(s.filename)} · pagina ${md(s.page)}`,"",String(s.quote??"").split("\n").map(line=>"> "+md(line)).join("\n"),"",`Text ${s.method==="ocr"?"OCR, de verificat în original":"extras din PDF"}.`,"",`[Pagina originală](${base}/api/documents/${clip.ref_id}/file?kind=pdf#page=${s.page}) · [Original](${base}/api/documents/${clip.ref_id}/file) · [SEAP](${s.sourceUrl})`,"",`SHA-256 original: ${md(s.originalHash)}`,"");
    }
    const versions=data.captures.filter(c=>c.clip_id===clip.id);
    if(!versions.some(c=>c.status==="complete")&&clip.kind!=="note"&&clip.kind!=="document_quote")lines.push("**Fără captură verificată completă.** Datele salvate anterior sunt conținut istoric neverificat; nu reprezintă o listă înghețată de surse.","");
    for(const capture of versions){
      const summary=(capture.summary??{}) as Record<string,unknown>;
      lines.push(`### Versiunea ${capture.version} · ${md(capture.status)}`,"");
      if(capture.status!=="complete"){lines.push(`Nu conține surse publicate. ${md(capture.error)}`,"");continue;}
      if (summary.connectionContext && typeof summary.connectionContext === "object") {
        const connection = summary.connectionContext as Record<string, unknown>;
        lines.push(md(connection.title), "", md(connection.description), "");
      }
      if (summary.peerContext && typeof summary.peerContext === "object") {
        const peer = summary.peerContext as Record<string, unknown>;
        lines.push(md(peer.title), "", md(peer.description), "");
        const cohort = peer.cohort as Record<string,unknown> | undefined;
        const filters = peer.filters as Record<string,unknown> | undefined;
        if(filters)lines.push(`Selecție: ${filters.year === "all" ? "toți anii" : `anul ${md(filters.year)}`}, ${filters.cpv === "all" ? "toate domeniile" : `diviziunea CPV ${md(filters.cpv)}`}, ${filters.dataset==="da"?"achiziții directe":filters.dataset==="contracts"?"contracte atribuite":"achiziții directe și contracte atribuite"}, ${filters.county?`sediul celorlalți membri: ${md(filters.county)}`:"toate județele"}.`,"");
        if (cohort) {
          lines.push(filters?.method==="population"?`Selecție după populația cea mai apropiată, independent de achiziții. Alți membri: ${md(cohort.count)}.`:filters?.method==="manual"?`Grup ales manual. Alți membri: ${md(cohort.count)}.`:`Activitate observată: între ${md(cohort.minimumRecords)} și ${md(cohort.maximumRecords)} înregistrări eligibile. Alți membri: ${md(cohort.count)}.`,"");
          if(cohort.observedMemberCount!==undefined)lines.push(`Membri cu înregistrări eligibile: ${md(cohort.observedMemberCount)} din ${md(cohort.count)}. Membrii fără înregistrări sunt păstrați în grup, dar excluși din mediană. Lipsa datelor nu înseamnă cheltuieli zero.`,"");
          lines.push(cohort.enoughPeers?`Mediana valorii totale, fără entitatea analizată și membrii fără date: ${md(cohort.medianTotalExact??"indisponibilă")} lei. Mediana mediilor pe înregistrare, rotunjită: ${md(cohort.medianMeanRounded??"indisponibilă")} lei.`:"Grup prea mic pentru interpretare comparativă: sunt necesari cel puțin cinci alți membri cu înregistrări eligibile.", "");
        }
        const focal=peer.focal as Record<string,unknown> | undefined;
        const members=[...(focal?[focal]:[]),...(Array.isArray(peer.members)?peer.members as Record<string,unknown>[]:[])];
        const populationColumns=filters?.method==="population"||filters?.method==="manual";
        lines.push(populationColumns?"| Membru | Populație | Diferență populație · % | Înregistrări | Total exact · lei |":"| Membru | Înregistrări | Total exact · lei |", populationColumns?"| --- | ---: | ---: | ---: | ---: |":"| --- | ---: | ---: |");
        const seen=new Set<string>();
        for(const member of members){const entity=member.entity as Record<string,unknown>|undefined;if(!entity||seen.has(String(entity.id)))continue;seen.add(String(entity.id));
          const population=member.population as Record<string,unknown>|undefined;
          lines.push(`| ${md(entity.name)}${entity.id===(focal?.entity as Record<string,unknown>|undefined)?.id?" (entitatea analizată)":member.selectionReason==="manual"?" (ales manual)":""} | ${populationColumns?`${md(population?.value??"Neidentificată")} | ${md(population?.differencePercent??"Indisponibilă")} | `:""}${md(member.recordCount)} | ${Number(member.recordCount)>0?md(member.totalExact):"Fără date eligibile"} |`);}
        lines.push("");
        if(populationColumns){
          lines.push(`Versiunea populației: ${md(filters?.populationVersion)}.`,"");
          const cited=new Set<string>();
          for(const member of members){const population=member.population as Record<string,unknown>|undefined;const entity=member.entity as Record<string,unknown>|undefined;if(!population||!entity||cited.has(String(entity.id)))continue;cited.add(String(entity.id));
            lines.push(`- ${md(population.unitName)}: ${md(population.value)} locuitori; referință ${md(population.referenceDate)}; SIRUTA ${md(population.siruta??"neprecizat")}; rând ${md(population.sourceRow)}; catalog ${md(population.catalogVersion)}. Sursa: ${String(population.sourceUrl??"")}${population.sourceSha256?` (SHA-256: ${md(population.sourceSha256)})`:""}`);}
          lines.push("");
        }
        const methodology=peer.methodology as {descriptions?:unknown[]}|undefined;
        for(const description of methodology?.descriptions??[])lines.push(`- ${md(description)}`);
        lines.push("");
      }
      lines.push(`Înregistrată: ${md(summary.capturedAt??capture.completed_at)}. Rânduri: ${capture.row_count}.`,
        `Sumă exactă a cotelor / achizițiilor: ${capture.total_exact==null?"necunoscută (există valori lipsă)":`${capture.total_exact} RON`}.`,
        `Metodologie: ${md((capture.methodology as Record<string,unknown>)?.version)}.`,
        `[Captură în aplicație](${base}/anchete/${inv.id}/dovezi/${capture.id})`,"",
        "Selecția exactă (inclusiv filtrele locale ale listei):","","```json",json(capture.request).trim(),"```","");
      if(Array.isArray(summary.warnings))for(const warning of summary.warnings)lines.push(`- ${md(warning)}`);
      lines.push("",`Fișiere: captures/${capture.id}/metadata.json, result.json și rows.csv.`,"");
    }
  }
  lines.push("## Caietul anchetei","","Întrebările, ipotezele, notele, sarcinile, evenimentele, relațiile probă–întrebare și istoricul reviziilor sunt incluse în workspace.json.","");
  for(const entry of data.workspace.entries){lines.push(`### ${md(entry.title)}`,"",md(entry.body),"");}
  return lines.join("\n");
}
async function* capturedRows(q:DbSql,id:string):AsyncGenerator<{cursor:string;record:FrozenRecord}>{
  let after="0";
  for(;;){const rows=await q`select row_no::text cursor,record from app.evidence_capture_rows where capture_id=${id} and row_no>${after} order by row_no limit 2000`;
    if(!rows.length)return;for(const row of rows)yield row as {cursor:string;record:FrozenRecord};after=String(rows.at(-1)!.cursor);}
}
async function* rowsCsv(q:DbSql,capture:Record<string,unknown>):AsyncGenerator<Uint8Array>{
  yield Buffer.from(csvLine(["row","stream","reference_id","date","authority_id","authority","supplier_id","supplier","county","cpv","cpv_name","value_exact_ron","contract_full_value_ron","consortium_winners","state","seap_url","ted_url"]));
  let n=0;
  for await(const {cursor,record:r} of capturedRows(q,String(capture.id))){n++;yield Buffer.from(csvLine([cursor,r.src,r.refId,r.date,r.authorityId,r.authority,r.supplierId,r.supplier,r.county,r.cpvCode,r.cpvName,r.valueExact,r.contractValueFull,r.nWinners,r.state,r.sourceUrl,r.tedUrl],[0,2,4,6,11,12,13]));}
  if(n!==Number(capture.row_count))throw new Error("Frozen evidence row count mismatch");
}
async function* rowsJson(q:DbSql,id:string):AsyncGenerator<Uint8Array>{for await(const row of capturedRows(q,id))yield Buffer.from(JSON.stringify(row)+"\n");}
async function* sourcesCsv(q:DbSql,capture:Record<string,unknown>):AsyncGenerator<Uint8Array>{
  yield Buffer.from(csvLine(["row","seap_url","ted_url"]));
  for await(const {cursor,record}of capturedRows(q,String(capture.id)))yield Buffer.from(csvLine([cursor,record.sourceUrl,record.tedUrl],[0]));
  const summary=capture.summary as Record<string,unknown>|null;
  if(Array.isArray(summary?.sourceUrls))for(const url of summary.sourceUrls)yield Buffer.from(csvLine(["context",url,""]));
}
async function* bundleEntries(q:DbSql,data:BundleData,base:string):AsyncGenerator<ZipEntry>{
  const manifest:{path:string;sha256:string;bytes:string}[]=[];
  const entry=(name:string,data:AsyncIterable<Uint8Array>):ZipEntry=>({name,data:(async function*(){const hash=createHash("sha256");let bytes=0n;
    for await(const chunk of data){hash.update(chunk);bytes+=BigInt(chunk.length);yield chunk;}manifest.push({path:name,sha256:hash.digest("hex"),bytes:String(bytes)});})()});
  yield entry("README.md",textChunks(bundleMarkdown(data,base)));
  yield entry("methodology.json",textChunks(json(CAPTURE_METHODOLOGY)));
  yield entry("methodology.md",textChunks(`# Metodologie ${CAPTURE_METHODOLOGY.version}\n\n${Object.values(CAPTURE_METHODOLOGY).slice(2).join("\n\n")}\n\nMetadatele fiecărei versiuni păstrează metodologia, acoperirea importului și selecția efectivă de la momentul capturii.\n`));
  yield entry("workspace.json",textChunks(json(data.workspace)));
  yield entry("clips.json",textChunks(json(data.clips.map(clip=>({...clip,legacyStatus:data.captures.some(c=>c.clip_id===clip.id&&c.status==="complete")?"has-server-capture":clip.kind==="note"?"editorial":clip.kind==="document_quote"?"document-passage":"unverified-legacy-or-pending"})))));
  for(const capture of data.captures){
    const {result,...metadata}=capture,prefix=`captures/${capture.id}`;
    yield entry(`${prefix}/metadata.json`,textChunks(json(metadata)));
    if(capture.status!=="complete")continue;
    yield entry(`${prefix}/result.json`,textChunks(json(result)));
    yield entry(`${prefix}/rows.csv`,rowsCsv(q,capture));
    yield entry(`${prefix}/rows.ndjson`,rowsJson(q,String(capture.id)));
    yield entry(`${prefix}/source_urls.csv`,sourcesCsv(q,capture));
  }
  yield {name:"manifest.json",data:textChunks(json({format:"cinecastiga-evidence-1",exportedAt:data.exportedAt,investigation:data.investigation,
    checksums:"SHA-256 of uncompressed entry bytes; manifest does not hash itself.",files:manifest,
    captures:data.captures.map(c=>({id:c.id,clipId:c.clip_id,version:c.version,status:c.status,rowCount:c.row_count,totalExact:c.total_exact})),
    originalDocumentsArchived:false,partialCapturesIncluded:false}))};
}

/** Private material is read under one authorized snapshot. Streaming applies
 * backpressure; cancellation aborts the transaction. Access is checked in the
 * same snapshot at download start; a subsequent revocation affects new requests
 * and does not block behind an already-running download. */
export async function investigationExport(userId:string,id:string,base:string,format:"zip"|"md",database=captureDatabase()):Promise<Response|null>{
  if(!userId||!isWorkspaceId(id))return null;
  let ready!:(response:Response|null)=>void,reject!:(error:unknown)=>void;
  const response=new Promise<Response|null>((resolve,no)=>{ready=resolve;reject=no;});
  let controller:ReadableStreamDefaultController<Uint8Array>,wake:(()=>void)|undefined,cancelled=false;
  const stream=new ReadableStream<Uint8Array>({start(c){controller=c;},pull(){wake?.();wake=undefined;},cancel(){cancelled=true;wake?.();wake=undefined;}});
  const send=async(chunk:Uint8Array)=>{if(cancelled)throw new Error("Export cancelled");controller.enqueue(chunk);
    while(!cancelled&&(controller.desiredSize??1)<=0)await new Promise<void>(resolve=>{wake=resolve;});
    if(cancelled)throw new Error("Export cancelled");};
  void database.begin("isolation level repeatable read read only",async transaction=>{
    const q=transaction as unknown as DbSql;
    const access=await getInvestigationAccess(userId,id,q);
    if(!access)return null;
    const data=await readBundle(q,id,access);
    ready(new Response(stream,{headers:{"Content-Type":format==="zip"?"application/zip":"text/markdown; charset=utf-8",
      "Content-Disposition":`attachment; filename="ancheta-${id.slice(0,8)}.${format}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}}));
    const chunks=format==="zip"?zip64(bundleEntries(q,data,base)):textChunks(bundleMarkdown(data,base));
    for await(const chunk of chunks)await send(chunk);
    controller.close();return true;
  }).then(found=>{if(found===null){ready(null);controller.close();}},error=>{reject(error);if(!cancelled)controller.error(error);});
  return response;
}
