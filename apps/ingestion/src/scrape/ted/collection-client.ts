import {createHash} from 'node:crypto';
import {createHttpClient,createTedClient,TED_API_BASE,type TedClient} from '@seap/scraper-clients';
import {CollectionTransportError,collectionWorkerId,currentCollectionContext,isTedCollectionUrl,responseDiagnosticBody,retryableProxyTransport,runCollectionRequest,tedDailyPackageUrl,type SeapProxy} from '@seap/db';
import {getSharedSql} from '../../db.js';
import {withProxyResponse} from '../elicitatie/proxy-fetch.js';

/**
 * TED through the shared collection gate: the same admission, proxy pool and
 * per-IP spacing, quiet window, ledger and retries as SEAP requests. Only the two
 * exact TED resources are accepted (search API, OJ S daily package); no Referer,
 * no redirect following.
 */
let singleton:TedClient|null=null,testOverride:TedClient|null=null;
const worker=collectionWorkerId('ted-http');
const MAX_BYTES=32*1024*1024;
/** A daily package was 18.9 MB on 15 October 2026 (OJ S 200/2026); generous headroom, still bounded. */
export const TED_PACKAGE_MAX_BYTES=128*1024*1024;
export function setTedCollectionClientForTests(client:TedClient|null){testOverride=client;}
const userAgent=()=>process.env['SCRAPE_UA']??'seap-analytics/0.1 (contact: cineseuita@gmail.com)';

/** Ledger parameters: the day/page of a search or the OJ S issue, never the query text. */
export function tedRequestParameters(url:string,method:string,body:unknown):Record<string,unknown>{
 const u=new URL(url);
 if(u.hostname==='ted.europa.eu'&&method==='GET'){
  const m=/^\/packages\/daily\/(\d{9})$/.exec(u.pathname);if(!m)throw Error('Unexpected TED collection request');
  return {ojs:m[1]};
 }
 if(u.hostname!=='api.ted.europa.eu'||method!=='POST'||typeof body!=='string')throw Error('Unexpected TED collection request');
 const b=JSON.parse(body) as {query?:unknown;page?:unknown;limit?:unknown};
 const day=typeof b.query==='string'?/publication-date>=(\d{4})(\d{2})(\d{2})\b/.exec(b.query):null;
 if(!day)throw Error('TED search without a publication day');
 return {publicationDate:`${day[1]}-${day[2]}-${day[3]}`,page:b.page,limit:b.limit};
}

/** Never a success: TED's AWS WAF answers 202 (or another 2xx) with `x-amzn-waf-action` and an empty body. */
export function tedChallenge(status:number,headers:Headers){
 return headers.has('x-amzn-waf-action')||status>=200&&status<300&&status!==200;
}
/** A package download is a success only for 200 + gzip magic + no WAF marker. */
export function tedPackageRejected(status:number,headers:Headers,bytes:Uint8Array){
 return tedChallenge(status,headers)||status===200&&(bytes.length<2||bytes[0]!==0x1f||bytes[1]!==0x8b);
}

