import type {DbSql} from '@seap/db';
import {collectionDb} from './collection';
import {documentStorage} from './document-storage';
export const DOCUMENT_QUEUE_FILTERS=['download','processing','list','all'] as const;
export type DocumentQueueFilter=typeof DOCUMENT_QUEUE_FILTERS[number];
export interface AdminDocumentJob {
 id:string;documentId:string|null;kind:string;status:string;stage:string;
 filename:string|null;noticeNo:string;noticeTitle:string;noticeUrl:string;
 downloaded:boolean;hasPdf:boolean;pagesDone:number;pagesTotal:number|null;
 createdAt:string;startedAt:string|null;position:number;
}
// Drizzle's shared postgres client returns timestamp strings; normalize on Node for browser portability.
const forBrowser=(job:AdminDocumentJob):AdminDocumentJob=>({...job,createdAt:new Date(job.createdAt).toISOString(),startedAt:job.startedAt?new Date(job.startedAt).toISOString():null});
export async function documentQueueStatus(filter:DocumentQueueFilter='download',requestedPage=1,q:DbSql=collectionDb()){
 if(!DOCUMENT_QUEUE_FILTERS.includes(filter)||!Number.isSafeInteger(requestedPage)||requestedPage<1||requestedPage>100000)throw Error('Filtru de coadă nevalid.');
 const storage=await documentStorage(q);
 return q.begin('isolation level repeatable read read only',async tx=>{
  await tx`set local statement_timeout='5000ms'`;
  const [counts]=await tx`select count(*) filter(where j.status='queued' and j.kind='file' and d.original_hash is null)::int download,
   count(*) filter(where j.status='queued' and j.kind='file' and d.original_hash is not null)::int processing,
   count(*) filter(where j.status='queued' and j.kind='list')::int list,
   count(*) filter(where j.status='queued')::int all,
   count(*) filter(where j.status='running')::int running
   from app.document_jobs j left join app.procurement_documents d on d.id=j.document_id where j.status in ('queued','running')`;
  const summary=counts as unknown as {download:number;processing:number;list:number;all:number;running:number};
  const pageSize=10,total=summary[filter],page=Math.min(requestedPage,Math.max(1,Math.ceil(total/pageSize)));
  const active=await tx`select j.id,j.document_id "documentId",j.kind,j.status,j.stage,d.filename,
   n.notice_no "noticeNo",n.title "noticeTitle",n.url "noticeUrl",d.original_hash is not null downloaded,d.pdf_hash is not null "hasPdf",
   j.pages_done "pagesDone",j.pages_total "pagesTotal",j.created_at "createdAt",j.started_at "startedAt",0::int position
   from app.document_jobs j join app.document_notices n on n.key=j.notice_key left join app.procurement_documents d on d.id=j.document_id
   where j.status='running' order by (j.slot=0) desc,j.created_at,j.id limit 1`;
  const jobs=await tx`with ordered as materialized (
   select j.*,row_number() over(order by created_at,id)::int position from app.document_jobs j where status='queued'
  ) select j.id,j.document_id "documentId",j.kind,j.status,j.stage,d.filename,
   n.notice_no "noticeNo",n.title "noticeTitle",n.url "noticeUrl",d.original_hash is not null downloaded,d.pdf_hash is not null "hasPdf",
   j.pages_done "pagesDone",j.pages_total "pagesTotal",j.created_at "createdAt",j.started_at "startedAt",j.position
   from ordered j join app.document_notices n on n.key=j.notice_key left join app.procurement_documents d on d.id=j.document_id
   where ${filter}='all' or (${filter}='download' and j.kind='file' and d.original_hash is null)
    or (${filter}='processing' and j.kind='file' and d.original_hash is not null) or (${filter}='list' and j.kind='list')
   order by j.created_at,j.id limit ${pageSize} offset ${(page-1)*pageSize}`;
  return {storage,counts:summary,active:active[0]?forBrowser(active[0] as unknown as AdminDocumentJob):null,jobs:(jobs as unknown as AdminDocumentJob[]).map(forBrowser),filter,page,pageSize,total};
 });
}
export type AdminDocumentQueue=Awaited<ReturnType<typeof documentQueueStatus>>;
