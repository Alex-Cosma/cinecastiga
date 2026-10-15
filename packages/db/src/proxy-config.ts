import {readFile} from 'node:fs/promises';
import {isIP} from 'node:net';
export interface SeapProxy {
 id:string;
 server:string;
 username:string;
 password:string;
}
type Environment=Record<string,string|undefined>;
export class SeapProxyConfigurationError extends Error {
 constructor(){super('Configurația proxy SEAP este invalidă. Verifică fișierul local; conexiunea directă nu va fi folosită.');this.name='SeapProxyConfigurationError';}
}
const invalid=()=>new SeapProxyConfigurationError();

/** Only fixed IP endpoints, never a rotating gateway: one browser = one egress. */
export function parseSeapProxies(text:string):SeapProxy[]{
 try{
  if(Buffer.byteLength(text)>64*1024)throw invalid();
  const data:unknown=JSON.parse(text);
  if(!Array.isArray(data)||!data.length||data.length>100)throw invalid();
  const ids=new Set<string>(), ips=new Set<string>();
  return data.map((item:unknown)=>{
   if(!item||typeof item!=='object'||Array.isArray(item))throw invalid();
   const p=item as Record<string,unknown>;
   if(Object.keys(p).some(k=>!['id','server','username','password'].includes(k)))throw invalid();
   if(typeof p.id!=='string'||!/^proxy-[1-9]\d{0,2}$/.test(p.id)||ids.has(p.id))throw invalid();
   ids.add(p.id);
   if(typeof p.server!=='string')throw invalid();
   const url=new URL(p.server);
   const host=url.hostname.replace(/^\[|\]$/g,'');
   if(!['http:','https:'].includes(url.protocol)||!isIP(host)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw invalid();
   if(ips.has(host))throw invalid();ips.add(host);
   for(const key of ['username','password'] as const){if(typeof p[key]!=='string'||!p[key].length||p[key].length>512||p[key].startsWith('REPLACE_')||/[\x00-\x1f\x7f]/.test(p[key]))throw invalid();}
   return {id:p.id,server:url.origin,username:p.username as string,password:p.password as string};
  });
 }catch{throw invalid();} // Never include JSON, URLs or parser errors carrying credentials.
}


export async function loadSeapProxies(env:Environment=process.env):Promise<SeapProxy[]>{
 if(!env.SEAP_PROXY_FILE)return [];
 try{return parseSeapProxies(await readFile(env.SEAP_PROXY_FILE,'utf8'));}catch{throw invalid();}
}
export function proxyConnection(p:SeapProxy,env:Environment=process.env):SeapProxy{
 if(!env.SEAP_PROXY_RELAY_HOST)return p;
 if(!/^[a-z0-9-]+$/.test(env.SEAP_PROXY_RELAY_HOST)||!p.server.startsWith('http:'))throw invalid();
 return {...p,server:`http://${env.SEAP_PROXY_RELAY_HOST}:${18000+Number(p.id.slice(6))}`};
}
