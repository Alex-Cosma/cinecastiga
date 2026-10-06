import {isIP} from 'node:net';
import {fileURLToPath} from 'node:url';
import {continueDocumentRequest,DocumentProxyConfigurationError,launchDocumentBrowser,loadDocumentProxy,proxyTransportError} from '../../lib/documents/proxy';

// A single permitted HTTPS navigation. No DB, no SEAP, no direct-IP comparison.
const target='https://ipv4.webshare.io/';
let browser:Awaited<ReturnType<typeof launchDocumentBrowser>>|undefined;
let attempts=0;
try{
 const proxy=await loadDocumentProxy({...process.env,DOCUMENTS_PROXY_REQUIRED:'true',DOCUMENTS_PROXY_FILE:process.env.DOCUMENTS_PROXY_FILE??fileURLToPath(new URL('../../seap-proxies.local',import.meta.url))});
 if(!proxy)throw Error('Proxy necesar.');
 browser=await launchDocumentBrowser(proxy);
 const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  if(route.request().url()!==target||route.request().method()!=='GET'||attempts){await route.abort();return;}
  attempts++;await continueDocumentRequest(route);
 });
 const page=await context.newPage();
 const response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});
 if(response?.status()!==200)throw Error('Proxy check failed.');
 const observed=(await response.text()).trim();
 const expected=new URL(proxy.server).hostname.replace(/^\[|\]$/g,'');
 if(!isIP(observed)||observed!==expected)throw Error('Unexpected exit IP.');
 console.log(JSON.stringify({event:'document-proxy-check',status:'passed',proxyId:proxy.id,exitIp:observed,requests:attempts,seapRequests:0}));
}catch(error){
 console.error(JSON.stringify({event:'document-proxy-check',status:'failed',requests:attempts,seapRequests:0,message:error instanceof DocumentProxyConfigurationError?error.message:proxyTransportError(error).message}));
 process.exitCode=1;
}finally{await browser?.close();}
