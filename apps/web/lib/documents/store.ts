import {createDb,type DbSql} from '@seap/db';
import {isWorkspaceId,withInvestigationAccess} from '../investigation-access';
import {WorkspaceError} from '../investigation-workspace';
import {validQuote,noticeViewUrl,awardViewUrl,awardDocumentsKey,AWARD_NOTICE_TYPE,DOCUMENT_NOTICE_TYPES,type AwardAttachments,type ContractFiles,type ContractFile,type DocumentNotice,type FileJob} from './shared';
import {effectiveClassification} from './classify';
const iso=(v:unknown)=>v?new Date(v as string).toISOString():null;
const g=globalThis as unknown as {documentSql?:DbSql};
export const documentDb=()=>g.documentSql??=createDb().sql;
export const documentsEnabled=()=>process.env.DOCUMENTS_ENABLED==='true';
export async function contractNotice(nid:string,q:DbSql=documentDb()):Promise<DocumentNotice|null>{
 if(!/^[1-9]\d{0,17}$/.test(nid))return null;
 // Match imported procurement identity AND authority, never title similarity.
 const rows=await q`select distinct n.c_notice_id::text notice_id,n.notice_no,n.sys_notice_type_id,n.title
   from core.contracts c join core.awards a on a.ca_notice_id=c.ca_notice_id
   join core.notices n on n.authority_entity_id=a.authority_entity_id and n.sys_notice_type_id=any(${DOCUMENT_NOTICE_TYPES}::int[])
   where c.ca_notice_contract_id=${nid} and (
     (a.procedure_id is not null and a.procedure_id=n.procedure_id)
     or exists(select 1 from core.notice_award_sources l where l.ca_notice_id=a.ca_notice_id and l.c_notice_id=n.c_notice_id and l.notice_namespace=n.notice_namespace)
   ) limit 2`;
 if(rows.length!==1)return null;
 const r=rows[0]!,type=Number(r.sys_notice_type_id);
 return {key:`${type}:${r.notice_id}`,noticeId:r.notice_id,noticeType:type,noticeNo:r.notice_no,title:r.title??r.notice_no,url:noticeViewUrl(type,r.notice_id)};
}
export async function registerNotice(n:DocumentNotice,q:DbSql=documentDb()){
 await q`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url)
 values(${n.key},${n.noticeId},${n.noticeType},${n.noticeNo},${n.title},${n.url}) on conflict(key) do nothing`;
}
/** Negotiation without prior publication: the law gives it no participation notice. */
export const NO_PARTICIPATION_NOTICE='Negociere fara publicare prealabila';
/** The award as a source of its own documents, their count in the award's collected detail (ackDocsCount) and
 * whether the procedure has a participation notice at all (its type). No source traffic. */
