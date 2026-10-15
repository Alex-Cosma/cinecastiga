/** Explicit, one-document LOCAL pilot. Default is read-only inspection, no SEAP. */
import {readFile,writeFile} from 'node:fs/promises';
import {createDb} from '@seap/db';
import {contractNotice,registerNotice} from '../../lib/documents/store';
import {runDocumentJob,runWorkerOnce} from '../../lib/documents/worker';
import {loadDocumentProxy,parseDocumentProxies} from '../../lib/documents/proxy';

const database=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(database.hostname)||database.pathname!=='/seap')throw Error('This pilot requires the local seap database.');
if(process.env.DOCUMENTS_PROXY_REQUIRED!=='true'||process.env.DOCUMENTS_ENABLED!=='true'||process.env.DOCUMENTS_OFFLINE==='true')throw Error('Explicit proxy-only document pilot configuration required.');
const proxies=parseDocumentProxies(await readFile(process.env.DOCUMENTS_PROXY_FILE!,'utf8'));
if(proxies.length!==1)throw Error('Keep exactly one fixed proxy for this pilot.');
await loadDocumentProxy();
const source=JSON.parse(await readFile(new URL('../../../../docs/implementation/previews/batch5-document-pilot/report.json',import.meta.url),'utf8'));
const manifest=JSON.parse(await readFile(new URL('../../../../docs/implementation/previews/batch5-document-pilot/manifest.json',import.meta.url),'utf8'));
const metadata=source.documents.find((d:any)=>d.noticeDocumentId===110778324&&d.documentName==='HC-127-2025.pdf'&&d.noticeDocumentCode==='SCN1168231/00054');
if(!metadata)throw Error('Archived source identity mismatch.');
const {sql:q}=createDb();
const stop=new AbortController();
process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
let changedControl=false,jobId:string|undefined,originalStreams:string[]=[];
let pilotConnection:Awaited<ReturnType<typeof q.reserve>>|undefined;
const started=Date.now();
try{
 const association=await contractNotice('107063311',q);
 const archivedNotice=manifest.scope.notices.find((n:any)=>n.cNoticeId==='100231768'&&n.noticeNo==='SCN1168231');
 const [coreNotice]=await q`select n.c_notice_id,n.notice_no,e.name_display from core.notices n join core.entities e on e.id=n.authority_entity_id where n.c_notice_id=100231768 and n.notice_no='SCN1168231' and n.authority_entity_id=2144364 and e.name_display='MUNICIPIUL BUZAU'`;
 if(!archivedNotice||!coreNotice||source.sourceNoticeUrl!=='https://www.e-licitatie.ro/pub/notices/simplified-notice/v2/view/100231768'||source.cui!=='4233874')throw Error('Approved source identity mismatch.');
 // Exact archived pilot provenance, not a generic product fallback or title match.
 const notice={key:'17:100231768',noticeId:'100231768',noticeType:17,noticeNo:'SCN1168231',title:archivedNotice.title as string,url:source.sourceNoticeUrl as string};
 const contractAssociationAvailable=association?.key===notice.key;
 const [control]=await q`select * from app.collection_control where id=1`;
 const [busy]=await q`select (select count(*) from app.document_jobs where status in ('running','queued'))+(select count(*) from app.collection_requests where outcome='running')+(select count(*) from app.collection_retries where status='pending') n`;
 const [archived]=await q`select id from app.procurement_documents where notice_key=${notice.key} and source_id='110778324' and original_hash is not null`;
 if(!control?.paused||control.maintenance||control.blocked_reason||control.processing_enabled||Number(busy?.n)||archived)throw Error('Pilot preflight refused: check pause, active work, failures or existing original.');
 const [owner]=await q`select id from auth.users where email='contact@example.test'`;
 if(!owner)throw Error('Pilot owner account missing.');
 console.log(JSON.stringify({event:'pilot-preflight',notice:notice.noticeNo,url:notice.url,filename:metadata.documentName,contractAssociationAvailable,proxyId:proxies[0]!.id,minSeconds:control.min_seconds,maxSeconds:control.max_seconds,maxRequests:6,execute:process.argv.includes('--run')}));
 if(process.argv.includes('--run')){
  if(!process.env.DOCUMENTS_PILOT_REPORT)throw Error('A private report output path is required.');
  pilotConnection=await q.reserve();
  const [lock]=await pilotConnection`select pg_try_advisory_lock(729114,8) acquired`;
  if(!lock?.acquired)throw Error('Another pilot is active.');
  // Only genuine archived metadata is registered. The worker refreshes it in the
  // new SEAP session and must match ID, code and filename before downloading.
  await registerNotice(notice,q);
  await q`insert into app.procurement_documents(notice_key,source_id,code,filename) values(${notice.key},'110778324',${metadata.noticeDocumentCode},${metadata.documentName}) on conflict(notice_key,source_id) do nothing`;
  const [doc]=await q`select id from app.procurement_documents where notice_key=${notice.key} and source_id='110778324'`;
  originalStreams=control.paused_streams;
  await q.begin(async tx=>{
   const [fresh]=await tx`select paused,maintenance,blocked_reason,revision from app.collection_control where id=1 for update`;
   if(!fresh?.paused||fresh.maintenance||fresh.blocked_reason||fresh.revision!==control.revision)throw Error('Control changed; repeat preflight.');
   const [job]=await tx`insert into app.document_jobs(notice_key,document_id,kind,dedup_key,requested_by) values(${notice.key},${doc!.id},'file',${'file:'+doc!.id},${owner.id}) returning id`;
   jobId=job!.id;
   await tx`update app.collection_control set paused=false,paused_streams='["da","tenders","awards","catalogue"]'::jsonb,revision=revision+1 where id=1`;
  });
  changedControl=true;
  console.log(JSON.stringify({event:'pilot-start',jobId,documentId:doc!.id,maxRequests:6}));
  await runWorkerOnce(q,stop.signal,(db,job,signal)=>runDocumentJob(db,job,signal,6),jobId!);
  await q`update app.document_jobs set status='failed',stage='failed',error='Pilot oprit; nicio reluare automată.',finished_at=now() where id=${jobId!} and status='queued'`;
  const [job]=await q`select id,status,stage,error,pages_done,pages_total,started_at,finished_at from app.document_jobs where id=${jobId!}`;
  const requests=await q`select id,method,endpoint,status,bytes,started_at,finished_at from app.document_requests where job_id=${jobId!} order by id`;
  const [result]=await q`select d.id,d.filename,d.original_hash,d.pdf_hash,d.downloaded_at,d.processed_at,d.page_count,d.processor,d.signature,octet_length(b.bytes) original_bytes from app.procurement_documents d left join app.document_blobs b on b.hash=d.original_hash where d.id=${doc!.id}`;
  const pages=await q`select page,method,length(text) characters from app.document_pages where document_id=${doc!.id} order by page`;
  const report={executedAt:new Date().toISOString(),elapsedSeconds:Math.round((Date.now()-started)/1000),job,requests,requestCount:requests.length,result,pages,maxRequests:6,proxyId:proxies[0]!.id,sourceUrl:notice.url,contractAssociationAvailable};
  await writeFile(process.env.DOCUMENTS_PILOT_REPORT,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({event:'pilot-result',status:job?.status,requests:requests.length,pages:pages.length,elapsedSeconds:report.elapsedSeconds,error:job?.error??null}));
  if(job?.status!=='complete')process.exitCode=1;
 }
}finally{
 if(changedControl){
  // Preserve new failure diagnostics/blocking, pacing timestamps and request logs.
  await q`update app.collection_control set paused=true,paused_streams=${JSON.stringify(originalStreams)}::jsonb,revision=revision+1 where id=1`;
  if(jobId)await q`update app.document_jobs set status='failed',stage='failed',error=coalesce(error,'Pilot oprit; nicio reluare automată.'),finished_at=coalesce(finished_at,now()) where id=${jobId} and status='queued'`;
  console.log(JSON.stringify({event:'pilot-stopped',collectionPaused:true}));
 }
 if(pilotConnection){await pilotConnection`select pg_advisory_unlock(729114,8)`;pilotConnection.release();}
 await q.end({timeout:5});
}
