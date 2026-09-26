import {chromium,type Browser,type Page} from 'playwright-core';
import type {DbSql} from '@seap/db';
import {setTimeout as pause} from 'node:timers/promises';
import {safeFileUrl} from './shared';
const origin='https://www.e-licitatie.ro';
export interface ListedDocument {noticeDocumentId:number;noticeDocumentCode:string;documentName:string;noticeDocumentUrl:string;transmissionDate?:string}
export function parseList(data:unknown,noticeNo:string):{items:ListedDocument[];total:number}{
 const r=data as {items?:ListedDocument[];total?:number};
 if(!Array.isArray(r?.items)||!Number.isSafeInteger(r.total)||r.total!<0||r.total!>200)throw Error('Lista SEAP nu are un format acceptat sau depășește 200 de fișiere.');
 for(const d of r.items){if(!Number.isSafeInteger(d.noticeDocumentId)||d.noticeDocumentId<=0||typeof d.documentName!=='string'||d.documentName.length>500||typeof d.noticeDocumentCode!=='string'||!d.noticeDocumentCode.startsWith(noticeNo+'/'))throw Error('Identitatea documentului nu corespunde anunțului.');safeFileUrl(d.noticeDocumentUrl);}
 return {items:r.items,total:r.total!};
}
/** A fresh isolated browser session; only explicit requests can reach the network. */
export async function openSeap(q:DbSql,jobId:string,referer:string,signal:AbortSignal){
 let browser:Browser|undefined, allowed:{url:string;method:string}|null=null;
 if(!/^https:\/\/www\.e-licitatie\.ro\/pub\/notices\/simplified-notice\/v2\/view\/[1-9]\d*$/.test(referer))throw Error('Anunț SEAP neacceptat.');
 const stop=()=>{void browser?.close();};signal.addEventListener('abort',stop,{once:true});
 try{
  browser=await chromium.launch({executablePath:process.env.DOCUMENTS_CHROMIUM??'/usr/bin/chromium',headless:true,args:['--disable-dev-shm-usage']});
  signal.throwIfAborted();
  const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false});
  await context.route('**/*',async route=>{
   const r=route.request();
   if(signal.aborted||!allowed||allowed.url!==r.url()||allowed.method!==r.method()){await route.abort();return;}
   allowed=null;await route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(45000);
  async function request(url:string,method:string,body:unknown=null,navigate=false){
   signal.throwIfAborted();
   if(url!==referer&&url!==origin+'/api-pub/NoticeDocument/GetAll/'&&url!==safeFileUrl(url))throw Error('Adresă neacceptată.');
   const [last]=await q`select greatest(0,15000-extract(epoch from(now()-max(started_at)))*1000)::int delay from app.document_requests`;
   if(last?.delay)await pause(Number(last.delay),undefined,{signal});
   signal.throwIfAborted();
   const [row]=await q`insert into app.document_requests(job_id,method,endpoint) values(${jobId},${method},${url.includes('/noticedoc/')?'noticedoc':navigate?'notice-page':'document-list'}) returning id`;
   console.log(JSON.stringify({event:'seap-request',request:row!.id,job:jobId,method,endpoint:navigate?'notice-page':url.includes('/noticedoc/')?'noticedoc':'document-list'}));
   allowed={url,method};
   try{
    let status:number,bytes:Buffer;
    if(navigate){const res=await page.goto(url,{waitUntil:'domcontentloaded'});status=res?.status()??0;bytes=res?await res.body():Buffer.alloc(0);if(bytes.length>2*1024*1024)throw Error('Răspuns SEAP prea mare.');}
    else{
     const result=await page.evaluate(async({url,method,body})=>{
      const response=await fetch(url,{method,credentials:'include',redirect:'manual',signal:AbortSignal.timeout(40000),headers:{Accept:'application/json, text/plain, */*',Authorization:'Bearer null',HttpSessionID:'null',RefreshToken:'null',Culture:'ro-RO',...(body===null?{}:{'Content-Type':'application/json;charset=UTF-8'})},...(body===null?{}:{body:JSON.stringify(body)})});
      const chunks:Uint8Array[]=[];let size=0;const reader=response.body?.getReader();
      if(reader)for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>(method==='GET'?50*1024*1024:2*1024*1024)){await reader.cancel();throw Error('Fișier prea mare.');}chunks.push(x.value);}
      let binary='';for(const c of chunks)for(let i=0;i<c.length;i+=4096)binary+=String.fromCharCode(...c.subarray(i,i+4096));
      return {status:response.status,base64:btoa(binary)};
     },{url,method,body});status=result.status;bytes=Buffer.from(result.base64,'base64');
    }
    await q`update app.document_requests set status=${status},bytes=${bytes.length},finished_at=now() where id=${row!.id}`;
    if(status!==200)throw Error(`SEAP a răspuns cu HTTP ${status}. Poți reîncerca mai târziu.`);
    return bytes;
   }finally{allowed=null;await q`update app.document_requests set finished_at=coalesce(finished_at,now()) where id=${row!.id}`;}
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
   async close(){signal.removeEventListener('abort',stop);await browser?.close();}
  };
 }catch(e){signal.removeEventListener('abort',stop);await browser?.close();throw e;}
}
