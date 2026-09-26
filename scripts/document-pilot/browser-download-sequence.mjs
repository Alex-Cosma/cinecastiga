// One bounded diagnostic in a fresh Chrome context. No supplied user cookie.
import {readFile,writeFile,open,unlink,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {DOWNLOAD_SEQUENCE} from './download-sequence.mjs';
const directory=resolve('.local/document-pilot-buzau-20260926'),plan=DOWNLOAD_SEQUENCE;
const ledgerPath=join(directory,'ledger.json'),sha=b=>createHash('sha256').update(b).digest('hex');
const lock=await open(join(directory,'run.lock'),'wx',0o600);
const freshLinks=process.argv.includes('--fresh-links'),startCount=freshLinks?14:12,requestLimit=freshLinks?18:15;
let fileUrl=plan.url,freshSource;
let ws,context,session,ledger,cdp,active,attempt,mainResponse,grantRecorded=false,blocked=0;
const approval={id:freshLinks?'buzau-same-session-fresh-links-15-18':'buzau-isolated-chrome-diagnostic-13-15',authorizedAt:new Date().toISOString(),expectedPriorAttempts:startCount,additionalRequests:requestLimit-startCount,cumulativeRequestLimit:requestLimit,reason:freshLinks?'User permits exceeding10with live count reporting; announced15GET page,16POST read-only document list,17POST freshly returned file URL,18GET only on verification success. Tests session-bound download links with own session, no user cookie.':'User permits exceeding10with live request-count reporting and asks to resolve session discrepancy. Reported13GET page,14POST,15GET only on success. Fresh browser context, abort every other request; no supplied cookie reused.'};
const save=async()=>{await writeFile(ledgerPath+'.tmp',JSON.stringify(ledger,null,2)+'\n',{mode:0o600});await rename(ledgerPath+'.tmp',ledgerPath)};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let resolvePage,rejectPage;
const pageReady=new Promise((r,j)=>{resolvePage=r;rejectPage=j});pageReady.catch(()=>{});
try{
 ledger=JSON.parse(await readFile(ledgerPath,'utf8'));
 if(ledger.attempts.length!==startCount||!ledger.stopped||ledger.attempts.some(a=>a.state==='reserved')||ledger.sequenceApprovals?.some(a=>a.id===approval.id))throw Error('Unexpected or already consumed browser-test starting ledger');
 // CDP localhost calls are not SEAP requests.
 const version=await(await fetch('http://127.0.0.1:9237/json/version')).json();
 ws=new WebSocket(version.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
 let serial=0;const pending=new Map();
 cdp=(method,params={},sid=session)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}))});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);return}if(m.sessionId!==session)return;
  if(m.method==='Fetch.requestPaused')void route(m.params).catch(error=>{rejectPage(error);console.error('Browser routing stopped:',error.message)});
  if(m.method==='Network.responseReceived'&&m.params.response.url===plan.referer)mainResponse=m.params;
  if(m.method==='Network.loadingFinished'&&mainResponse?.requestId===m.params.requestId)resolvePage(mainResponse);
 };
 async function route(event){
  const request=event.request;
  if(!active||request.url!==active.url||request.method!==active.method){blocked++;await cdp('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});return}
  const step=active;active=null;
  if(ledger.attempts.length>=requestLimit)throw Error('Browser request cap reached');
  const elapsed=Date.now()-Date.parse(ledger.attempts.at(-1).startedAt);if(elapsed<15000)await pause(15000-elapsed);
  attempt={number:ledger.attempts.length+1,id:'browser-'+step.id,url:request.url,method:request.method,noticeId:plan.noticeId,institutionCui:plan.institutionCui,provenance:freshSource&&request.url===fileUrl?'Exact fresh noticeDocumentUrl for '+freshSource.documentCode+' from same-browser-session list response '+freshSource.requestNumber:plan.provenance,...(freshSource&&request.url===fileUrl?{sourceDocument:freshSource}:{}),startedAt:new Date().toISOString(),state:'reserved',bytes:0,sequenceApprovalId:approval.id,requestReferer:request.headers.Referer||request.headers.referer||null,requestOrigin:request.headers.Origin||request.headers.origin||null};
  ledger.attempts.push(attempt);await save();console.log(`Request ${attempt.number}: Chrome ${request.method} ${request.url}`);
  await cdp('Fetch.continueRequest',{requestId:event.requestId});
 }
 context=(await cdp('Target.createBrowserContext',{},null)).browserContextId;
 const target=(await cdp('Target.createTarget',{url:'about:blank',browserContextId:context},null)).targetId;
 session=(await cdp('Target.attachToTarget',{targetId:target,flatten:true},null)).sessionId;
 await cdp('Network.enable');await cdp('Network.setCacheDisabled',{cacheDisabled:true});await cdp('Network.setBypassServiceWorker',{bypass:true});
 await cdp('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});await cdp('Page.enable');
 // Prevent page scripts executing. Runtime evaluation via DevTools remains available.
 await cdp('Emulation.setScriptExecutionDisabled',{value:true});
 ledger.sequenceApprovals??=[];ledger.sequenceApprovals.push({...approval,previousStop:ledger.stopped});grantRecorded=true;await save();
 active={id:'session-page',method:'GET',url:plan.referer};await cdp('Page.navigate',{url:plan.referer});
 const pageTimer=setTimeout(()=>rejectPage(Error('Page load timeout')),20000);
 const page=await pageReady.finally(()=>clearTimeout(pageTimer));
 const pageBody=await cdp('Network.getResponseBody',{requestId:page.requestId});
 const bytes=Buffer.from(pageBody.body,pageBody.base64Encoded?'base64':'utf8');
 attempt.status=page.response.status;attempt.contentType=page.response.mimeType;attempt.bytes=bytes.length;ledger.bytes+=bytes.length;
 if(bytes.length>2*1024*1024)throw Error('Page too large');
 attempt.sha256=sha(bytes);attempt.file=`browser-response-${attempt.number}-${attempt.sha256.slice(0,12)}.html`;await writeFile(join(directory,attempt.file),bytes,{mode:0o600,flag:'wx'});
 const ownCookies=await cdp('Network.getCookies',{urls:[plan.url]});attempt.cookieNames=ownCookies.cookies.map(c=>c.name);attempt.cookieCount=ownCookies.cookies.length;
 attempt.state=attempt.status===200?'complete':'failed';await save();console.log(`Request ${attempt.number}: HTTP ${attempt.status}; cookie names: ${attempt.cookieNames.join(', ')||'(none)'}`);
 if(attempt.status!==200)throw Error('Browser page request failed');
 // Replace the document locally, retaining its URL/cookies. No site script or asset loads.
 await cdp('Page.setDocumentContent',{frameId:page.frameId,html:'<!doctype html><title>Bounded SEAP download diagnostic</title>'});
 if(freshLinks){
  const listUrl=plan.origin+'/api-pub/NoticeDocument/GetAll/';
  const manifest=JSON.parse(await readFile(resolve('docs/implementation/previews/batch5-document-pilot/manifest.json'),'utf8'));
  const filter=manifest.requests.find(r=>r.id==='notice-documents').body;
  active={id:'fresh-document-list',method:'POST',url:listUrl};
  const expression=`(async()=>{const r=await fetch(${JSON.stringify(listUrl)},{method:'POST',credentials:'include',redirect:'manual',signal:AbortSignal.timeout(40000),headers:{'Content-Type':'application/json;charset=UTF-8',Accept:'application/json, text/plain, */*',Authorization:'Bearer null',HttpSessionID:'null',RefreshToken:'null',Culture:'ro-RO'},body:${JSON.stringify(JSON.stringify(filter))}});return {status:r.status,text:await r.text()}})()`;
  const evaluated=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,timeout:45000});
  if(evaluated.exceptionDetails)throw Error('Browser list fetch failed');
  const result=evaluated.result.value,bytes=Buffer.from(result.text);
  attempt.status=result.status;attempt.bytes=bytes.length;ledger.bytes+=bytes.length;attempt.sha256=sha(bytes);attempt.file=`browser-response-${attempt.number}-${attempt.sha256.slice(0,12)}.json`;
  await writeFile(join(directory,attempt.file),bytes,{mode:0o600,flag:'wx'});
  if(result.status!==200||bytes.length>2*1024*1024){attempt.state='failed';throw Error('Fresh document list failed')}
  const documents=JSON.parse(result.text);
  const selected=documents.items?.find(d=>d.noticeDocumentId===110778324&&d.noticeDocumentCode==='SCN1168231/00054');
  if(!selected?.noticeDocumentUrl)throw Error('Expected notice-bound document not in fresh list');
  fileUrl=new URL(selected.noticeDocumentUrl,plan.origin+'/').href;
  if(new URL(fileUrl).origin!==plan.origin||!/^\/api-pub\/files\/noticedoc\/[a-f0-9]{32}$/i.test(new URL(fileUrl).pathname))throw Error('Unexpected fresh download URL');
  freshSource={requestNumber:attempt.number,responseSha256:attempt.sha256,documentId:selected.noticeDocumentId,documentCode:selected.noticeDocumentCode,filename:selected.documentName};
  attempt.selectedDocument={documentId:selected.noticeDocumentId,documentCode:selected.noticeDocumentCode,fileUrl,filename:selected.documentName};attempt.state='complete';await save();
  console.log(`Request ${attempt.number}: HTTP200, selected ${selected.documentName}, fresh URL ${fileUrl}`);
 }
 for(const method of ['POST','GET']){
  active={id:method.toLowerCase(),method,url:fileUrl};
  const expression=`(async()=>{const response=await fetch(${JSON.stringify(fileUrl)},{method:${JSON.stringify(method)},credentials:'include',redirect:'manual',signal:AbortSignal.timeout(40000),headers:{Accept:'application/json, text/plain, */*',Authorization:'Bearer null',HttpSessionID:'null',RefreshToken:'null',Culture:'ro-RO','Cache-Control':'no-cache',Pragma:'no-cache'}});const chunks=[];let size=0;const reader=response.body?.getReader();if(reader){for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>${method==='POST'?65536:10485760}){await reader.cancel();throw Error('Body too large')}chunks.push(x.value)}}let binary='';for(const chunk of chunks)for(let i=0;i<chunk.length;i+=4096)binary+=String.fromCharCode(...chunk.subarray(i,i+4096));return {status:response.status,contentType:response.headers.get('content-type'),contentDisposition:response.headers.get('content-disposition'),body:btoa(binary)}})()`;
  const evaluated=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,timeout:45000});
  if(evaluated.exceptionDetails)throw Error('Browser fetch failed: '+(evaluated.exceptionDetails.exception?.description||evaluated.exceptionDetails.text));
  const response=evaluated.result.value,body=Buffer.from(response.body,'base64');
  attempt.status=response.status;attempt.contentType=response.contentType;attempt.contentDisposition=response.contentDisposition;attempt.bytes=body.length;ledger.bytes+=body.length;attempt.sha256=sha(body);attempt.file=`browser-response-${attempt.number}-${attempt.sha256.slice(0,12)}.bin`;
  await writeFile(join(directory,attempt.file),body,{mode:0o600,flag:'wx'});
  console.log(`Request ${attempt.number}: HTTP ${response.status}, ${body.length} bytes`);
  if(response.status!==200){attempt.state='failed';await save();console.log('Response:',body.toString('utf8').slice(0,1500));throw Error('Browser request failed; no next request')}
  if(method==='POST'&&JSON.parse(body.toString('utf8'))!==''){attempt.state='rejected';throw Error('Unexpected verification response')}
  if(method==='GET'){
   const isPdf=body.subarray(0,5).toString()==='%PDF-';
   const isCms=!isPdf&&spawnSync('openssl',['cms','-cmsout','-inform','DER','-noout','-in',join(directory,attempt.file)],{timeout:10000,maxBuffer:4096}).status===0;
   if(!isPdf&&!isCms){attempt.state='rejected';throw Error('Downloaded response is not PDF or CMS')}
   const filename=attempt.file.replace(/\.bin$/,isPdf?'.pdf':'.p7s');await rename(join(directory,attempt.file),join(directory,filename));attempt.file=filename;attempt.fileType=isPdf?'pdf':'cms';
   if(isPdf)ledger.pdfCount++;else ledger.cmsCount=(ledger.cmsCount||0)+1;ledger.downloadedDocuments=(ledger.downloadedDocuments||0)+1;
  }
  attempt.state='complete';await save();
 }
 ledger.stopped={reason:'Bounded browser diagnostic completed; downloaded bytes require offline inspection.',at:new Date().toISOString()};await save();
}catch(error){
 console.error(error.message);process.exitCode=1;
 if(grantRecorded){if(attempt?.state==='reserved')attempt.state='failed';ledger.stopped={reason:error.message,at:new Date().toISOString()};await save()}
}finally{
 if(context&&cdp)await cdp('Target.disposeBrowserContext',{browserContextId:context},null).catch(()=>{});
 ws?.close();await lock.close();await unlink(join(directory,'run.lock'));
 if(ledger)console.log(JSON.stringify({requestsUsed:ledger.attempts.length,subresourcesBlockedBeforeTransmission:blocked,lastAttempt:ledger.attempts.at(-1)},null,2));
}