async function awardContext(nid:string,q:DbSql):Promise<{source:DocumentNotice|null;count:number|null;detailAt:string|null;withoutNotice:boolean}>{
 const none={source:null,count:null,detailAt:null,withoutNotice:false};
 if(!/^[1-9]\d{0,17}$/.test(nid))return none;
 const [r]=await q`select a.ca_notice_id::text ca_notice_id,a.notice_no,coalesce(a.title,a.notice_no) title,a.procedure_type,d.count,d.fetched_at
  from core.contracts c join core.awards a on a.ca_notice_id=c.ca_notice_id
  left join lateral (select (r.payload#>>'{data,ackDocsCount}')::int count,r.fetched_at from raw.raw_documents r
   where r.source='elicitatie' and r.external_id='award:'||a.ca_notice_id and r.endpoint_version='award-detail-root:v2' order by r.fetched_at desc,r.id desc limit 1) d on true
  where c.ca_notice_contract_id=${nid} limit 1`;
 if(!r)return none;
 const source=/^CAN\d+$/.test(r.notice_no??'')?{key:awardDocumentsKey(r.ca_notice_id),noticeId:r.ca_notice_id,noticeType:AWARD_NOTICE_TYPE,noticeNo:r.notice_no,title:r.title,url:awardViewUrl(r.ca_notice_id)}:null;
 return {source,count:Number.isInteger(r.count)&&r.count>=0?r.count:null,detailAt:iso(r.fetched_at),withoutNotice:r.procedure_type===NO_PARTICIPATION_NOTICE};
}
/** The document sources of a contract: its participation notice and its award, as far as each is known. */
export async function contractFileKeys(nid:string,q:DbSql=documentDb()){
 const [notice,context]=await Promise.all([contractNotice(nid,q),awardContext(nid,q)]);
 return [notice?.key,context.source?.key].filter((k):k is string=>!!k);
}
function jobRow(r:Record<string,any>|undefined):FileJob|null{return r?{id:r.id,status:r.status,stage:r.stage,pagesDone:r.pages_done,pagesTotal:r.pages_total,error:r.error,position:Number(r.position??0),automatic:!!r.automatic}:null;}
/** One source's files, its list job and its requests. A visitor's request waits behind every earlier request made by anyone. */
async function sourceState(key:string,q:DbSql){
 const [meta]=await q`select * from app.document_notices where key=${key}`;
 if(!meta)return null;
 const files=await q`select * from app.procurement_documents where notice_key=${key} order by published_at desc nulls last,code`;
 const jobs=await q`select j.*,case when j.status='queued' and not j.automatic then (select count(*) from app.document_jobs x where x.status='queued' and not x.automatic and x.batch_id is null and (x.created_at,x.id)<(j.created_at,j.id))+1 end position
  from app.document_jobs j where j.notice_key=${key} order by created_at desc,id desc`;
 const [requests]=await q`select count(*) n from app.document_requests r join app.document_jobs j on j.id=r.job_id where j.notice_key=${key}`;
 return {meta,job:jobRow(jobs.find(j=>j.kind==='list')),requests:Number(requests?.n??0),
  files:files.map(r=>({id:r.id,code:r.code,filename:r.filename,section:r.section??'list',sourceType:r.source_type??null,publishedAt:r.published_at,originalHash:r.original_hash,pdfHash:r.pdf_hash,downloadedAt:iso(r.downloaded_at),processedAt:iso(r.processed_at),pageCount:r.page_count,signature:r.signature,contents:r.contents,classification:effectiveClassification({filename:r.filename,classification:r.classification,contents:r.contents,section:r.section,sourceType:r.source_type}),job:jobRow(jobs.find(j=>j.document_id===r.id))})) as ContractFile[]};
}
export async function getContractFiles(nid:string,q:DbSql=documentDb()):Promise<ContractFiles>{
 const [notice,context]=await Promise.all([contractNotice(nid,q),awardContext(nid,q)]);
 const [own,attached]=await Promise.all([notice?sourceState(notice.key,q):null,context.source?sourceState(context.source.key,q):null]);
 const listed=!!attached?.meta.checked_at;
 // Once listed, the award's documents are counted from the list; before, from its collected detail.
 const award:AwardAttachments|null=context.source&&(listed||context.count!==null)?{caNoticeId:context.source.noticeId,count:listed?Number(attached!.meta.total??0):context.count!,
  checkedAt:(listed?iso(attached!.meta.checked_at):context.detailAt)??iso(new Date())!,listed,job:attached?.job??null}:null;
 return {notice,participation:notice?'linked':context.withoutNotice?'none':'unlinked',award,
  checkedAt:own?iso(own.meta.checked_at):null,inventory:own?Number(own.meta.inventory??1):0,total:own?.meta.total??null,
  files:[...own?.files??[],...attached?.files??[]],job:own?.job??null,requestCount:(own?.requests??0)+(attached?.requests??0),enabled:documentsEnabled()};
}
/** Hourly requests per member and per visitor (a key of the visitor's address, hashed by the hour), and
 * the length of the shared queue of requests. */
