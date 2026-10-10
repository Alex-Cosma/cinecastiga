import {browserDocumentRequest} from './browser-request';
import {type Browser} from 'playwright-core';
import {reserveDocumentProxy,releaseDocumentProxy,proxyConnection,runCollectionRequest,collectionWorkerId,type DbSql} from '@seap/db';
import {safeFileUrl} from './shared';
import {continueDocumentRequest,launchDocumentBrowser,loadDocumentProxy,proxyTransportError} from './proxy';
import {assertDocumentRequestBudget,validateDocumentRequestLimit} from './request-budget';
const origin='https://www.e-licitatie.ro';
const workerId=collectionWorkerId('documents-http');
export interface ListedDocument {noticeDocumentId:number;noticeDocumentCode:string;documentName:string;noticeDocumentUrl:string;transmissionDate?:string}
export function parseList(data:unknown,noticeNo:string):{items:ListedDocument[];total:number}{
 const r=data as {items?:ListedDocument[];total?:number};
 if(!Array.isArray(r?.items)||!Number.isSafeInteger(r.total)||r.total!<0||r.total!>200)throw Error('Lista SEAP nu are un format acceptat sau depășește 200 de fișiere.');
 for(const d of r.items){if(!Number.isSafeInteger(d.noticeDocumentId)||d.noticeDocumentId<=0||typeof d.documentName!=='string'||d.documentName.length>500||typeof d.noticeDocumentCode!=='string'||!d.noticeDocumentCode.startsWith(noticeNo+'/'))throw Error('Identitatea documentului nu corespunde anunțului.');safeFileUrl(d.noticeDocumentUrl);}
 return {items:r.items,total:r.total!};
}
/** A fresh isolated browser session; only explicit requests can reach the network. */
export async function openSeap(q:DbSql,jobId:string,referer:string,signal:AbortSignal,maxRequests?:number,maxFileBytes=50*1024*1024){
 validateDocumentRequestLimit(maxRequests);
 if(!Number.isSafeInteger(maxFileBytes)||maxFileBytes<1||maxFileBytes>50*1024*1024)throw Error("Invalid file limit");
 let browser:Browser|undefined, allowed:{url:string;method:string}|null=null;
 if(!/^https:\/\/www\.e-licitatie\.ro\/pub\/notices\/simplified-notice\/v2\/view\/[1-9]\d*$/.test(referer))throw Error('Anunț SEAP neacceptat.');
 const managedProxy=await reserveDocumentProxy(q,jobId);
 const proxy=managedProxy?proxyConnection(managedProxy):await loadDocumentProxy(); // Choose once; keep it for notice, list, POST and GET.
 const transport=proxy?{mode:'proxy',proxyId:proxy.id}:{mode:'direct'};
 const stop=()=>{void browser?.close();};signal.addEventListener('abort',stop,{once:true});
 try{
  browser=await launchDocumentBrowser(proxy);
  signal.throwIfAborted();
  const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false});
  await context.route('**/*',async route=>{
   const r=route.request();
   if(signal.aborted||!allowed||allowed.url!==r.url()||allowed.method!==r.method()){await route.abort();return;}
   allowed=null;await continueDocumentRequest(route);
  });
  const page=await context.newPage();page.setDefaultTimeout(45000);
  async function request(url:string,method:string,body:unknown=null,navigate=false){
   signal.throwIfAborted();
   await assertDocumentRequestBudget(q,jobId,maxRequests);
   if(url!==referer&&url!==origin+'/api-pub/NoticeDocument/GetAll/'&&url!==safeFileUrl(url))throw Error('Adresă neacceptată.');
   const isFileDownload=method==='GET'&&url.includes('/noticedoc/');
   await q`update app.document_jobs set stage='rate_limit' where id=${jobId} and status='running'`;
   const result=await runCollectionRequest(q,{stream:'documents',worker:workerId,method,url,parameters:body,fileDownload:isFileDownload,context:{transport},...(managedProxy?{proxyId:managedProxy.id}:{}),documentJobId:jobId},async gateSignal=>{
   const gateStop=()=>{void browser?.close();};gateSignal.addEventListener('abort',gateStop,{once:true});
   try{
   if(isFileDownload)await q`update app.document_jobs set stage='download' where id=${jobId} and status='running'`;
   signal.throwIfAborted();
   const [row]=await q`insert into app.document_requests(job_id,method,endpoint) values(${jobId},${method},${url.includes('/noticedoc/')?'noticedoc':navigate?'notice-page':'document-list'}) returning id`;
   console.log(JSON.stringify({event:'seap-request',request:row!.id,job:jobId,method,transport,endpoint:navigate?'notice-page':url.includes('/noticedoc/')?'noticedoc':'document-list'}));
   allowed={url,method};
   try{
    let status:number,bytes:Buffer,retryAfter:string|null=null,oversized=false,receivedBytes:number|undefined;
    if(navigate){const res=await page.goto(url,{waitUntil:'domcontentloaded'});status=res?.status()??0;retryAfter=res?.headers()['retry-after']??null;bytes=res?await res.body():Buffer.alloc(0);receivedBytes=bytes.length;oversized=bytes.length>2*1024*1024;if(oversized)bytes=Buffer.alloc(0);}
    else{
     const result=await page.evaluate(browserDocumentRequest,{url,method,body,maxFileBytes});status=result.status;retryAfter=result.retryAfter;bytes=Buffer.from(result.base64,'base64');oversized=result.oversized;receivedBytes=result.receivedBytes;
    }
    await q`update app.document_requests set status=${status},bytes=${receivedBytes??bytes.length},finished_at=now() where id=${row!.id}`;
    let challenge=false;
    if(!oversized&&status===200&&method==='POST'){try{JSON.parse(bytes.toString('utf8'));}catch{challenge=true;}}
    if(status===200&&navigate)challenge=/cf-chl-|<title>[^<]*(?:access denied|just a moment|attention required)/i.test(bytes.toString('utf8'));
    return {value:{bytes,status,oversized},status,bytes:receivedBytes??bytes.length,retryAfter,challenge,...(oversized?{diagnostics:{response:{status,receivedBytes,bodyTruncated:true},reason:'document_size_limit'}}:{})};
   }catch(error){if(proxy)throw proxyTransportError(error);throw error;}
   finally{allowed=null;await q`update app.document_requests set finished_at=coalesce(finished_at,now()) where id=${row!.id}`;}
   }finally{gateSignal.removeEventListener('abort',gateStop);}
   },signal);
   if(result.oversized)throw Error(`SEAP: răspunsul depășește limita de ${method==='GET'?maxFileBytes/1024/1024:2} MiB a acestei operațiuni. Fișierul nu a fost arhivat.`);
   if(result.status!==200)throw Error(`SEAP a răspuns cu HTTP ${result.status}. Poți reîncerca mai târziu.`);
   return result.bytes;
  }
  await request(referer,'GET',null,true);
  // Remove the untrusted page, preserving the source URL and own session.
  await page.setContent('<!doctype html><title>Document collector</title>');
  return {
   async list(noticeId:string,noticeNo:string){
    const items:ListedDocument[]=[];let total=0;
    for(let pageIndex=0;pageIndex<40;pageIndex++){
     const bytes=await request(origin+'/api-pub/NoticeDocument/GetAll/','POST',{sortProperty:'transmissionDate',pageSize:5,pageIndex,initNoticeId:Number(noticeId),sysNoticeTypeId:17,procedureId:null,sysNoticeDocumentState:null,sysNoticeDocumentType:null,sysValidationDocType:null,noticeDocumentPostDateFrom:null,noticeDocumentPostDateTo:null,sortProperties:null,sadId:null});
     const parsed=parseList(JSON.parse(bytes.toString('utf8')),noticeNo);if(pageIndex&&total!==parsed.total)throw Error('Lista s-a modificat în timpul preluării. Reîncearcă.');total=parsed.total;items.push(...parsed.items);
     if(new Set(items.map(d=>d.noticeDocumentId)).size!==items.length)throw Error('SEAP a repetat o pagină a listei.');
     if(items.length===total)return {items,total};
     if(!parsed.items.length||items.length>total)throw Error('Lista SEAP este incompletă.');
    }throw Error('Lista SEAP este prea mare.');
   },
   async download(url:string){const fresh=safeFileUrl(url);const verify=await request(fresh,'POST');if(JSON.parse(verify.toString('utf8'))!=='')throw Error('SEAP nu a confirmat descărcarea.');return request(fresh,'GET');},
   async close(){signal.removeEventListener('abort',stop);try{await browser?.close();}finally{await releaseDocumentProxy(q,jobId);}}
  };
 }catch(e){signal.removeEventListener('abort',stop);try{await browser?.close();}finally{await releaseDocumentProxy(q,jobId);}throw e;}
}
