/** Bounded production pilot for the notice families beyond SCN (owner, 3 November 2026; ~50 requests approved).
 * Plan a: open tenders (CN, type 2) — NoticeDocument list, one download — and the award-notice module.
 *   Result: CN lists hold only clarifications; the module names no attachment route.
 * Plan b: the procurement documentation section (NoticeCommon/GetDfNoticeSectionFiles, found offline in
 *   the public app bundle) for CN old and new, SCN and the other participation families (7, 19), with one
 *   download from it.
 * Plan c: the award's attached (constatator) documents — read the public modules that list them
 *   (/views/pub/documents/ack/service and list), admitted by the gate policy since 685b714.
 *   Result (batch -d): api-pub/PUBLICAckDoc getAll (POST, a filter) and get/{id}. Plan c2 reads the list
 *   module's text, which builds that filter.
 * Plan probe (--notice=<type>:<id>): one notice's documentation and list, to read the codes SEAP returns.
 * Inspection is the default; --run admits source traffic through the shared gate, a dated batch (hard
 * request ceiling) and the proxy pool. It writes only the batch, its jobs and requests, the notices it
 * reads and an audit row: no file is archived, no list is stored. */
import {createHash} from 'node:crypto';
import {createDb,reserveDocumentProxy,releaseDocumentProxy,proxyConnection,runCollectionRequest,collectionWorkerId,type DbSql} from '@seap/db';
import {type Browser} from 'playwright-core';
import {browserDocumentRequest} from '../../lib/documents/browser-request';
import {continueDocumentRequest,launchDocumentBrowser,proxyTransportError} from '../../lib/documents/proxy';

const origin='https://www.e-licitatie.ro',LIST=origin+'/api-pub/NoticeDocument/GetAll/',MODULE=origin+'/views/pub/notices/ca-notice/service.min.js';
const DF=(id:string,type:number)=>`${origin}/api-pub/NoticeCommon/GetDfNoticeSectionFiles/?initNoticeId=${id}&sysNoticeTypeId=${type}`;
const VIEW:Record<number,string>={2:'/pub/notices/c-notice/v2/view/',17:'/pub/notices/simplified-notice/v2/view/',19:'/pub/notices/rfq-invitation/v2/view/',12:'/pub/notices/rfq-invitation/v2/view/',7:'/pub/notices/pc-notice/v2/view/'};
const FILE=/^(?:https:\/\/www\.e-licitatie\.ro\/)?\/?api-pub\/files\/[a-z-]+\/[0-9a-f]{32}$/;
const MAX_REQUESTS=30,MAX_LIST_PAGES=4,MAX_FILE_BYTES=20*1024*1024;
const {sql:q}=createDb(undefined,{max:4}),stop=new AbortController();
process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
const deadline=setTimeout(()=>stop.abort(),25*60*1000);
const batchId=process.argv.find(s=>s.startsWith('--batch='))?.slice(8);
if(!batchId||!/^document-family-pilot-20261103-[a-z0-9-]+$/.test(batchId))throw Error('Use a dated explicit batch ID.');
const plan=process.argv.find(s=>s.startsWith('--plan='))?.slice(7)??'b';
const worker=collectionWorkerId('document-family-pilot');
type Notice={key:string;type:number;noticeId:string;noticeNo:string;title:string;note:string;url:string;steps:('list'|'df'|'module'|'download'|'ack-modules'|'ack-list-text')[]};
const ACK_MODULES=[origin+'/views/pub/documents/ack/service.min.js',origin+'/views/pub/documents/ack/list/list.min.js'];
type Request=(url:string,method:string,endpoint:string,body?:unknown,navigate?:boolean)=>Promise<{bytes:Buffer;status:number;oversized:boolean}>;

