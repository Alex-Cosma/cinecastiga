import {CollectionTransportError} from '@seap/db';
import {randomInt} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {chromium, type LaunchOptions, type Route} from 'playwright-core';

import {parseSeapProxies as parseDocumentProxies, SeapProxyConfigurationError as DocumentProxyConfigurationError, type SeapProxy as DocumentProxy} from '@seap/db';
export {parseDocumentProxies,DocumentProxyConfigurationError};
export type {DocumentProxy};
type Environment=Record<string,string|undefined>;
const invalid=()=>new DocumentProxyConfigurationError();

export async function loadDocumentProxy(env:Environment=process.env):Promise<DocumentProxy|null>{
 const required=env.DOCUMENTS_PROXY_REQUIRED;
 if(required!==undefined&&!['true','false'].includes(required))throw invalid();
 const file=env.DOCUMENTS_PROXY_FILE;
 if(!file){if(required==='true')throw invalid();return null;}
 let proxies:DocumentProxy[];
 try{proxies=parseDocumentProxies(await readFile(file,'utf8'));}catch{throw invalid();}
 return proxies[randomInt(proxies.length)]!;
}

export function documentBrowserOptions(proxy:DocumentProxy|null,env:Environment=process.env):LaunchOptions{
 return {
  executablePath:env.DOCUMENTS_CHROMIUM??'/usr/bin/chromium',headless:true,
  args:['--disable-dev-shm-usage',...(proxy?['--disable-quic']:[])],
  ...(proxy?{proxy:{server:proxy.server,username:proxy.username,password:proxy.password,bypass:'<-loopback>'}}:{}),
 };
}

/** No raw Playwright diagnostics in proxy mode: they can contain endpoint secrets. */
export function proxyTransportError(error:unknown):Error{
 const message=error instanceof Error?error.message:'';
 const codes=['ERR_PROXY_CONNECTION_FAILED','ERR_TUNNEL_CONNECTION_FAILED','ERR_INVALID_AUTH_CREDENTIALS','ERR_PROXY_AUTH_UNSUPPORTED','ERR_TIMED_OUT','ERR_CONNECTION_CLOSED','ERR_CONNECTION_RESET','ERR_CERT_AUTHORITY_INVALID'];
 const code=codes.find(c=>message.includes(c))??(/timeout/i.test(message)?'TIMEOUT':'TRANSPORT_FAILED');
 const safe=new CollectionTransportError(new Error(`SEAP: conexiunea prin proxy a eșuat (${code}). Nu s-a încercat o conexiune directă.`),{retryableProxyTransport:code!=='TRANSPORT_FAILED'});
 delete safe.cause;return safe;
}

export async function launchDocumentBrowser(proxy:DocumentProxy|null){
 try{return await chromium.launch(documentBrowserOptions(proxy));}
 catch(error){if(proxy)throw proxyTransportError(error);throw error;}
}

/** Navigation redirects bypass Playwright's route allowlist. Fetch only the
 * initial response in this context (same proxy/cookies), never follow redirects.
 * Subrequests use native fetch with redirect:manual in the document transport. */
export async function continueDocumentRequest(route:Route){
 if(!route.request().isNavigationRequest()){await route.continue();return;}
 try{
  const response=await route.fetch({maxRedirects:0,maxRetries:0,timeout:40000});
  try{
   if(response.status()>=300&&response.status()<400){await route.abort();return;}
   await route.fulfill({response});
  }finally{await response.dispose();}
 }catch{
  // Surface failure through page.goto, not an unhandled route exception with secrets.
  await route.abort('failed').catch(()=>{});
 }
}