export const VISITOR_LIMIT=10,MEMBER_LIMIT=20,QUEUE_LIMIT=2000;
/** source: which list a request without a file asks for, the participation notice's or the award's. */
export async function enqueueDocument(nid:string,uid:string,documentId:string|null,q:DbSql=documentDb(),source:'notice'|'award'='notice'){
 if(!documentsEnabled())throw new WorkspaceError('Preluarea documentelor nu este activată pe acest server.',503);
 if(documentId&&!isWorkspaceId(documentId))throw new WorkspaceError('Fișier invalid.');
 const [own,context]=await Promise.all([contractNotice(nid,q),awardContext(nid,q)]);
 const [file]=documentId?await q`select notice_key from app.procurement_documents where id=${documentId}`:[];
 const notice=documentId?[own,context.source].find(n=>!!n&&n.key===file?.notice_key):source==='award'?context.source:own;
 if(documentId&&!notice)throw new WorkspaceError('Fișierul nu aparține acestei proceduri.',404);
 if(!notice)throw new WorkspaceError('Nu avem o legătură verificată cu un anunț compatibil.',404);
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
   const [n]=await s`select checked_at > now()-interval '24 hours' and inventory>=2 fresh from app.document_notices where key=${notice.key}`;
   if(n?.fresh)return {cached:true};
  }
  const key=documentId?`file:${documentId}`:`list:${notice.key}`;
  const [existing]=await s`select id,automatic,status from app.document_jobs where dedup_key=${key} and status in ('queued','running') for update`;
  if(existing&&(!existing.automatic||existing.status==='running'))return {id:existing.id};
  const limit=uid.startsWith('visitor:')?VISITOR_LIMIT:MEMBER_LIMIT;
  const [quota]=await s`select count(*) n from app.document_jobs where requested_by=${uid} and created_at>now()-interval '1 hour'`;
  if(Number(quota?.n)>=limit)throw new WorkspaceError(`Ai trimis deja ${limit} cereri în ultima oră. Revino mai târziu.`,429);
  const [queued]=await s`select count(*) n from app.document_jobs where status='queued' and not automatic and batch_id is null`;
  if(Number(queued?.n)>=QUEUE_LIMIT)throw new WorkspaceError('Coada de fișiere e plină. Revino peste câteva minute.',429);
  // Adopt a queued automatic request instead of letting a held job swallow the
  // user's explicit request. Its new manual request time counts toward quota.
  if(existing){
   await s`update app.document_jobs set automatic=false,requested_by=${uid},created_at=now(),slot=0,
    stage=case when stage='specifications_only' then 'queued' else stage end where id=${existing.id}`;
   return {id:existing.id};
  }
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
  const keys=await contractFileKeys(contractId,s);
  const [r]=await s`select d.*,p.text,p.method,n.url,n.notice_no from app.procurement_documents d join app.document_pages p on p.document_id=d.id join app.document_notices n on n.key=d.notice_key where d.id=${id} and p.page=${Number(page)} and d.processed_at is not null`;
  if(!r||!keys.includes(r.notice_key)||originalHash!==r.original_hash||!validQuote(r.text,quote))throw new WorkspaceError('Pasajul nu corespunde paginii și versiunii păstrate. Redeschide documentul.',409);
  const snapshot={verification:'document-passage',title:`${r.filename} · pagina ${page}`,documentId:id,contractId,page,quote,filename:r.filename,originalHash:r.original_hash,pdfHash:r.pdf_hash,method:r.method,processor:r.processor,contentSource:Array.isArray(r.contents)?r.contents.find((p:{firstPage?:number;pages?:number})=>p.firstPage&&Number(page)>=p.firstPage&&Number(page)<p.firstPage+(p.pages??0))??null:null,sourceUrl:r.url,noticeNo:r.notice_no,downloadedAt:r.downloaded_at,processedAt:r.processed_at};
  const [clip]=await s`insert into app.clips(investigation_id,kind,ref_id,snapshot,note,created_by) values(${investigationId},'document_quote',${id},${JSON.stringify(snapshot)}::jsonb,${typeof input.note==='string'?input.note.trim().slice(0,4000):null},${uid}) returning id`;
  await s`update app.investigations set updated_at=now() where id=${investigationId}`;
  return {id:clip!.id,investigationId};
 },q);
 if(!saved)throw new WorkspaceError('Nu poți adăuga probe în această anchetă.',403);
 return saved;
}
