import {chromium,type Browser,type BrowserContext,type BrowserContextOptions} from 'playwright-core';
import {documentBrowserOptions,launchDocumentBrowser,proxyTransportError,type DocumentProxy} from './proxy';

/** One browser serves every proxied session: each session is its own context (cookies, cache, proxy).
 * A browser per session cost ~150 MB, so 100 lanes did not fit the documents container. */
let shared:Promise<Browser>|null=null;
async function sharedBrowser(){
 if(shared){const browser=await shared.catch(()=>null);if(browser?.isConnected())return browser;shared=null;}
 // Every context sets its own proxy; the launch-level one is a placeholder Chromium requires and never uses.
 const launching=chromium.launch({...documentBrowserOptions(null),args:['--disable-dev-shm-usage','--disable-quic'],proxy:{server:'http://per-context'}});
 shared=launching;
 const browser=await launching.catch(error=>{if(shared===launching)shared=null;throw error;});
 browser.on('disconnected',()=>{if(shared===launching)shared=null;});
 return browser;
}

export interface DocumentSession {context:BrowserContext;close():Promise<void>}
/** Direct mode (no proxy pool) keeps its own browser, as before. */
export async function openDocumentContext(proxy:DocumentProxy|null,options:BrowserContextOptions):Promise<DocumentSession>{
 if(!proxy){
  const browser=await launchDocumentBrowser(null);
  try{const context=await browser.newContext(options);return {context,close:()=>browser.close()};}
  catch(error){await browser.close().catch(()=>{});throw error;}
 }
 let browser:Browser;
 try{browser=await sharedBrowser();}catch(error){throw proxyTransportError(error);}
 try{
  const context=await browser.newContext({...options,proxy:{server:proxy.server,username:proxy.username,password:proxy.password,bypass:'<-loopback>'}});
  return {context,close:()=>context.close()};
 }catch(error){throw proxyTransportError(error);}
}

/** Shutdown only: sessions close their own contexts. */
export async function closeSharedBrowser(){const pending=shared;shared=null;const browser=await pending?.catch(()=>null);await browser?.close().catch(()=>{});}
