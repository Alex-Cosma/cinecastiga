import {mkdir,open,readFile,rename,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

export const PILOT_POLICY=Object.freeze({version:1,institutionCui:'4233874',noticeIds:['100231768','100230829'],maxRequests:10,minDelayMs:15000,maxPdfs:2,maxPdfBytes:10*1024*1024,maxMetadataBytes:2*1024*1024,maxTotalBytes:20*1024*1024,timeoutMs:20000,maxRunMs:15*60*1000,origins:['https://e-licitatie.ro','https://www.e-licitatie.ro']});
const sha=value=>createHash('sha256').update(value).digest('hex');
export class PilotStop extends Error{}
async function jsonFile(path,value){const temp=path+'.tmp';await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(temp,path)}
/** One exclusive run lock covers throttle, durable reservation and manual redirects. */
export async function pilotRequest({directory,request,retryApproval,policy=PILOT_POLICY,fetchImpl=fetch,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 await mkdir(directory,{recursive:true,mode:0o700});let lock;
 try{lock=await open(join(directory,'run.lock'),'wx',0o600)}catch{throw new PilotStop('Another run holds the pilot lock; no request sent. A stale lock must be inspected, not automatically removed.')}
 const path=join(directory,'ledger.json');let ledger;
 try{
  const fingerprint=sha(JSON.stringify(policy));
  try{ledger=JSON.parse(await readFile(path,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error;ledger={version:1,policy,policyHash:fingerprint,startedAt:null,attempts:[],pdfCount:0,bytes:0,stopped:null};await jsonFile(path,ledger)}
  if(ledger.policyHash!==fingerprint)throw new PilotStop('Pilot policy differs from the durable ledger. Refusing to reset or enlarge its limits.');
  const save=()=>jsonFile(path,ledger);
  async function stop(reason){ledger.stopped={reason,at:new Date(now()).toISOString()};await save();throw new PilotStop(reason)}
  if(retryApproval){
   const previous=ledger.attempts.at(-1),age=now()-Date.parse(retryApproval.approvedAt);
   let matchesFailure=previous?.status===500&&previous.url===request.url&&!retryApproval.correction;
   if(retryApproval.correction==='align-public-origin'&&previous?.status===403&&previous.errorBodyFile){
    const diagnostic=await readFile(join(directory,previous.errorBodyFile));
    const source=new URL(previous.url),target=new URL(request.url),ref=new URL(request.referer);
    let message;try{message=JSON.parse(diagnostic.toString()).message}catch{}
    matchesFailure=sha(diagnostic)===previous.errorBodySha256&&message==='Access Denied: Referer and Origin headers mismatch'&&policy.origins.includes(source.origin)&&policy.origins.includes(target.origin)&&target.hostname==='www.'+source.hostname&&target.protocol===source.protocol&&target.port===source.port&&target.pathname===source.pathname&&target.search===source.search&&target.hash===source.hash&&!target.username&&!target.password&&request.origin===target.origin&&ref.origin===target.origin&&ref.pathname==='/pub/notices/simplified-notice/v2/view/'+request.noticeId;
   }
   if(!retryApproval.id||!retryApproval.reason||!Number.isFinite(age)||age<0||age>=policy.maxRunMs||!ledger.stopped||ledger.attempts.length!==retryApproval.afterAttempt||ledger.retryApprovals?.some(a=>a.id===retryApproval.id)||previous?.state!=='failed'||!matchesFailure||previous.id!==request.id||previous.kind!=='pdf'||request.kind!=='pdf'||(request.method||'GET')!=='GET')throw new PilotStop('Single-retry approval is expired, consumed or does not match the stopped PDF attempt.');
  }
  if(ledger.stopped&&!retryApproval)throw new PilotStop('Pilot already stopped: '+ledger.stopped.reason);
  if(ledger.attempts.some(a=>a.state==='reserved'))await stop('Interrupted request has uncertain outcome and consumes budget. Review before any further network call.');
  if(request.institutionCui!==policy.institutionCui||!policy.noticeIds.includes(request.noticeId)||!request.provenance||!['json','html','javascript','pdf'].includes(request.kind))throw new PilotStop('Request lacks approved institution, notice binding, type or provenance.');
  if(request.origin&&(!policy.origins.includes(request.origin)||request.origin!==new URL(request.url).origin||new URL(request.referer).origin!==request.origin))throw new PilotStop('Explicit Origin must match the allowlisted destination and Referer.');
  const method=request.method||'GET';const body=method==='POST'?JSON.stringify(request.body):undefined;const bodyHash=body?sha(body):null;
  if(method!=='GET'&&(method!=='POST'||new URL(request.url).pathname!=='/api-pub/NoticeDocument/GetAll/'||request.kind!=='json'||String(request.body?.initNoticeId)!==request.noticeId||request.body?.sysNoticeTypeId!==17||request.body?.pageSize!==5))throw new PilotStop('Only the verified read-only document-list POST is permitted.');
  let url=request.url;const visited=new Set();
  for(;;){
   const parsed=new URL(url);if(!policy.origins.includes(parsed.origin)||parsed.username||parsed.password)await stop('Destination is outside the frozen origin allowlist.');
   if(visited.has(url))await stop('Redirect cycle.');visited.add(url);
   const cached=ledger.attempts.find(a=>a.url===url&&(a.method||'GET')===method&&(a.bodyHash||null)===bodyHash&&a.state==='complete'&&a.kind===request.kind);
   if(cached){const bytes=await readFile(join(directory,cached.file));if(sha(bytes)!==cached.sha256)await stop('Cached response integrity check failed.');return {cached:true,attempt:cached,requestsUsed:ledger.attempts.length,pdfs:ledger.pdfCount}}
   if(!retryApproval&&ledger.attempts.some(a=>a.url===url&&(a.method||'GET')===method&&(a.bodyHash||null)===bodyHash))await stop('URL has already been attempted; automatic repeat refused.');
   if(ledger.attempts.length>=policy.maxRequests)await stop('Total HTTP request budget exhausted.');
   if(request.kind==='pdf'&&ledger.pdfCount>=policy.maxPdfs)await stop('PDF limit reached.');
   if(ledger.bytes>=policy.maxTotalBytes)await stop('Total byte budget exhausted.');
   const last=ledger.attempts.at(-1);if(last){const gap=now()-Date.parse(last.startedAt);if(gap<policy.minDelayMs)await sleep(policy.minDelayMs-gap)}
   const windowStart=retryApproval?.approvedAt||ledger.startedAt;
   if(windowStart&&now()-Date.parse(windowStart)>=policy.maxRunMs)await stop('Pilot time window expired.');
   const startedAt=new Date(now()).toISOString();ledger.startedAt??=startedAt;
   const attempt={number:ledger.attempts.length+1,id:request.id,url,method,bodyHash,noticeId:request.noticeId,institutionCui:request.institutionCui,provenance:request.provenance,kind:request.kind,startedAt,state:'reserved',bytes:0,requestReferer:request.referer||'https://e-licitatie.ro/pub/notices/c-notice/v2/view/'+request.noticeId,requestOrigin:request.origin||'https://e-licitatie.ro'};
   if(retryApproval){ledger.retryApprovals??=[];ledger.retryApprovals.push({...retryApproval,previousStop:ledger.stopped,consumedByAttempt:attempt.number});attempt.retryApprovalId=retryApproval.id;}
   ledger.attempts.push(attempt);await save();
   const signal=AbortSignal.timeout(policy.timeoutMs);let response;
   try{response=await fetchImpl(url,{method,body,redirect:'manual',signal,headers:{...(body?{'content-type':'application/json;charset=UTF-8'}:{}),'user-agent':'seap-analytics/0.1 (contact: cineseuita@gmail.com; bounded-document-pilot)','accept':request.kind==='pdf'?'application/pdf':request.kind==='json'?'application/json':'text/html,application/javascript;q=0.9','referer':attempt.requestReferer,'origin':attempt.requestOrigin}})}
   catch(error){attempt.state='failed';attempt.failure=error.cause?.code||error.name||'network';await stop('Network failure or timeout; no retry. '+attempt.failure)}
   attempt.status=response.status;attempt.contentType=response.headers.get('content-type')||'';attempt.retryAfter=response.headers.get('retry-after');
   if([301,302,303,307,308].includes(response.status)){
    const location=response.headers.get('location');await response.body?.cancel();attempt.state='redirect';attempt.redirectTo=location?new URL(location,url).href:null;await save();if(retryApproval)await stop('Single authorized retry returned a redirect; no further request sent.');if(!location)await stop('Redirect without Location.');if(method!=='GET')await stop('Read-only POST redirect requires review; not followed automatically.');url=attempt.redirectTo;continue;
   }
   if(!response.ok){
    // Retain only a bounded diagnostic prefix; never interpret an error body as a PDF.
    const cap=Math.min(64*1024,Math.max(0,policy.maxTotalBytes-ledger.bytes)),chunks=[];let kept=0;
    try{if(response.body){const reader=response.body.getReader();for(;;){const next=await reader.read();if(next.done)break;attempt.bytes+=next.value.length;ledger.bytes+=next.value.length;const part=Buffer.from(next.value).subarray(0,cap-kept);chunks.push(part);kept+=part.length;if(kept>=cap){attempt.errorBodyTruncated=true;await reader.cancel();break}}}}
    catch(error){attempt.errorBodyReadFailure=error.name;}
    const diagnostic=Buffer.concat(chunks);attempt.errorBodySha256=sha(diagnostic);attempt.errorBodyFile=`error-${String(attempt.number).padStart(2,'0')}-${attempt.errorBodySha256.slice(0,12)}.txt`;
    await writeFile(join(directory,attempt.errorBodyFile),diagnostic,{mode:0o600,flag:'wx'});attempt.state='failed';await stop('HTTP '+response.status+'; pilot stopped without retry.');
   }
   const maxBytes=Math.min(request.kind==='pdf'?policy.maxPdfBytes:policy.maxMetadataBytes,policy.maxTotalBytes-ledger.bytes);
   const length=Number(response.headers.get('content-length'));if(Number.isFinite(length)&&length>maxBytes){await response.body?.cancel();attempt.state='rejected';await stop('Response exceeds the remaining byte allowance.')}
   const chunks=[];let read=0;
   try{if(response.body){const reader=response.body.getReader();for(;;){const next=await reader.read();if(next.done)break;read+=next.value.length;attempt.bytes=read;ledger.bytes+=next.value.length;if(read>maxBytes){await reader.cancel();attempt.state='rejected';await stop('Streaming response exceeded byte allowance.')}chunks.push(Buffer.from(next.value))}}}
   catch(error){if(error instanceof PilotStop)throw error;attempt.state='failed';await stop('Body transfer interrupted; no retry.')}
   const bytes=Buffer.concat(chunks),text=bytes.toString('utf8'),type=attempt.contentType.toLowerCase();
   if(/<title>[^<]*(?:access denied|just a moment|attention required)|(?:cf-chl-|g-recaptcha|hcaptcha)|access denied|request rejected/i.test(text.slice(0,250000))){attempt.state='rejected';await stop('Access challenge detected; no alternate host or retry.')}
   let valid=false;
   if(request.kind==='pdf')valid=bytes.subarray(0,5).toString()==='%PDF-'&&(type.includes('application/pdf')||type.includes('application/octet-stream'));
   if(request.kind==='html')valid=type.includes('text/html')&&/<(?:!doctype|html)/i.test(text);
   if(request.kind==='javascript')valid=type.includes('javascript')&&!/^\s*</.test(text);
   if(request.kind==='json'){try{const parsed=JSON.parse(text);valid=!!parsed&&typeof parsed==='object'&&type.includes('json')}catch{}}
   if(!valid){attempt.state='rejected';await stop('Response format differs from requested '+request.kind+'; not a collected document.')}
   const extension={pdf:'pdf',html:'html',javascript:'js',json:'json'}[request.kind];attempt.sha256=sha(bytes);attempt.file=`response-${String(attempt.number).padStart(2,'0')}-${attempt.sha256.slice(0,12)}.${extension}`;
   await writeFile(join(directory,attempt.file),bytes,{mode:0o600,flag:'wx'});attempt.state='complete';attempt.completedAt=new Date(now()).toISOString();if(request.kind==='pdf')ledger.pdfCount++;if(retryApproval)ledger.stopped={reason:'Single authorized retry completed; no further network requests authorized.',at:attempt.completedAt};await save();return {cached:false,attempt,requestsUsed:ledger.attempts.length,pdfs:ledger.pdfCount};
  }
 }finally{await lock.close();await unlink(join(directory,'run.lock'))}
}