/** Field names and values of a listed item; transient file URLs keep only their route. */
const mask=(v:unknown):unknown=>typeof v==='string'?v.replace(/[0-9a-f]{32}/g,'{hash}'):Array.isArray(v)?v.map(mask):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,mask(x)])):v;
const urls=(v:unknown,out:string[]=[]):string[]=>{if(typeof v==='string'&&FILE.test(v))out.push(v);else if(Array.isArray(v))v.forEach(x=>urls(x,out));else if(v&&typeof v==='object')Object.values(v).forEach(x=>urls(x,out));return out;};
const absolute=(u:string)=>u.startsWith('http')?u:`${origin}/${u.replace(/^\//,'')}`;

async function download(request:Request,url:string){
 const fresh=absolute(url);
 const verify=await request(fresh,'POST','file');
 const confirmed=verify.status===200&&verify.bytes.toString('utf8')==='""';
 const out:Record<string,unknown>={route:fresh.replace(/[0-9a-f]{32}$/,'{hash}'),verifyStatus:verify.status,confirmed};
 if(confirmed){const got=await request(fresh,'GET','file');Object.assign(out,{status:got.status,bytes:got.bytes.length,oversized:got.oversized,head:got.bytes.subarray(0,8).toString('latin1').replace(/[^\x20-\x7e]/g,'.'),sha256:createHash('sha256').update(got.bytes).digest('hex')});}
 return out;
}

