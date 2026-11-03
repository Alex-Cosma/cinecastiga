import type {DbSql} from '@seap/db';
import type {DocumentationFile,ListedDocument} from './seap';
import {CLASSIFICATION_VERSION,classificationPriority,classifyDocument} from './classification';

/** One stored file of a notice. A listed file keeps SEAP's document id; a documentation file has none,
 * so its identity is its code, or (families without codes) its part and name, numbered when repeated. */
export type InventoryRow={sourceId:string;code:string;filename:string;publishedAt:string|null;section:string;sourceType:string|null;sourceTypeId:number|null};

export function listRows(list:ListedDocument[]):InventoryRow[]{
 return list.map(d=>({sourceId:String(d.noticeDocumentId),code:d.noticeDocumentCode,filename:d.documentName,
  publishedAt:d.noticeDocumentPostDate??d.publicationDate??null,section:'list',sourceType:d.sysNoticeDocumentType??null,sourceTypeId:d.sysNoticeDocumentTypeId??null}));
}
/** Rows in the order SEAP returned the files, so a row and its transient URL share an index. */
export function documentationRows(docs:DocumentationFile[]):InventoryRow[]{
 const seen=new Map<string,number>();
 return docs.map(d=>{
  const base=d.code?`df:${d.code}`:`df:${d.section}:${d.documentName}`,n=(seen.get(base)??0)+1;seen.set(base,n);
  return {sourceId:n>1?`${base}#${n}`:base,code:d.code??'',filename:d.documentName,publishedAt:null,section:d.section,sourceType:null,sourceTypeId:null};
 });
}
/** The notice's files from both sources. A documentation file that the list also carries (same code) is kept once, as listed. */
export function inventoryRows(list:ListedDocument[],docs:DocumentationFile[]):InventoryRow[]{
 const listed=new Set(list.map(d=>d.noticeDocumentCode));
 return [...listRows(list),...documentationRows(docs).filter(r=>!r.code||!listed.has(r.code))];
}
/** Inserts new files; on a file already held, refreshes only SEAP's metadata (never its identity or name). */
export async function storeInventory(tx:DbSql,noticeKey:string,rows:InventoryRow[]){
 for(const r of rows){
  const c=classifyDocument(r.filename,undefined,{section:r.section,sourceType:r.sourceType});
  await tx`insert into app.procurement_documents(notice_key,source_id,code,filename,published_at,classification,classification_version,priority,section,source_type,source_type_id)
   values(${noticeKey},${r.sourceId},${r.code},${r.filename},${r.publishedAt},${JSON.stringify(c)}::jsonb,${CLASSIFICATION_VERSION},${classificationPriority(c)},${r.section},${r.sourceType},${r.sourceTypeId})
   on conflict(notice_key,source_id) do update set published_at=coalesce(excluded.published_at,app.procurement_documents.published_at),section=excluded.section,
    source_type=coalesce(excluded.source_type,app.procurement_documents.source_type),source_type_id=coalesce(excluded.source_type_id,app.procurement_documents.source_type_id)`;
 }
}
