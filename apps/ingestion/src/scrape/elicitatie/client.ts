import { createElicitatieClient, type ElicitatieClient } from '@seap/scraper-clients';
import { currentCollectionStream,runCollectionRequest,collectionWorkerId } from '@seap/db';
import { getSharedSql } from '../../db.js';
let singleton:ElicitatieClient|null=null,testOverride:ElicitatieClient|null=null;
const worker=collectionWorkerId('ingestion-http');
export function setElicitatieClientForTests(client:ElicitatieClient|null){testOverride=client;}
export function getElicitatieClient():ElicitatieClient{
 if(testOverride)return testOverride;if(singleton)return singleton;
 singleton=createElicitatieClient({
  userAgent:process.env['SCRAPE_UA']??'seap-analytics/0.1 (contact: cineseuita@gmail.com)',
  maxConcurrency:1,minDelayMs:0,maxRetries:0,circuitThreshold:0,
  transport:async(input,init)=>{
   const url=String(input),path=new URL(url).pathname;
   if(!['e-licitatie.ro','www.e-licitatie.ro'].includes(new URL(url).hostname))throw Error('Unexpected collection host');
   const stream=currentCollectionStream()??(path.includes('DirectAcquisition')?'da':path.includes('GetCANotice')?'awards':path.includes('GetCNoticeList')?'tenders':'catalogue');
   const q=await getSharedSql().reserve();
   try{return await runCollectionRequest(q,{stream,worker,method:init?.method??'GET',url,parameters:typeof init?.body==='string'?JSON.parse(init.body):{}},async signal=>{
    // Redirects and retries are never hidden extra requests. Consume the body
    // before releasing the global lock, including slow/chunked responses.
    const response=await fetch(input,{...init,redirect:'manual',signal});
    const chunks:Uint8Array[]=[];let size=0;const reader=response.body?.getReader();
    if(reader)for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>32*1024*1024){await reader.cancel();throw Error('Source response exceeds budget');}chunks.push(r.value);}
    const bytes=Buffer.concat(chunks);let records:number|undefined;
    const text=bytes.toString('utf8');try{const data=JSON.parse(text);if(Array.isArray(data?.items))records=data.items.length;}catch{}
    const challenge=response.status===200&&!response.headers.get('content-type')?.includes('json');
    return {value:new Response(bytes,{status:response.status,headers:response.headers}),status:response.status,bytes:size,...(records===undefined?{}:{records}),challenge,retryAfter:response.headers.get('retry-after')};
   });}finally{q.release();}
  }
 });return singleton;
}
