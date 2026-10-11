import {collectionQuietWindow,createDb,CollectionSuspendedError,collectionHeartbeat,collectionWorkerId,type DbSql} from '@seap/db';
import {setTimeout as pause} from 'node:timers/promises';
import {openSeap} from './seap';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {storeFile,materializeBlob,requireDisk} from './blob-store';
import {prepareDocument,fileKind,PROCESSOR} from './prepare';
import {readPdfPage} from './process-pages';
import {DocumentYield,DocumentFormatError} from './errors';
import {runTool} from './process';
import {classifyStoredDocument} from './classify';
import {classifyDocumentName,CLASSIFICATION_VERSION,classificationPriority,classifyDocumentContents,hasSpecifications} from './classification';
import {validateDocumentRequestLimit} from './request-budget';
const collectionId=collectionWorkerId('documents');
export const DOCUMENT_LOCK=[729114,1] as const;
// The worker owns a reserved postgres.js connection, which has no begin() helper.
async function atomic(q:DbSql,work:(q:DbSql)=>Promise<void>){await q`begin`;try{await work(q);await q`commit`;}catch(e){await q`rollback`;throw e;}}
export async function runDocumentJob(q:DbSql,job:Record<string,any>,signal:AbortSignal,maxRequests?:number,phase:'all'|'download'|'process'='all',maxFileBytes?:number){
 validateDocumentRequestLimit(maxRequests);
 const [notice]=await q`select * from app.document_notices where key=${job.notice_key}`;
 if(!notice)throw Error('Anunțul sursă lipsește.');
 const progress=async(stage:string,done=0,total:number|null=null)=>{signal.throwIfAborted();await q`update app.document_jobs set stage=${stage},pages_done=${done},pages_total=${total} where id=${job.id} and status='running'`;};
 const [doc]=job.document_id?await q`select * from app.procurement_documents where id=${job.document_id}`:[];
 if(job.kind==='file'&&doc?.processed_at)return;
 const dir=await mkdtemp(join(tmpdir(),'seap-document-'));
 try{
 await requireDisk(dir);const source=join(dir,'original');
 let originalHash:string|undefined=doc?.original_hash;
 if(!originalHash){
  if(phase==='process')throw Error('Originalul arhivat lipsește; procesarea nu face cereri SEAP.');
  if(process.env.DOCUMENTS_OFFLINE==='true')throw Error('Modul de verificare locală nu permite cereri SEAP.');
  await progress('source');const seap=await openSeap(q,job.id,notice.url,signal,maxRequests,maxFileBytes);
  try{
   await progress('list');const list=await seap.list(notice.notice_id,notice.notice_no);
   // Publish metadata atomically only after all pages have been validated.
   await atomic(q,async tx=>{
    for(const d of list.items){const c=classifyDocumentName(d.documentName);await tx`insert into app.procurement_documents(notice_key,source_id,code,filename,published_at,classification,classification_version,priority) values(${notice.key},${String(d.noticeDocumentId)},${d.noticeDocumentCode},${d.documentName},${d.transmissionDate??null},${JSON.stringify(c)}::jsonb,${CLASSIFICATION_VERSION},${classificationPriority(c)}) on conflict(notice_key,source_id) do nothing`;}
    await tx`update app.document_notices set checked_at=now(),total=${list.total} where key=${notice.key}`;
   });
   if(job.kind==='list')return;
   const selected=list.items.find(d=>String(d.noticeDocumentId)===doc?.source_id&&d.noticeDocumentCode===doc?.code&&d.documentName===doc?.filename);
   if(!selected)throw Error('Documentul nu mai apare cu aceeași identitate în lista SEAP.');
   await progress('download');await seap.download(selected.noticeDocumentUrl,source);
   const kind=await fileKind(source,doc!.filename);
   if(kind==='p7s')await runTool('openssl',['cms','-cmsout','-inform','DER','-noout','-in',source],signal);
   if(kind==='unsupported')throw new DocumentFormatError('SEAP nu a returnat un format de document recunoscut.');
   await atomic(q,async tx=>{originalHash=await storeFile(tx,source,kind==='pdf'?'application/pdf':'application/octet-stream');
    await tx`update app.procurement_documents set original_hash=${originalHash},downloaded_at=now() where id=${job.document_id} and original_hash is null`;});
  }finally{await seap.close();}
 }
 if(phase==='download')return;
 if(!originalHash)throw Error('Originalul arhivat lipsește.');
 let preparation=doc?.preparation as {originalHash:string;pdfHash:string;pages:number;signature:string|null;contents:unknown;processor:string}|null;
 if(preparation&&(preparation.originalHash!==originalHash||preparation.processor!==PROCESSOR))throw new DocumentFormatError('Procesarea salvată aparține altei versiuni. Originalul rămâne disponibil.');
 let pdf:string;
 if(!preparation){
  if(doc?.original_hash)await materializeBlob(q,originalHash,source);
  await progress('extract');const result=await prepareDocument(source,doc!.filename,join(dir,'prepared'),signal);pdf=result.pdf;
  await atomic(q,async tx=>{const pdfHash=await storeFile(tx,result.pdf,'application/pdf');
   preparation={originalHash:originalHash!,pdfHash,pages:result.pages,signature:result.signature,contents:result.contents,processor:PROCESSOR};
   await tx`update app.procurement_documents set preparation=${JSON.stringify(preparation)}::jsonb where id=${job.document_id} and processed_at is null`;
  });
 }else{pdf=join(dir,'prepared.pdf');await materializeBlob(q,preparation.pdfHash,pdf);}
 const prepared=preparation!;
 await classifyStoredDocument(q,{...doc,preparation:prepared});
 const [classified]=await q`select classification from app.procurement_documents where id=${job.document_id}`;
 const classification=classified?.classification??classifyDocumentContents(doc!.filename,prepared.contents as any);
 const priorityPages=new Set<number>();
 for(const part of classification.parts??[])if(hasSpecifications(part)&&part.firstPage&&part.pages)for(let p=part.firstPage;p<part.firstPage+part.pages&&p<=prepared.pages;p++)priorityPages.add(p);
 function* pageOrder(){yield* priorityPages;for(let p=1;p<=prepared.pages;p++)if(!priorityPages.has(p))yield p;}
 const completed=await q`select page from app.document_pages where document_id=${job.document_id}`;
 const done=new Set<number>(completed.map(r=>Number(r.page)));let handled=0;const started=Date.now();
 for(const page of pageOrder()){
  if(done.has(page))continue;signal.throwIfAborted();await progress('text',done.size,prepared.pages);
  const p=await readPdfPage(pdf,page,dir,signal);
  await q`insert into app.document_pages(document_id,page,text,method) values(${job.document_id},${page},${p.text},${p.method}) on conflict(document_id,page) do nothing`;
  done.add(page);await progress(p.method==='ocr'?'ocr':'text',done.size,prepared.pages);
  if(++handled>=25||Date.now()-started>120000){if(done.size<prepared.pages){await classifyStoredDocument(q,{...doc,preparation:prepared});throw new DocumentYield();}}
 }
 signal.throwIfAborted();
 await q`update app.procurement_documents set pdf_hash=${prepared.pdfHash},processed_at=now(),page_count=${prepared.pages},signature=${prepared.signature},processor=${prepared.processor},contents=${JSON.stringify(prepared.contents)}::jsonb,preparation=null where id=${job.document_id} and processed_at is null`;
 const [completedDocument]=await q`select * from app.procurement_documents where id=${job.document_id}`;
 if(completedDocument)await classifyStoredDocument(q,completedDocument);
 }finally{await rm(dir,{recursive:true,force:true});}

}
/** Session lock has no expiring lease that could admit a second live worker. */
export async function runWorkerOnce(sql:DbSql,shutdown:AbortSignal,work=runDocumentJob,onlyJobId?:string){
 if(onlyJobId!==undefined&&!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(onlyJobId))throw Error('Invalid document job ID');
 if(shutdown.aborted)return false;
 await collectionHeartbeat(sql,collectionId,'documents','idle');
 if((await collectionQuietWindow(sql)).active)return false;
 const [retry]=await sql`select x.task_id from app.collection_retries x join app.collection_requests r on r.id=x.last_request_id where x.status='pending' and r.proxy_id is null`;
 if(retry)return false;
 const [control]=await sql`select paused,maintenance,blocked_reason,paused_streams from app.collection_control where id=1`;
 if(!control||control.paused||control.maintenance||control.blocked_reason||control.paused_streams.includes('documents'))return false;
 const connection=await sql.reserve();const q=connection as unknown as DbSql;
 let acquired=false;const controller=new AbortController();const abort=()=>controller.abort();shutdown.addEventListener('abort',abort,{once:true});
 let heartbeat:ReturnType<typeof setInterval>|undefined;
 try{
  const [lock]=await q`select pg_try_advisory_lock(${DOCUMENT_LOCK[0]},${DOCUMENT_LOCK[1]}) acquired,pg_backend_pid() pid`;
  if(!lock?.acquired)return false;acquired=true;
  if((await q`select id from app.document_jobs where (batch_id is not null or automatic) and status='running' limit 1`).length)return false;
  // A targeted pilot must never clean up or consume someone else's work.
  if(onlyJobId){const [running]=await q`select id from app.document_jobs where status='running' limit 1`;if(running)return false;}
  const pid=lock.pid;
  heartbeat=setInterval(()=>{void q`select pg_backend_pid() pid`.then(async r=>{if(r[0]?.pid!==pid)controller.abort();else await collectionHeartbeat(q,collectionId,'documents','processing');}).catch(()=>controller.abort());},2000);
  const orphan=await q`update app.document_jobs set status='failed',stage='failed',error='Procesarea a fost întreruptă. Reia operațiunea; originalul păstrat va fi reutilizat.',finished_at=now() where status='running' and batch_id is null and not automatic returning id`;
  // A killed worker's bounded child tools/network must finish before replacement starts.
  if(orphan.length)await pause(120000,undefined,{signal:controller.signal});
  controller.signal.throwIfAborted();
  const [job]=await q`update app.document_jobs set status='running',stage='source',started_at=now() where id=(select id from app.document_jobs where status='queued' and batch_id is null and not automatic and (${onlyJobId??null}::uuid is null or id=${onlyJobId??null}::uuid) order by created_at,id limit 1) returning *`;
  if(!job)return false;
  const deadline=setTimeout(()=>controller.abort(),20*60*1000);
  try{await work(q,job,controller.signal);controller.signal.throwIfAborted();await q`update app.document_jobs set status='complete',stage='complete',finished_at=now() where id=${job.id}`;}
  catch(error){if(error instanceof DocumentYield){await q`update app.document_jobs set status='queued',stage='process_queued' where id=${job.id}`;return true;}if(error instanceof CollectionSuspendedError){await q`update app.document_jobs set status='queued',stage='queued',started_at=null where id=${job.id}`;return false;}const message=controller.signal.aborted?'Procesarea a fost întreruptă. Poți relua folosind originalul păstrat.':error instanceof Error&&/^(SEAP|Lista|Identitatea|Documentul|Anunțul|Originalul|Procesarea|Formatul|Pagina|Răspuns|Modul|Adresă)/.test(error.message)?error.message:'Nu am putut finaliza procesarea. Originalul păstrat poate fi reutilizat.';await q`update app.document_jobs set status='failed',stage='failed',error=${message.slice(0,500)},finished_at=now() where id=${job.id}`;}
  finally{clearTimeout(deadline);}
  return true;
 }finally{if(heartbeat)clearInterval(heartbeat);controller.abort();shutdown.removeEventListener('abort',abort);if(acquired)await q`select pg_advisory_unlock(${DOCUMENT_LOCK[0]},${DOCUMENT_LOCK[1]})`.catch(()=>{});connection.release();}
}