async function steps(n:Notice,request:Request){
 const result:Record<string,unknown>={};
 if(n.steps.includes('list')){
  const items:Record<string,unknown>[]=[];let total:number|null=null;
  for(let pageIndex=0;pageIndex<MAX_LIST_PAGES;pageIndex++){
   const r=await request(LIST,'POST','document-list',{sortProperty:'transmissionDate',pageSize:5,pageIndex,initNoticeId:Number(n.noticeId),sysNoticeTypeId:n.type,procedureId:null,sysNoticeDocumentState:null,sysNoticeDocumentType:null,sysValidationDocType:null,noticeDocumentPostDateFrom:null,noticeDocumentPostDateTo:null,sortProperties:null,sadId:null});
   if(r.status!==200){result.listError=`HTTP ${r.status}`;break;}
   const data=JSON.parse(r.bytes.toString('utf8')) as {items?:Record<string,unknown>[];total?:number};
   total=typeof data.total==='number'?data.total:null;items.push(...(data.items??[]));
   if(!data.items?.length||total===null||items.length>=total)break;
  }
  result.list={total,listed:items.length,codesMatchNotice:items.every(d=>typeof d.noticeDocumentCode==='string'&&d.noticeDocumentCode.startsWith(n.noticeNo+'/')),
   types:items.map(d=>`${d.sysNoticeDocumentTypeId}:${d.sysNoticeDocumentType}`),names:items.map(d=>d.documentName),codes:items.map(d=>d.noticeDocumentCode??null),sample:mask(items.slice(0,2))};
 }
 if(n.steps.includes('df')){
  const r=await request(DF(n.noticeId,n.type),'GET','df-files');
  const text=r.bytes.toString('utf8');let data:unknown=null;try{data=JSON.parse(text);}catch{result.dfError=`HTTP ${r.status}, not JSON (${text.slice(0,80).replace(/\s+/g,' ')})`;}
  const found=urls(data);
  result.df={status:r.status,bytes:r.bytes.length,fileUrls:found.length,shape:mask(data)};
  if(n.steps.includes('download')&&found.length)result.download=await download(request,found[0]!);
 }
 if(n.steps.includes('ack-modules')){
  const modules=[];
  for(const m of ACK_MODULES){
   const r=await request(m,'GET','module',null,true);const text=r.bytes.toString('utf8');
   modules.push({module:m.replace(origin,''),status:r.status,bytes:r.bytes.length,sha256:createHash('sha256').update(r.bytes).digest('hex'),
    apis:[...new Set(text.match(/this\.[A-Za-z]*[aA]pi[A-Za-z]*="[^"]+"/g)??[])],
    calls:[...new Set([...text.matchAll(/prototype\.[A-Za-z0-9_]+=function\([^)]*\)\{return this\.(?:GET|POST)\([^;]{0,220}/g)].map(x=>x[0]))].slice(0,40),
    routes:[...new Set(text.match(/api-pub\/[A-Za-z0-9_\/-]+/g)??[])].slice(0,40),
    files:[...new Set([...text.matchAll(/.{0,120}(?:files\/|Url|url).{0,160}/g)].map(x=>x[0]))].slice(0,15)});
  }
  result.ack=modules;
 }
 if(n.steps.includes('ack-list-text')){
  const r=await request(ACK_MODULES[1]!,'GET','module',null,true);
  result.ackListText={status:r.status,bytes:r.bytes.length,text:r.bytes.toString('utf8').slice(0,6000)};
 }
 if(n.steps.includes('module')){
  const m=await request(MODULE,'GET','module',null,true);const text=m.bytes.toString('utf8');
  result.module={status:m.status,bytes:m.bytes.length,apis:[...new Set(text.match(/this\.[A-Za-z]*[aA]pi[A-Za-z]*="[^"]+"/g)??[])],ack:[...new Set([...text.matchAll(/.{0,160}[aA]ck(?:Doc|nowledg).{0,200}/g)].map(x=>x[0]))].slice(0,30)};
 }
 return result;
}

async function session(n:Notice,jobId:string){
 // The proxy reservation and the gate open transactions: one dedicated connection per session.
 const reserved=await q.reserve(),db=reserved as unknown as DbSql;
 try{
 const managed=await reserveDocumentProxy(db,jobId);
 if(!managed)throw Error('The pilot requires the proxy pool.');
 const proxy=proxyConnection(managed),transport={mode:'proxy',proxyId:proxy.id};
 let browser:Browser|undefined,allowed:{url:string;method:string}|null=null;
 const log:unknown[]=[];
 try{
  browser=await launchDocumentBrowser(proxy);
  const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false});
  await context.route('**/*',async route=>{const r=route.request();if(stop.signal.aborted||!allowed||allowed.url!==r.url()||allowed.method!==r.method()){await route.abort();return;}allowed=null;await continueDocumentRequest(route);});
  const page=await context.newPage();page.setDefaultTimeout(45000);
  let active:{url:string;method:string}|undefined,observed:{status?:number;receivedBytes?:number;networkFailure?:string}={};
  page.on('response',r=>{if(r.url()===active?.url&&r.request().method()===active.method)observed.status=r.status();});
  page.on('requestfailed',r=>{if(r.url()===active?.url&&r.method()===active.method)observed.networkFailure=r.failure()?.errorText??'';});
  const request:Request=async(url,method,endpoint,body=null,navigate=false)=>{
   stop.signal.throwIfAborted();active={url,method};observed={};
   const value=await runCollectionRequest(db,{stream:'documents',worker,method,url,parameters:body,fileDownload:endpoint==='file'&&method==='GET',context:{transport},proxyId:managed.id,documentJobId:jobId},async()=>{
    const [row]=await db`insert into app.document_requests(job_id,method,endpoint) values(${jobId},${method},${endpoint}) returning id`;
    console.log(JSON.stringify({event:'seap-request',request:row!.id,job:jobId,method,transport,endpoint}));
    allowed={url,method};
    try{
     let status:number,bytes:Buffer,retryAfter:string|null=null,oversized=false;
     if(navigate){const res=await page.goto(url,{waitUntil:'domcontentloaded'});status=res?.status()??0;retryAfter=res?.headers()['retry-after']??null;bytes=res?await res.body():Buffer.alloc(0);}
     else{const r=await page.evaluate(browserDocumentRequest,{url,method,body,maxFileBytes:MAX_FILE_BYTES});status=r.status;retryAfter=r.retryAfter;bytes=Buffer.from(r.base64,'base64');oversized=r.oversized;}
     await db`update app.document_requests set status=${status},bytes=${bytes.length},finished_at=now() where id=${row!.id}`;
     let challenge=false;
     if(status===200&&method==='POST'&&!oversized){try{JSON.parse(bytes.toString('utf8'));}catch{challenge=true;}}
     if(status===200&&endpoint==='notice-page')challenge=/cf-chl-|<title>[^<]*(?:access denied|just a moment|attention required)/i.test(bytes.toString('utf8'));
     return {value:{bytes,status,oversized},status,bytes:bytes.length,retryAfter,challenge};
    }catch(error){throw proxyTransportError(error,observed);}
    finally{allowed=null;await db`update app.document_requests set finished_at=coalesce(finished_at,now()) where id=${row!.id}`;}
   },stop.signal);
   log.push({endpoint,method,status:value.status,bytes:value.bytes.length});
   return value;
  };
  const notice=await request(n.url,'GET','notice-page',null,true);
  await page.setContent('<!doctype html><title>Document pilot</title>');
  if(notice.status!==200)return {notice:n.noticeNo,type:n.type,note:n.note,requests:log,error:`notice page HTTP ${notice.status}`};
  return {notice:n.noticeNo,type:n.type,note:n.note,noticeId:n.noticeId,requests:log,...await steps(n,request)};
 }finally{try{await browser?.close();}finally{await releaseDocumentProxy(db,jobId);}}
 }finally{reserved.release();}
}

async function candidates():Promise<Notice[]>{
 const make=(type:number,r:Record<string,any>,note:string,s:Notice['steps']):Notice=>({key:`${type}:${r.notice_id}`,type,noticeId:String(r.notice_id),noticeNo:r.notice_no,title:r.title??r.notice_no,note,url:`${origin}${VIEW[type]}${r.notice_id}`,steps:s});
 const byId=async(id:string,type:number)=>(await q`select c_notice_id::text notice_id,notice_no,coalesce(title,notice_no) title from core.notices where c_notice_id=${id} and sys_notice_type_id=${type}`)[0];
 const linked=async(type:number)=>(await q`select n.c_notice_id::text notice_id,n.notice_no,coalesce(n.title,n.notice_no) title from core.notices n
  where n.sys_notice_type_id=${type} and n.procedure_id is not null and n.state_date>'2025-01-01'
  and exists(select 1 from core.awards a join core.contracts c on c.ca_notice_id=a.ca_notice_id where a.procedure_id=n.procedure_id and a.authority_entity_id=n.authority_entity_id)
  order by n.c_notice_id desc limit 1`)[0];
 // An SCN whose list we already hold, with a specification, to compare the two routes.
 const [scn]=await q`select n.notice_id,n.notice_no,n.title from app.document_notices n where n.notice_type=17 and n.checked_at is not null
  and exists(select 1 from app.procurement_documents d where d.notice_key=n.key and d.priority=0) and n.total between 3 and 10 order by n.notice_id desc limit 1`;
 const out:Notice[]=[];
 const recent=await byId('100213791',2),old=await byId('100085318',2),mid=await byId('100134539',2),t19=await linked(19),t7=await linked(7);
 if(recent)out.push(make(2,recent,'CN 2025-26, root detail has a docs+clarifications zip',['df','download']));
 if(old)out.push(make(2,old,'CN 2019, empty NoticeDocument list',['df']));
 if(mid)out.push(make(2,mid,'CN 2021, one clarification listed',['df']));
 if(scn)out.push(make(17,scn,'SCN with a held list and a specification',['df']));
 if(t19)out.push(make(19,t19,'type 19 (restricted procedures)',['list','df']));
 if(t7)out.push(make(7,t7,'type 7',['list','df']));
 return out;
}

async function probeCandidate():Promise<Notice[]>{
 const [type,id]=(process.argv.find(s=>s.startsWith('--notice='))?.slice(9)??'').split(':');
 if(!type||!id||!VIEW[Number(type)]||!/^[1-9]\d*$/.test(id))throw Error('Use --notice=<type>:<id>.');
 const [r]=await q`select c_notice_id::text notice_id,notice_no,coalesce(title,notice_no) title from core.notices where c_notice_id=${id} and sys_notice_type_id=${Number(type)}`;
 return r?[{key:`${type}:${r.notice_id}`,type:Number(type),noticeId:r.notice_id,noticeNo:r.notice_no,title:r.title,note:'probe',url:`${origin}${VIEW[Number(type)]}${r.notice_id}`,steps:process.argv.includes('--list-only')?['list']:['df','list']}]:[];
}
// Plan c opens its session on a public notice page (the CN of plan b), then reads only the two modules.
async function ackCandidates():Promise<Notice[]>{
 const [r]=await q`select c_notice_id::text notice_id,notice_no,coalesce(title,notice_no) title from core.notices where c_notice_id=100213791 and sys_notice_type_id=2`;
 return r?[{key:`2:${r.notice_id}`,type:2,noticeId:r.notice_id,noticeNo:r.notice_no,title:r.title,note:'session page for the constatator modules',url:`${origin}${VIEW[2]}${r.notice_id}`,steps:['ack-modules']}]:[];
}

try{
 if(plan!=='b'&&plan!=='c'&&plan!=='c2'&&plan!=='probe')throw Error('Plan a ran on 3 November (batch document-family-pilot-20261103-b).');
 const [control]=await q`select revision,paused,maintenance,blocked_reason,paused_streams from app.collection_control where id=1`;
 const [pool]=await q`select enabled from app.collection_proxy_control where id=1`;
 if(!control||control.paused||control.maintenance||control.blocked_reason||(control.paused_streams as string[]).includes('documents')||!pool?.enabled)throw Error('Inspect source controls before pilot.');
 if((await q`select id from app.document_batches where id=${batchId}`).length)throw Error('Batch already exists; inspect its persisted results. No automatic replay.');
 const notices=plan==='probe'?await probeCandidate():plan==='c'?await ackCandidates():plan==='c2'?(await ackCandidates()).map(n=>({...n,steps:['ack-list-text' as const]})):await candidates();
 console.log(JSON.stringify({event:'family-pilot-preflight',batchId,plan,maxRequests:MAX_REQUESTS,notices:notices.map(n=>({notice:n.noticeNo,type:n.type,note:n.note,url:n.url,steps:n.steps})),execute:process.argv.includes('--run')}));
 if(process.argv.includes('--run')){
  await q.begin(async tx=>{
   await tx`insert into app.document_batches(id,max_requests,max_files,concurrency) values(${batchId},${MAX_REQUESTS},1,1)`;
   for(const n of notices)await tx`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url) values(${n.key},${n.noticeId},${n.type},${n.noticeNo},${n.title},${n.url}) on conflict(key) do nothing`;
   await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('ops:document-family-pilot','Pilot familii documente','document-family-pilot','{}',${JSON.stringify({batchId,plan,notices:notices.map(n=>n.key),maxRequests:MAX_REQUESTS,approvedBy:'owner 2026-11-03'})}::jsonb)`;
  });
  const results:unknown[]=[];
  for(const n of notices){
   if(stop.signal.aborted)break;
   const [job]=await q`insert into app.document_jobs(notice_key,kind,dedup_key,requested_by,batch_id,status,stage,slot,started_at) values(${n.key},'list',${`pilot:${batchId}:${n.key}`},'system:document-family-pilot',${batchId},'running','source',1,now()) returning id`;
   try{
    results.push(await session(n,job!.id));
    await q`update app.document_jobs set status='complete',stage='complete',finished_at=now() where id=${job!.id}`;
   }catch(error){
    const message=error instanceof Error?error.message:'failed';
    results.push({notice:n.noticeNo,type:n.type,error:message.slice(0,300)});
    await q`update app.document_jobs set status='failed',stage='failed',error=${message.slice(0,500)},finished_at=now() where id=${job!.id}`;
    if(/suspend|oprit|limita|pauz/i.test(message))break;
   }
  }
  await q`update app.document_batches set status=${stop.signal.aborted?'stopped':'complete'},finished_at=now() where id=${batchId}`;
  const [batch]=await q`select requests_started,max_requests,status from app.document_batches where id=${batchId}`;
  console.log(JSON.stringify({event:'family-pilot-result',batch,results},null,1));
 }
}finally{clearTimeout(deadline);await q.end({timeout:5});}
