import {createDb,type DbSql} from '@seap/db';
import {isWorkspaceId,withInvestigationAccess} from '../investigation-access';
import {WorkspaceError} from '../investigation-workspace';
import {validQuote,type ContractFiles,type ContractFile,type DocumentNotice,type FileJob} from './shared';
const iso=(v:unknown)=>v?new Date(v as string).toISOString():null;
const g=globalThis as unknown as {documentSql?:DbSql};
export const documentDb=()=>g.documentSql??=createDb().sql;
export const documentsEnabled=()=>process.env.DOCUMENTS_ENABLED==='true';
export async function contractNotice(nid:string,q:DbSql=documentDb()):Promise<DocumentNotice|null>{
 if(!/^[1-9]\d{0,17}$/.test(nid))return null;
 // Match imported procurement identity AND authority, never title similarity.
 const rows=await q`select distinct n.c_notice_id::text notice_id,n.notice_no,n.sys_notice_type_id,n.title
   from core.contracts c join core.awards a on a.ca_notice_id=c.ca_notice_id
   join core.notices n on n.authority_entity_id=a.authority_entity_id and n.sys_notice_type_id=17
   where c.ca_notice_contract_id=${nid} and (
     (a.procedure_id is not null and a.procedure_id=n.procedure_id)
     or exists(select 1 from core.notice_award_sources l where l.ca_notice_id=a.ca_notice_id and l.c_notice_id=n.c_notice_id and l.notice_namespace=n.notice_namespace)
   ) limit 2`;
 if(rows.length!==1)return null;
 const r=rows[0]!;return {key:`17:${r.notice_id}`,noticeId:r.notice_id,noticeType:17,noticeNo:r.notice_no,title:r.title??r.notice_no,url:`https://www.e-licitatie.ro/pub/notices/simplified-notice/v2/view/${r.notice_id}`};
}
export async function registerNotice(n:DocumentNotice,q:DbSql=documentDb()){
 await q`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url)
 values(${n.key},${n.noticeId},${n.noticeType},${n.noticeNo},${n.title},${n.url}) on conflict(key) do nothing`;
}
function jobRow(r:Record<string,any>|undefined):FileJob|null{return r?{id:r.id,status:r.status,stage:r.stage,pagesDone:r.pages_done,pagesTotal:r.pages_total,error:r.error,position:Number(r.position??0)}:null;}
export async function getContractFiles(nid:string,q:DbSql=documentDb()):Promise<ContractFiles>{
 const notice=await contractNotice(nid,q);
 const empty:ContractFiles={notice,checkedAt:null,total:null,files:[],job:null,requestCount:0,enabled:documentsEnabled()};
 if(!notice)return empty;
 const [meta]=await q`select * from app.document_notices where key=${notice.key}`;
 if(!meta)return empty;
 const files=await q`select * from app.procurement_documents where notice_key=${notice.key} order by published_at desc nulls last,code`;
 const jobs=await q`select j.*,case when j.status='queued' then (select count(*) from app.document_jobs p where p.status in ('queued','running') and (p.created_at,p.id)<=(j.created_at,j.id)) else 0 end position from app.document_jobs j where j.notice_key=${notice.key} order by created_at desc,id desc`;
 const [requests]=await q`select count(*) n from app.document_requests r join app.document_jobs j on j.id=r.job_id where j.notice_key=${notice.key}`;
 return {...empty,checkedAt:iso(meta.checked_at),total:meta.total,requestCount:Number(requests?.n??0),job:jobRow(jobs.find(j=>j.kind==='list')),
 files:files.map(r=>({id:r.id,code:r.code,filename:r.filename,publishedAt:r.published_at,originalHash:r.original_hash,pdfHash:r.pdf_hash,downloadedAt:iso(r.downloaded_at),processedAt:iso(r.processed_at),pageCount:r.page_count,signature:r.signature,job:jobRow(jobs.find(j=>j.document_id===r.id))}))};
}
export async function enqueueDocument(nid:string,uid:string,documentId:string|null,q:DbSql=documentDb()){
 if(!documentsEnabled())throw new WorkspaceError('Preluarea documentelor nu este activată pe acest server.',503);
 const notice=await contractNotice(nid,q);if(!notice)throw new WorkspaceError('Nu avem o legătură verificată cu un anunț compatibil.',404);
 await registerNotice(notice,q);
 return q.begin(async tx=>{
  const s=tx as unknown as DbSql;
  // Serializes quota checking with dedup across users.
  await s`select pg_advisory_xact_lock(729114,2)`;
  if(documentId){
   if(!isWorkspaceId(documentId))throw new WorkspaceError('Fișier invalid.');
   const [f]=await s`select id,processed_at from app.procurement_documents where id=${documentId} and notice_key=${notice.key}`;
   if(!f)throw new WorkspaceError('Fișierul nu aparține acestei proceduri.',404);
   if(f.processed_at)return {ready:true};
  }else{
   const [n]=await s`select checked_at > now()-interval '24 hours' fresh from app.document_notices where key=${notice.key}`;
   if(n?.fresh)return {cached:true};
  }
  const key=documentId?`file:${documentId}`:`list:${notice.key}`;
  const [existing]=await s`select id from app.document_jobs where dedup_key=${key} and status in ('queued','running')`;
  if(existing)return {id:existing.id};
  const [quota]=await s`select count(*) n from app.document_jobs where requested_by=${uid} and created_at>now()-interval '1 hour'`;
  if(Number(quota?.n)>=20)throw new WorkspaceError('Ai trimis deja 20 de operațiuni în ultima oră. Revino mai târziu.',429);
  const [r]=await s`insert into app.document_jobs(notice_key,document_id,kind,dedup_key,requested_by) values(${notice.key},${documentId},${documentId?'file':'list'},${key},${uid}) returning id`;
  return {id:r!.id};
 });
}
export async function documentRecord(id:string,q:DbSql=documentDb()){
 if(!isWorkspaceId(id))return null;
 const [r]=await q`select d.*,n.url,n.notice_no,n.title notice_title from app.procurement_documents d join app.document_notices n on n.key=d.notice_key where d.id=${id}`;
 return r??null;
}
export async function saveDocumentQuote(uid:string,id:string,input:Record<string,unknown>,q:DbSql=documentDb()){
 const {investigationId,contractId,page,quote,originalHash}=input;
 if(!isWorkspaceId(id)||!isWorkspaceId(investigationId)||typeof contractId!=='string'||!Number.isInteger(page)||Number(page)<1||typeof originalHash!=='string'||(input.note!=null&&typeof input.note!=='string'))throw new WorkspaceError('Pasaj sau destinație invalidă.');
 const saved=await withInvestigationAccess(uid,investigationId,'edit',async s=>{
  const n=await contractNotice(contractId,s);
  const [r]=await s`select d.*,p.text,p.method,n.url,n.notice_no from app.procurement_documents d join app.document_pages p on p.document_id=d.id join app.document_notices n on n.key=d.notice_key where d.id=${id} and p.page=${Number(page)} and d.processed_at is not null`;
  if(!r||n?.key!==r.notice_key||originalHash!==r.original_hash||!validQuote(r.text,quote))throw new WorkspaceError('Pasajul nu corespunde paginii și versiunii păstrate. Redeschide documentul.',409);
  const snapshot={verification:'document-passage',title:`${r.filename} · pagina ${page}`,documentId:id,contractId,page,quote,filename:r.filename,originalHash:r.original_hash,pdfHash:r.pdf_hash,method:r.method,processor:r.processor,sourceUrl:r.url,noticeNo:r.notice_no,downloadedAt:r.downloaded_at,processedAt:r.processed_at};
  const [clip]=await s`insert into app.clips(investigation_id,kind,ref_id,snapshot,note,created_by) values(${investigationId},'document_quote',${id},${JSON.stringify(snapshot)}::jsonb,${typeof input.note==='string'?input.note.trim().slice(0,4000):null},${uid}) returning id`;
  await s`update app.investigations set updated_at=now() where id=${investigationId}`;
  return {id:clip!.id,investigationId};
 },q);
 if(!saved)throw new WorkspaceError('Nu poți adăuga probe în această anchetă.',403);
 return saved;
}
