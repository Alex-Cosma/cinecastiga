import {ProxyAgent,fetch as proxyFetch} from 'undici';
import {proxyConnection,type SeapProxy} from '@seap/db';
/** The dispatcher lives until the caller consumes the full body. No direct fallback or redirect replay. */
export async function withProxyResponse<T>(url:string,init:{method?:string;headers?:Record<string,string>;body?:unknown},proxy:SeapProxy,signal:AbortSignal,consume:(response:Response)=>Promise<T>):Promise<T>{
 const p=proxyConnection(proxy);
 const dispatcher=new ProxyAgent({uri:p.server,token:`Basic ${Buffer.from(`${p.username}:${p.password}`).toString('base64')}`,connections:1});
 try{
  const response=await proxyFetch(url,{method:init.method??'GET',headers:Object.fromEntries(new Headers(init.headers)),...(typeof init.body==='string'?{body:init.body}:{}),redirect:'manual',signal,dispatcher});
  // Both implement the WHATWG response contract; keep external undici types private.
  return await consume(response as unknown as Response);
 }finally{await dispatcher.destroy();}
}
