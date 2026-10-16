import {createHttpClient,createTedClient,TED_API_BASE,type TedClient} from '@seap/scraper-clients';
import {CollectionTransportError,collectionWorkerId,currentCollectionContext,isTedCollectionUrl,responseDiagnosticBody,retryableProxyTransport,runCollectionRequest} from '@seap/db';
import {getSharedSql} from '../../db.js';
import {withProxyResponse} from '../elicitatie/proxy-fetch.js';

/**
 * TED through the shared collection gate: the same admission, proxy pool and
 * per-IP spacing, quiet window, ledger and retries as SEAP requests. Only the two
 * exact TED resources are accepted; no Referer, no redirect following.
 */
let singleton:TedClient|null=null,testOverride:TedClient|null=null;
const worker=collectionWorkerId('ted-http');
const MAX_BYTES=32*1024*1024;
export function setTedCollectionClientForTests(client:TedClient|null){testOverride=client;}

/** Ledger parameters: the day/page of a search or the publication number, never the query text. */
export function tedRequestParameters(url:string,method:string,body:unknown):Record<string,unknown>{
 const u=new URL(url);
 if(u.hostname==='ted.europa.eu'&&method==='GET')return {publicationNumber:u.pathname.split('/')[3]};
 if(u.hostname!=='api.ted.europa.eu'||method!=='POST'||typeof body!=='string')throw Error('Unexpected TED collection request');
 const b=JSON.parse(body) as {query?:unknown;page?:unknown;limit?:unknown};
 const day=typeof b.query==='string'?/publication-date>=(\d{4})(\d{2})(\d{2})\b/.exec(b.query):null;
 if(!day)throw Error('TED search without a publication day');
 return {publicationDate:`${day[1]}-${day[2]}-${day[3]}`,page:b.page,limit:b.limit};
}

export function getTedCollectionClient():TedClient{
 if(testOverride)return testOverride;if(singleton)return singleton;
 const userAgent=process.env['SCRAPE_UA']??'seap-analytics/0.1 (contact: cineseuita@gmail.com)';
 const transport:typeof fetch=async(input,init)=>{
  const url=String(input),method=init?.method??'GET';
  if(!isTedCollectionUrl(url))throw Error('Unexpected TED collection host');
  const parameters=tedRequestParameters(url,method,init?.body);
  const q=await getSharedSql().reserve();
  try{return await runCollectionRequest(q,{stream:'ted',worker,context:currentCollectionContext(),method,url,parameters},async(signal,proxy)=>{
   const diagnostic:Record<string,unknown>={phase:'headers',request:{origin:new URL(url).origin,path:new URL(url).pathname,headers:Object.fromEntries(new Headers(init?.headers)),headerScope:'application-provided; transport may add automatic headers',body:typeof init?.body==='string'?init.body:null}};
   const chunks:Uint8Array[]=[];let size=0;
   const consume=async(response:Response)=>{
    diagnostic.response={status:response.status,statusText:response.statusText,headers:Object.fromEntries(response.headers)};diagnostic.phase='body';
    const reader=response.body?.getReader();
    if(reader)for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>MAX_BYTES){await reader.cancel();throw Error('Source response exceeds budget');}chunks.push(r.value);}
    const bytes=Buffer.concat(chunks);let records:number|undefined;
    diagnostic.phase='complete';diagnostic.response={...(diagnostic.response as object),...responseDiagnosticBody(bytes,true)};
    if(method==='POST'&&response.status>=200&&response.status<300){
     try{const data=JSON.parse(bytes.toString('utf8'));if(Array.isArray(data?.notices))records=data.notices.length;}catch{throw Error('Invalid JSON response');}
    }else if(response.status>=200&&response.status<300)records=1;
    return {value:new Response(bytes,{status:response.status,headers:response.headers}),status:response.status,bytes:size,...(records===undefined?{}:{records}),challenge:false,retryAfter:response.headers.get('retry-after'),diagnostics:diagnostic};
   };
   try{return proxy?await withProxyResponse(url,{method,headers:Object.fromEntries(new Headers(init?.headers)),body:init?.body},proxy,signal,consume):await consume(await fetch(input,{...init,redirect:'manual',signal}));
   }catch(error){diagnostic.retryableProxyTransport=!!proxy&&retryableProxyTransport(error);diagnostic.response={...(diagnostic.response as object??{}),...responseDiagnosticBody(Buffer.concat(chunks),diagnostic.phase==='complete'),observedBytes:size,captureLimitBytes:MAX_BYTES,truncated:size>MAX_BYTES};throw new CollectionTransportError(proxy?new Error('Conexiunea proxy a eșuat; fără conexiune directă.'):error,diagnostic);}
  });}finally{q.release();}
 };
 singleton=createTedClient({userAgent,httpClient:createHttpClient({baseUrl:TED_API_BASE,userAgent,transport,maxConcurrency:10,minDelayMs:0,maxRetries:0,circuitThreshold:0})});
 return singleton;
}
