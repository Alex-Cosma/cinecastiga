// Self-contained: Playwright serializes this function into an isolated browser page.
export async function browserDocumentRequest({url,method,body,maxFileBytes}:{url:string;method:string;body:unknown;maxFileBytes:number}){
      const response=await fetch(url,{method,credentials:'include',redirect:'manual',signal:AbortSignal.timeout(40000),headers:{Accept:'application/json, text/plain, */*',Authorization:'Bearer null',HttpSessionID:'null',RefreshToken:'null',Culture:'ro-RO',...(body===null?{}:{'Content-Type':'application/json;charset=UTF-8'})},...(body===null?{}:{body:JSON.stringify(body)})});
      const chunks:Uint8Array[]=[];let size=0;const reader=response.body?.getReader();
      if(reader)for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>(method==='GET'?maxFileBytes:2*1024*1024)){await reader.cancel();return {status:response.status,base64:'',retryAfter:response.headers.get('retry-after'),oversized:true,receivedBytes:size};}chunks.push(x.value);}
      let binary='';for(const c of chunks)for(let i=0;i<c.length;i+=4096)binary+=String.fromCharCode(...c.subarray(i,i+4096));
      return {status:response.status,base64:btoa(binary),retryAfter:response.headers.get('retry-after'),oversized:false,receivedBytes:size};
     }

// Backpressure: only one small chunk crosses the browser/Node boundary at a time.
export async function browserDocumentStream({url,sink}:{url:string;sink:string}){
 const response=await fetch(url,{method:'GET',credentials:'include',redirect:'manual',signal:AbortSignal.timeout(590000),headers:{Accept:'application/octet-stream, */*',Authorization:'Bearer null',HttpSessionID:'null',RefreshToken:'null',Culture:'ro-RO'}});
 let size=0;const reader=response.body?.getReader();
 try{if(reader)for(;;){const r=await reader.read();if(r.done)break;
  for(let i=0;i<r.value.length;i+=65536){const chunk=r.value.subarray(i,i+65536);size+=chunk.length;
   let binary='';for(let j=0;j<chunk.length;j+=4096)binary+=String.fromCharCode(...chunk.subarray(j,j+4096));
   await (globalThis as unknown as Record<string,(value:string)=>Promise<void>>)[sink]!(btoa(binary));
  }
 }}catch(error){await reader?.cancel().catch(()=>{});throw error;}
 return {status:response.status,retryAfter:response.headers.get('retry-after'),receivedBytes:size};
}
