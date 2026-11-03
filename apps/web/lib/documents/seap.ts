import {open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {requireDisk} from './blob-store';
import {browserDocumentStream,browserDocumentRequest} from './browser-request';
import {setTimeout as sleep} from 'node:timers/promises';
import {CollectionLocalError,CollectionSuspendedError,reserveDocumentProxy,releaseDocumentProxy,proxyConnection,runCollectionRequest,collectionWorkerId,type DbSql} from '@seap/db';
import {safeFileUrl,NOTICE_VIEWS} from './shared';
import {continueDocumentRequest,loadDocumentProxy,proxyTransportError} from './proxy';
import {openDocumentContext,type DocumentSession} from './browser-pool';
import type {Page} from 'playwright-core';
import {assertDocumentRequestBudget,validateDocumentRequestLimit} from './request-budget';
const origin='https://www.e-licitatie.ro';
const workerId=collectionWorkerId('documents-http');
export interface ListedDocument {noticeDocumentId:number;noticeDocumentCode:string;documentName:string;noticeDocumentUrl:string;noticeDocumentPostDate?:string|null;publicationDate?:string|null;sysNoticeDocumentType?:string|null;sysNoticeDocumentTypeId?:number|null}
/** A file of the procurement documentation section. SEAP gives it no id; some families give no code. */
export interface DocumentationFile {section:DocumentationSection;code:string|null;documentName:string;noticeDocumentUrl:string}
export type DocumentationSection='documentation'|'espd'|'strategy'|'decision'|'ex_ante';
const DOCUMENTATION_PARTS:[string,DocumentationSection][]=[['dfNoticeDocs','documentation'],['duaeDocs','espd'],['contractingStrategyDocs','strategy'],['decisionDocs','decision'],['exAnteDocs','ex_ante']];
const viewPath=new RegExp(`^https://www\\.e-licitatie\\.ro/pub/notices/(?:(?:${[...new Set(Object.values(NOTICE_VIEWS))].join('|')})/v2/view|ca-notices/view-c)/[1-9]\\d*$`);
const AWARD_API=origin+'/api-pub/PUBLICAckDoc';
/** An attached document of an award, as PUBLICAckDoc/getAll lists it. */
export interface AwardDocument {ackDocID:number;documentName:string;noticeNo?:string|null;publicationDate?:string|null;sysAckDocCategoryName?:string|null;caNoticeId?:number|null;caNoticePublicationNumber?:string|null}
const documentationUrl=(noticeId:string,type:number)=>`${origin}/api-pub/NoticeCommon/GetDfNoticeSectionFiles/?initNoticeId=${Number(noticeId)}&sysNoticeTypeId=${type}`;
/** received: the page's items, files or not (paging counts them); items: those that carry a file. A notification
 * without an attachment (a text-only message: no name or code, an empty URL; CN1057084, 3 November 2026) has nothing to keep. */
export function parseList(data:unknown,noticeNo:string):{items:ListedDocument[];total:number;received:number}{
 const r=data as {items?:ListedDocument[];total?:number};
 if(!Array.isArray(r?.items)||!Number.isSafeInteger(r.total)||r.total!<0||r.total!>200)throw Error('Lista SEAP nu are un format acceptat sau depășește 200 de fișiere.');
 const items=r.items.filter(d=>!!d?.documentName||!!d?.noticeDocumentUrl);
 for(const d of items){if(!Number.isSafeInteger(d.noticeDocumentId)||d.noticeDocumentId<=0||typeof d.documentName!=='string'||d.documentName.length>500||typeof d.noticeDocumentCode!=='string'||!d.noticeDocumentCode.startsWith(noticeNo+'/'))throw Error('Identitatea documentului nu corespunde anunțului.');safeFileUrl(d.noticeDocumentUrl);}
 return {items,total:r.total!,received:r.items.length};
}
export function parseDocumentation(data:unknown,noticeNo:string):DocumentationFile[]{
 const r=data as Record<string,unknown>;
 if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Documentația SEAP nu are un format acceptat.');
 const files:DocumentationFile[]=[];
 for(const [key,section] of DOCUMENTATION_PARTS){
  const part=r[key];if(part==null)continue;
  if(!Array.isArray(part))throw Error('Documentația SEAP nu are un format acceptat.');
  for(const d of part as Record<string,unknown>[]){
   const code=d?.noticeDocumentCode??null;
   if(typeof d?.noticeDocumentName!=='string'||!d.noticeDocumentName.trim()||d.noticeDocumentName.length>500||(code!==null&&(typeof code!=='string'||!code.startsWith(noticeNo+'/'))))throw Error('Identitatea documentului nu corespunde anunțului.');
   files.push({section,code,documentName:d.noticeDocumentName,noticeDocumentUrl:safeFileUrl(String(d.noticeDocumentUrl))});
  }
 }
 if(files.length>200)throw Error('Documentația SEAP depășește 200 de fișiere.');
 return files;
}
/** received counts every item for paging; items keep those with a file of this award (by id and number). */
export function parseAwardList(data:unknown,caNoticeId:string,canNo:string):{items:AwardDocument[];total:number;received:number}{
 const r=data as {items?:AwardDocument[];total?:number};
 if(!Array.isArray(r?.items)||!Number.isSafeInteger(r.total)||r.total!<0||r.total!>200)throw Error('Lista SEAP nu are un format acceptat sau depășește 200 de fișiere.');
 const items=r.items.filter(d=>!!d?.documentName);
 for(const d of items)if(!Number.isSafeInteger(d.ackDocID)||d.ackDocID<=0||d.documentName.length>500||String(d.caNoticeId)!==caNoticeId||(d.caNoticePublicationNumber!=null&&d.caNoticePublicationNumber!==canNo))throw Error('Identitatea documentului nu corespunde anunțului.');
 return {items,total:r.total!,received:r.items.length};
}
/** The gate and the proxy reservation need a dedicated connection (session locks, explicit transactions).
 * Given the pool, a lane takes one only for that step, so a hundred lanes waiting on their proxies' spacing
 * do not hold a hundred connections; a caller that already reserved one keeps using it. */
/** At most GATE_SESSIONS lanes hold a connection at once (the pool has 30, the gate admits 10 requests in
 * flight); the others wait here without one, so the supervisor and the pool's short queries keep theirs. */
export const GATE_SESSIONS=12;
let gateHeld=0;const gateWaiting:(()=>void)[]=[];
async function withSession<T>(q:DbSql,work:(session:DbSql)=>Promise<T>):Promise<T>{
 const pool=q as unknown as {reserve?:()=>Promise<DbSql&{release():void}>};
 if(typeof pool.reserve!=='function')return work(q);
 if(gateHeld>=GATE_SESSIONS)await new Promise<void>(resolve=>gateWaiting.push(resolve));else gateHeld++;
 try{
  const session=await pool.reserve();
  try{return await work(session);}finally{session.release();}
 }finally{const next=gateWaiting.shift();if(next)next();else gateHeld--;}
}
/** One open SEAP session: a browser context, its page and what the route handler currently admits. */
interface Tab {proxyId:string|null;family:string;session:DocumentSession;page:Page;openedAt:number;uses:number;idleAt:number;
 state:{signal:AbortSignal;allowed:{url:string;method:string}|null;active?:{url:string;method:string};observed:{status?:number;receivedBytes?:number;networkFailure?:string}}}
/** Session reuse (owner, 3 November 2026; tested on production with batch document-family-pilot-20261103-reuse2):
 * a session opened on one notice's page serves another notice's documentation and list. A network lane keeps
 * its session between list jobs of the same family on the same proxy and skips the notice page, ~1 request of
 * ~3.5. Sessions are bounded by age and use, closed after any failed request or when idle. */
const REUSE_MAX_AGE_MS=30*60*1000,REUSE_MAX_USES=40,REUSE_IDLE_MS=5*60*1000;
const warm=new Map<number,Tab>();
function sweepWarm(now=Date.now()){for(const [lane,tab] of warm)if(now-tab.idleAt>REUSE_IDLE_MS||now-tab.openedAt>REUSE_MAX_AGE_MS){warm.delete(lane);void tab.session.close().catch(()=>{});}}
const familyOf=(url:string)=>url.replace(/\/[1-9]\d*$/,'');
/** A fresh isolated browser session (its own context), or a lane's kept one; only explicit requests can reach the network.
 * lane: the network lane of an automatic or requested list job; without it every call opens its own session. */
export async function openSeap(q:DbSql,jobId:string,referer:string,signal:AbortSignal,maxRequests?:number,maxFileBytes?:number,lane?:number){
 validateDocumentRequestLimit(maxRequests);
 if(maxFileBytes!==undefined&&(!Number.isSafeInteger(maxFileBytes)||maxFileBytes<1||maxFileBytes>50*1024*1024))throw Error("Invalid file limit");
 if(!viewPath.test(referer))throw Error('Anunț SEAP neacceptat.');
 sweepWarm();
 const family=familyOf(referer),kept=lane===undefined?undefined:warm.get(lane);
 if(kept)warm.delete(lane!);
 const candidate=kept&&kept.family===family&&kept.uses<REUSE_MAX_USES&&!family.includes('/ca-notices/')?kept:undefined;
 if(kept&&!candidate)void kept.session.close().catch(()=>{});
 // Every proxy is held by another session: wait for one, without counting a failed attempt.
 const managedProxy=await withSession(q,c=>reserveDocumentProxy(c,jobId,candidate?.proxyId??undefined)).catch(error=>{
  if(candidate)void candidate.session.close().catch(()=>{});
  if(error instanceof Error&&error.message.startsWith('Toate proxy-urile sunt rezervate'))throw new CollectionSuspendedError(error.message);
  throw error;
 });
 const proxy=managedProxy?proxyConnection(managedProxy):await loadDocumentProxy(); // Choose once; keep it for notice, list, POST and GET.
 const reused=!!candidate&&!!managedProxy&&candidate.proxyId===managedProxy.id;
 if(candidate&&!reused)void candidate.session.close().catch(()=>{});
 const transport=proxy?{mode:'proxy',proxyId:proxy.id,...(reused?{session:'reused'}:{})}:{mode:'direct'};
 let tab:Tab|undefined=reused?candidate:undefined,failed=false;
 const stop=()=>{failed=true;void tab?.session.close();};signal.addEventListener('abort',stop,{once:true});
 try{
  if(!tab){
   const session=await openDocumentContext(proxy,{javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false});
   const state:Tab['state']={signal,allowed:null,observed:{}};
   await session.context.route('**/*',async route=>{
    const r=route.request(),allowed=state.allowed;
    if(state.signal.aborted||!allowed||allowed.url!==r.url()||allowed.method!==r.method()){await route.abort();return;}
    state.allowed=null;await continueDocumentRequest(route);
   });
   const page=await session.context.newPage();page.setDefaultTimeout(45000);
   page.on('response',r=>{if(r.url()===state.active?.url&&r.request().method()===state.active.method)state.observed.status=r.status();});
   page.on('requestfailed',r=>{if(r.url()===state.active?.url&&r.method()===state.active.method)state.observed.networkFailure=r.failure()?.errorText??'';});
   tab={proxyId:proxy?.id??null,family,session,page,openedAt:Date.now(),uses:0,idleAt:Date.now(),state};
  }
  const current=tab,page=current.page,state=current.state;state.signal=signal;state.allowed=null;
  if(signal.aborted)await current.session.close();
  signal.throwIfAborted();
  async function request(url:string,method:string,body:unknown=null,navigate=false,destination?:string){
   signal.throwIfAborted();state.active={url,method};state.observed={};const observed=state.observed;
   await assertDocumentRequestBudget(q,jobId,maxRequests);
   if(url!==referer&&url!==origin+'/api-pub/NoticeDocument/GetAll/'&&url!==AWARD_API+'/getAll'&&!/^https:\/\/www\.e-licitatie\.ro\/api-pub\/PUBLICAckDoc\/(?:get\/[1-9]\d*|DownloadDocument\/\?documentId=[1-9]\d*)$/.test(url)&&!/^https:\/\/www\.e-licitatie\.ro\/api-pub\/NoticeCommon\/GetDfNoticeSectionFiles\/\?initNoticeId=[1-9]\d*&sysNoticeTypeId=\d+$/.test(url)&&url!==safeFileUrl(url))throw Error('Adresă neacceptată.');
   const isFileDownload=method==='GET'&&url.includes('/noticedoc/')||url.includes('/PUBLICAckDoc/DownloadDocument/');
   await q`update app.document_jobs set stage='rate_limit' where id=${jobId} and status='running'`;
   // Wait out this proxy's spacing before taking a connection for the gate (which rechecks it).
   if(managedProxy){
    const [wait]=await q`select greatest(0,extract(epoch from next_allowed_at-clock_timestamp())*1000)::int ms from app.collection_proxies where id=${managedProxy.id}`;
    if(Number(wait?.ms)>0)await sleep(Math.min(Number(wait!.ms),120000),undefined,{signal});
   }
   const result=await withSession(q,gate=>runCollectionRequest(gate,{stream:'documents',worker:workerId,method,url,parameters:body,fileDownload:isFileDownload,context:{transport},...(managedProxy?{proxyId:managedProxy.id}:{}),documentJobId:jobId},async gateSignal=>{
   const gateStop=()=>{failed=true;void current.session.close();};gateSignal.addEventListener('abort',gateStop,{once:true});
   try{
   // Inside the gate every write uses the gate's own connection: waiting for a second one from the pool
   // while holding this one deadlocks once the lanes hold the whole pool (3 November 2026, 60 lanes).
   if(isFileDownload)await gate`update app.document_jobs set stage='download' where id=${jobId} and status='running'`;
   signal.throwIfAborted();
   const endpoint=url.includes('/noticedoc/')?'noticedoc':navigate?'notice-page':url.includes('/GetDfNoticeSectionFiles/')?'documentation':url.includes('/PUBLICAckDoc/DownloadDocument/')?'award-file':url.includes('/PUBLICAckDoc/get/')?'award-item':url.includes('/PUBLICAckDoc/')?'award-list':'document-list';
   const [row]=await gate`insert into app.document_requests(job_id,method,endpoint) values(${jobId},${method},${endpoint}) returning id`;
   console.log(JSON.stringify({event:'seap-request',request:row!.id,job:jobId,method,transport,endpoint}));
   state.allowed={url,method};
   try{
    let status:number,bytes:Buffer,retryAfter:string|null=null,oversized=false,receivedBytes:number|undefined;
    if(navigate){const res=await page.goto(url,{waitUntil:'domcontentloaded'});status=res?.status()??0;retryAfter=res?.headers()['retry-after']??null;bytes=res?await res.body():Buffer.alloc(0);receivedBytes=bytes.length;oversized=bytes.length>2*1024*1024;if(oversized)bytes=Buffer.alloc(0);}
    else if(destination){
     const sink='save_'+randomUUID().replaceAll('-',''),file=await open(destination,'wx',0o600);let received=0;let localError:Error|undefined;
     await page.exposeFunction(sink,async(base64:string)=>{try{signal.throwIfAborted();const chunk=Buffer.from(base64,'base64');if(maxFileBytes!==undefined&&received+chunk.length>maxFileBytes)throw Error("Pilot file limit exceeded");if(chunk.length>65536)throw Error('Invalid stream chunk');if(received%(16*1024*1024)<65536)await requireDisk(destination);await file.writeFile(chunk);received+=chunk.length;observed.receivedBytes=received;}catch(error){localError=new CollectionLocalError(error instanceof Error&&error.message.startsWith('Procesarea')?error.message:'Procesarea nu poate salva fișierul pe disc. Verifică spațiul disponibil.');throw localError;}});
     try{const result=await page.evaluate(browserDocumentStream,{url,sink,method});status=result.status;retryAfter=result.retryAfter;receivedBytes=result.receivedBytes;bytes=Buffer.alloc(0);}catch(error){if(localError)throw localError;throw error;}finally{await file.close();}
    }else{
     const result=await page.evaluate(browserDocumentRequest,{url,method,body,maxFileBytes:maxFileBytes??50*1024*1024});status=result.status;retryAfter=result.retryAfter;bytes=Buffer.from(result.base64,'base64');oversized=result.oversized;receivedBytes=result.receivedBytes;
    }
    await gate`update app.document_requests set status=${status},bytes=${receivedBytes??bytes.length},finished_at=now() where id=${row!.id}`;
    let challenge=false;
    // A file written to disk is checked by its format afterwards; only a response held in memory must be JSON.
    if(!oversized&&!destination&&status===200&&(method==='POST'||endpoint==='documentation')){try{JSON.parse(bytes.toString('utf8'));}catch{challenge=true;}}
    if(status===200&&navigate)challenge=/cf-chl-|<title>[^<]*(?:access denied|just a moment|attention required)/i.test(bytes.toString('utf8'));
    return {value:{bytes,status,oversized},status,bytes:receivedBytes??bytes.length,retryAfter,challenge,...(oversized?{diagnostics:{response:{status,receivedBytes,bodyTruncated:true},reason:'document_size_limit'}}:{})};
   }catch(error){if(error instanceof CollectionLocalError)throw error;if(proxy)throw proxyTransportError(error,observed);throw error;}
   finally{state.allowed=null;await gate`update app.document_requests set finished_at=coalesce(finished_at,now()) where id=${row!.id}`;}
   }finally{gateSignal.removeEventListener('abort',gateStop);}
   },signal)).catch(error=>{failed=true;throw error;});
   if(result.status!==200)failed=true;
   if(result.oversized)throw Error(`SEAP: răspunsul depășește limita de ${method==='GET'?(maxFileBytes??50*1024*1024)/1024/1024:2} MiB a acestei operațiuni. Fișierul nu a fost arhivat.`);
   if(result.status!==200)throw Error(`SEAP a răspuns cu HTTP ${result.status}. Poți reîncerca mai târziu.`);
   return result.bytes;
  }
  if(!reused){
   await request(referer,'GET',null,true);
   // Remove the untrusted page, preserving the source URL and own session.
   await page.setContent('<!doctype html><title>Document collector</title>');
  }
  return {
   async list(noticeId:string,noticeNo:string,noticeType:number){
    const items:ListedDocument[]=[];let total=0,received=0;
    for(let pageIndex=0;pageIndex<40;pageIndex++){
     const bytes=await request(origin+'/api-pub/NoticeDocument/GetAll/','POST',{sortProperty:'transmissionDate',pageSize:5,pageIndex,initNoticeId:Number(noticeId),sysNoticeTypeId:noticeType,procedureId:null,sysNoticeDocumentState:null,sysNoticeDocumentType:null,sysValidationDocType:null,noticeDocumentPostDateFrom:null,noticeDocumentPostDateTo:null,sortProperties:null,sadId:null});
     const parsed=parseList(JSON.parse(bytes.toString('utf8')),noticeNo);if(pageIndex&&total!==parsed.total)throw Error('Lista s-a modificat în timpul preluării. Reîncearcă.');total=parsed.total;items.push(...parsed.items);received+=parsed.received;
     if(new Set(items.map(d=>d.noticeDocumentId)).size!==items.length)throw Error('SEAP a repetat o pagină a listei.');
     if(received===total)return {items,total};
     if(!parsed.received||received>total)throw Error('Lista SEAP este incompletă.');
    }throw Error('Lista SEAP este prea mare.');
   },
   /** One request: the documentation section (specifications, data sheet, models, ESPD). */
   async documentation(noticeId:string,noticeNo:string,noticeType:number){
    const bytes=await request(documentationUrl(noticeId,noticeType),'GET');
    return parseDocumentation(JSON.parse(bytes.toString('utf8')),noticeNo);
   },
   /** The award's attached documents, five per page like the public list. */
   async awardDocuments(caNoticeId:string,canNo:string){
    const items:AwardDocument[]=[];let total=0,received=0;
    for(let pageIndex=0;pageIndex<40;pageIndex++){
     const bytes=await request(AWARD_API+'/getAll','POST',{pageIndex,pageSize:5,cANoticePublicationNumber:canNo});
     const parsed=parseAwardList(JSON.parse(bytes.toString('utf8')),caNoticeId,canNo);if(pageIndex&&total!==parsed.total)throw Error('Lista s-a modificat în timpul preluării. Reîncearcă.');
     total=parsed.total;received+=parsed.received;items.push(...parsed.items);
     if(new Set(items.map(d=>d.ackDocID)).size!==items.length)throw Error('SEAP a repetat o pagină a listei.');
     if(received===total)return {items,total};
     if(!parsed.received||received>total)throw Error('Lista SEAP este incompletă.');
    }throw Error('Lista SEAP este prea mare.');
   },
   /** The list gives no file id: the document's own record names it, then SEAP's DOWNLOAD (a POST) returns the file. */
   async downloadAward(ackDocId:string,caNoticeId:string,destination?:string){
    const record=JSON.parse((await request(`${AWARD_API}/get/${Number(ackDocId)}`,'POST')).toString('utf8')) as {ackDocId?:number;caNoticeId?:number;documentId?:number};
    if(String(record?.ackDocId)!==ackDocId||String(record?.caNoticeId)!==caNoticeId||!Number.isSafeInteger(record.documentId)||record.documentId!<=0)throw Error('Identitatea documentului nu corespunde anunțului.');
    return request(`${AWARD_API}/DownloadDocument/?documentId=${record.documentId}`,'POST',null,false,destination);
   },
   async download(url:string,destination?:string){const fresh=safeFileUrl(url);const verify=await request(fresh,'POST');if(JSON.parse(verify.toString('utf8'))!=='')throw Error('SEAP nu a confirmat descărcarea.');return request(fresh,'GET',null,false,destination);},
   async close(){
    signal.removeEventListener('abort',stop);
    try{
     // Kept for the lane's next list job only after a clean job on a managed proxy.
     if(lane!==undefined&&!failed&&!signal.aborted&&managedProxy&&Date.now()-current.openedAt<REUSE_MAX_AGE_MS){current.uses++;current.idleAt=Date.now();state.allowed=null;warm.set(lane,current);}
     else await current.session.close();
    }finally{await releaseDocumentProxy(q,jobId);}
   }
  };
 }catch(e){signal.removeEventListener('abort',stop);try{await tab?.session.close();}finally{await releaseDocumentProxy(q,jobId);}throw e;}
}
