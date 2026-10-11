import type {DbSql} from '@seap/db';
import {CLASSIFICATION_VERSION,classifyDocumentContents,classificationPriority,type ClassifiablePart,type Classification} from './classification';

/** No source HTTP or OCR. Reuses filename, member names and existing page text. */
export async function classifyStoredDocument(q:DbSql,document:Record<string,any>){
 if(document.classification?.method==='manual')return false;
 const contents=(document.processed_at?document.contents:document.preparation?.contents??document.contents) as ClassifiablePart[]|undefined;
 const pageNumbers=[...new Set([1,...(contents??[]).map(p=>p.firstPage).filter((n):n is number=>!!n)])];
 const pages=await q`select page,left(text,2500) text from app.document_pages where document_id=${document.id} and page=any(${pageNumbers}::int[]) order by page`;
 const classification=classifyDocumentContents(document.filename,contents,pages.map(p=>({page:Number(p.page),text:String(p.text)})));
 const changed=await q`update app.procurement_documents set classification=${JSON.stringify(classification)}::jsonb,classification_version=${CLASSIFICATION_VERSION},classification_pdf_hash=${document.pdf_hash??null},priority=${classificationPriority(classification)}
  where id=${document.id} and pdf_hash is not distinct from ${document.pdf_hash??null} and coalesce(classification->>'method','')<>'manual' returning id`;
 return changed.length>0;
}
export async function classifyDocumentBatch(q:DbSql,limit=25){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid classification batch size');
 return q.begin(async tx=>{
  await tx`set local statement_timeout='15000ms'`;
  const documents=await tx`select * from app.procurement_documents
   where (classification_version<${CLASSIFICATION_VERSION} or classification_pdf_hash is distinct from pdf_hash)
    and coalesce(classification->>'method','')<>'manual'
   order by classification_version,id limit ${limit} for update skip locked`;
  let changed=0;for(const d of documents)if(await classifyStoredDocument(tx as unknown as DbSql,d))changed++;
  return {inspected:documents.length,changed};
 });
}
export function effectiveClassification(d:{filename:string;classification?:Classification|null;contents?:ClassifiablePart[]|null}){
 return d.classification??classifyDocumentContents(d.filename,d.contents);
}