interface Consumed {status:number;headers:Headers;bytes:Buffer}
/** One gated TED request; the body is read in full (bounded) while the request lock is held. */
async function gatedTedRequest(url:string,init:{method:string;headers:Record<string,string>;body?:string},options:{maxBytes:number;fileDownload:boolean;binary:boolean;parameters:Record<string,unknown>;classify:(c:Consumed)=>{challenge:boolean;records?:number}}):Promise<Consumed>{
 if(!isTedCollectionUrl(url))throw Error('Unexpected TED collection host');
 const q=await getSharedSql().reserve();
 try{return await runCollectionRequest(q,{stream:'ted',worker,context:currentCollectionContext(),method:init.method,url,parameters:options.parameters,fileDownload:options.fileDownload},async(signal:AbortSignal,proxy:SeapProxy|null)=>{
  const diagnostic:Record<string,unknown>={phase:'headers',request:{origin:new URL(url).origin,path:new URL(url).pathname,headers:init.headers,headerScope:'application-provided; transport may add automatic headers',body:init.body??null}};
  const chunks:Uint8Array[]=[];let size=0;
  const body=(bytes:Buffer,complete:boolean)=>options.binary&&bytes.length>0&&bytes[0]===0x1f&&bytes[1]===0x8b
   ?{receivedBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),complete,encoding:'binary',head:bytes.subarray(0,16).toString('hex')}
   :responseDiagnosticBody(bytes.subarray(0,64*1024),complete);
  const consume=async(response:Response)=>{
   diagnostic.response={status:response.status,statusText:response.statusText,headers:Object.fromEntries(response.headers)};diagnostic.phase='body';
   const reader=response.body?.getReader();
   if(reader)for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>options.maxBytes){await reader.cancel();throw Error('Source response exceeds budget');}chunks.push(r.value);}
   const bytes=Buffer.concat(chunks),consumed={status:response.status,headers:new Headers(response.headers),bytes};
   diagnostic.phase='complete';diagnostic.response={...(diagnostic.response as object),...body(bytes,true)};
   const {challenge,records}=options.classify(consumed);
   return {value:consumed,status:response.status,bytes:size,...(records===undefined?{}:{records}),challenge,retryAfter:response.headers.get('retry-after'),diagnostics:diagnostic};
  };
  try{return proxy?await withProxyResponse(url,init,proxy,signal,consume):await consume(await fetch(url,{...init,redirect:'manual',signal}));
  }catch(error){diagnostic.retryableProxyTransport=!!proxy&&retryableProxyTransport(error);diagnostic.response={...(diagnostic.response as object??{}),...body(Buffer.concat(chunks),diagnostic.phase==='complete'),observedBytes:size,captureLimitBytes:options.maxBytes,truncated:size>options.maxBytes};throw new CollectionTransportError(proxy?new Error('Conexiunea proxy a eșuat; fără conexiune directă.'):error,diagnostic);}
 });}finally{q.release();}
}

export interface TedPackageResponse {status:number;filename:string|null;bytes:Buffer|null}
/** One OJ S daily package, binary and never utf8-decoded. 404 = issue not published (yet). */
export async function fetchTedDailyPackage(ojs:string):Promise<TedPackageResponse>{
 const url=tedDailyPackageUrl(ojs);
 const r=await gatedTedRequest(url,{method:'GET',headers:{accept:'application/gzip,application/octet-stream','accept-encoding':'identity','user-agent':userAgent()}},
  {maxBytes:TED_PACKAGE_MAX_BYTES,fileDownload:true,binary:true,parameters:{ojs},classify:c=>({challenge:tedPackageRejected(c.status,c.headers,c.bytes)})});
 const disposition=r.headers.get('content-disposition'),filename=disposition?/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1]??null:null;
 return {status:r.status,filename,bytes:r.status===200?r.bytes:null};
}

export function getTedCollectionClient():TedClient{
 if(testOverride)return testOverride;if(singleton)return singleton;
 const transport:typeof fetch=async(input,init)=>{
  const url=String(input),method=init?.method??'GET';
  if(!isTedCollectionUrl(url))throw Error('Unexpected TED collection host');
  const parameters=tedRequestParameters(url,method,init?.body);
  const r=await gatedTedRequest(url,{method,headers:Object.fromEntries(new Headers(init?.headers)),...(typeof init?.body==='string'?{body:init.body}:{})},
   {maxBytes:MAX_BYTES,fileDownload:false,binary:false,parameters,classify:c=>{
    const challenge=tedChallenge(c.status,c.headers);
    if(challenge||c.status!==200||method!=='POST')return {challenge};
    try{const data=JSON.parse(c.bytes.toString('utf8'));return {challenge,...(Array.isArray(data?.notices)?{records:data.notices.length}:{})};}catch{throw Error('Invalid JSON response');}
   }});
  return new Response(r.bytes,{status:r.status,headers:r.headers});
 };
 singleton=createTedClient({userAgent:userAgent(),httpClient:createHttpClient({baseUrl:TED_API_BASE,userAgent:userAgent(),transport,maxConcurrency:10,minDelayMs:0,maxRetries:0,circuitThreshold:0})});
 return singleton;
}
