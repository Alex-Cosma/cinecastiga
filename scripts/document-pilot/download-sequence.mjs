import {mkdir,open,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {PILOT_POLICY} from './transport.mjs';

// Prepared offline. Calling this requires a NEW explicit user allowance of 2 HTTP
// requests, cumulative maximum 11. Never use the browser user's supplied cookie.
export const DOWNLOAD_SEQUENCE=Object.freeze({
 id:'buzau-observed-post-get',institutionCui:'4233874',noticeId:'100231768',
 url:'https://www.e-licitatie.ro/api-pub/files/noticedoc/4333a84fdfb741059d25b48970751216',
 origin:'https://www.e-licitatie.ro',
 referer:'https://www.e-licitatie.ro/pub/notices/simplified-notice/v2/view/100231768',
 expectedPriorAttempts:9,additionalRequests:2,cumulativeRequestLimit:11,
 provenance:'User observed this exact POST(no body, 200 JSON empty string) then GET URL in SEAP. Cached official onDownload directive confirms verifyFile POST then downloadFile GET. Filename not yet established.'
});
const hash=b=>createHash('sha256').update(b).digest('hex');
async function saveJson(path,value){await writeFile(path+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(path+'.tmp',path)}
function responseCookies(response,responseUrl=DOWNLOAD_SEQUENCE.url){
 const cookies=[];
 for(const raw of response.headers.getSetCookie()){
  const [pair,...attributes]=raw.split(';').map(s=>s.trim());
  if(!/^[!#$%&'*+.^_`|~0-9a-z-]+=[^\r\n;]*$/i.test(pair))continue;
  const attrs=Object.fromEntries(attributes.map(s=>{const i=s.indexOf('=');return i<0?[s.toLowerCase(),true]:[s.slice(0,i).toLowerCase(),s.slice(i+1)]}));
  const host=new URL(DOWNLOAD_SEQUENCE.url).hostname;
  const domain=String(attrs.domain||host).replace(/^\./,'').toLowerCase();
  const responsePath=new URL(responseUrl).pathname;
  const path=String(attrs.path||responsePath.slice(0,responsePath.lastIndexOf('/')+1));
  if(!(host===domain||host.endsWith('.'+domain))||!new URL(DOWNLOAD_SEQUENCE.url).pathname.startsWith(path))continue;
  if(attrs['max-age']!==undefined&&Number(attrs['max-age'])<=0)continue;
  if(attrs.expires&&Date.parse(attrs.expires)<=Date.now())continue;
  cookies.push(pair);
 }
 return cookies;
}

export async function runDownloadSequence({directory,approval,fetchImpl=fetch,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 const plan=DOWNLOAD_SEQUENCE;
 await mkdir(directory,{recursive:true,mode:0o700});
 let lock;try{lock=await open(join(directory,'run.lock'),'wx',0o600)}catch{throw Error('Pilot locked; no network request sent.')}
 let ledger;
 const ledgerPath=join(directory,'ledger.json');
 try{
  ledger=JSON.parse(await readFile(ledgerPath,'utf8'));
  const age=now()-Date.parse(approval?.authorizedAt);
  const priorCount=approval?.expectedPriorAttempts??9,additional=approval?.initializeSession?3:2,limit=priorCount+additional;
  if(!approval?.id||!approval.reason||approval.sequenceId!==plan.id||!Number.isInteger(priorCount)||priorCount<9||approval.additionalRequests!==additional||approval.cumulativeRequestLimit!==limit||!Number.isFinite(age)||age<0||age>=PILOT_POLICY.maxRunMs)throw Error('Explicit fresh allowance matching the bounded sequence is required.');
  if(ledger.policyHash!==hash(JSON.stringify(PILOT_POLICY))||ledger.attempts.length!==priorCount||!ledger.stopped||ledger.attempts.some(a=>a.state==='reserved')||ledger.sequenceApprovals?.some(a=>a.id===approval.id))throw Error('Ledger does not match the unconsumed stopped pilot and approved starting count.');
  if(ledger.pdfCount>=2||ledger.bytes>=PILOT_POLICY.maxTotalBytes)throw Error('Existing document/byte limit reached.');
  ledger.sequenceApprovals??=[];
  ledger.sequenceApprovals.push({...approval,plan,previousStop:ledger.stopped,consumedAt:new Date(now()).toISOString()});
  await saveJson(ledgerPath,ledger);
  let cookies=[];
  const steps=[...(approval.initializeSession?[{method:'GET',url:plan.referer,page:true}]:[]),{method:'POST',url:plan.url},{method:'GET',url:plan.url}];
  for(const {method,url,page=false} of steps){
   if(ledger.attempts.length>=limit)throw Error('Cumulative request limit reached.');
   const last=ledger.attempts.at(-1),gap=now()-Date.parse(last.startedAt);
   if(gap<PILOT_POLICY.minDelayMs)await sleep(PILOT_POLICY.minDelayMs-gap);
   if(now()-Date.parse(approval.authorizedAt)>=PILOT_POLICY.maxRunMs)throw Error('Authorized sequence window expired.');
   const attempt={number:ledger.attempts.length+1,id:plan.id+'-'+(page?'session-page':method.toLowerCase()),method,url,institutionCui:plan.institutionCui,noticeId:plan.noticeId,provenance:plan.provenance,requestOrigin:plan.origin,requestReferer:plan.referer,sequenceApprovalId:approval.id,kind:page?'session-page':method==='POST'?'download-verification':'document',startedAt:new Date(now()).toISOString(),state:'reserved',bytes:0};
   ledger.attempts.push(attempt);await saveJson(ledgerPath,ledger);
   const headers={accept:'application/json, text/plain, */*',origin:plan.origin,referer:plan.referer,culture:'ro-RO',authorization:'Bearer null',httpsessionid:'null',refreshtoken:'null','user-agent':'seap-analytics/0.1 (contact: cineseuita@gmail.com; bounded-document-pilot)'};
   if(cookies.length)headers.cookie=cookies.join('; ');
   let response;
   try{response=await fetchImpl(url,{method,headers,redirect:'manual',signal:AbortSignal.timeout(PILOT_POLICY.timeoutMs)})}
   catch(error){attempt.state='failed';attempt.failure=error.name;throw Error('Network failure; no retry.')}
   attempt.status=response.status;attempt.contentType=response.headers.get('content-type')||'';attempt.contentDisposition=response.headers.get('content-disposition');attempt.retryAfter=response.headers.get('retry-after');
   if(response.status>=300&&response.status<400){await response.body?.cancel();attempt.state='redirect';throw Error('Redirect refused; no follow-up request.')}
   const cap=Math.min(response.ok?(page?PILOT_POLICY.maxMetadataBytes:method==='POST'?64*1024:PILOT_POLICY.maxPdfBytes):64*1024,PILOT_POLICY.maxTotalBytes-ledger.bytes);
   const chunks=[];let retained=0;
   try{
    if(response.body){const reader=response.body.getReader();for(;;){const next=await reader.read();if(next.done)break;attempt.bytes+=next.value.length;ledger.bytes+=next.value.length;const part=Buffer.from(next.value).subarray(0,Math.max(0,cap-retained));chunks.push(part);retained+=part.length;if(attempt.bytes>cap){attempt.truncated=true;await reader.cancel();break}}}
   }catch(error){attempt.state='failed';attempt.failure=error.name;throw Error('Body transfer failed; no retry.')}
   const bytes=Buffer.concat(chunks);
   const prefix=response.ok?'sequence-response':'sequence-error';
   attempt.sha256=hash(bytes);attempt.file=`${prefix}-${attempt.number}-${attempt.sha256.slice(0,12)}.bin`;
   const file=join(directory,attempt.file);await writeFile(file,bytes,{mode:0o600,flag:'wx'});
   if(!response.ok||attempt.truncated){attempt.state='failed';throw Error(!response.ok?'HTTP '+response.status+'; no retry.':'Response exceeded byte allowance.')}
   if(page){
    if(response.status!==200||!attempt.contentType.includes('text/html')||!/<(?:!doctype|html)/i.test(bytes.toString('utf8'))){attempt.state='rejected';throw Error('Session page did not return expected HTML; no POST sent.')}
    cookies=responseCookies(response,url);attempt.sessionCookieCount=cookies.length;
   }else if(method==='POST'){
    let value;try{value=JSON.parse(bytes.toString('utf8'))}catch{}
    if(response.status!==200||!attempt.contentType.includes('json')||value!==''){attempt.state='rejected';throw Error('POST did not match observed200JSON empty-string verification; GET not sent.')}
    cookies=[...new Map([...cookies,...responseCookies(response,url)].map(pair=>[pair.slice(0,pair.indexOf('=')),pair])).values()];attempt.sessionCookieCount=cookies.length;
   }else{
    const isPdf=bytes.subarray(0,5).toString()==='%PDF-';
    const isCms=!isPdf&&spawnSync('openssl',['cms','-cmsout','-inform','DER','-noout','-in',file],{encoding:'utf8',timeout:10000,maxBuffer:4096}).status===0;
    if(!isPdf&&!isCms){attempt.state='rejected';throw Error('Downloaded body is neither PDF nor parseable DER CMS; not a collected document.')}
    attempt.fileType=isPdf?'pdf':'cms';
    const renamed=attempt.file.replace(/\.bin$/,isPdf?'.pdf':'.p7s');await rename(file,join(directory,renamed));attempt.file=renamed;
    if(isPdf)ledger.pdfCount++;else ledger.cmsCount=(ledger.cmsCount||0)+1;
    ledger.downloadedDocuments=(ledger.downloadedDocuments||0)+1;
   }
   attempt.state='complete';attempt.completedAt=new Date(now()).toISOString();await saveJson(ledgerPath,ledger);
  }
  ledger.stopped={reason:'Authorized POST→GET sequence completed; no further requests authorized.',at:new Date(now()).toISOString()};await saveJson(ledgerPath,ledger);
  return {requestsUsed:ledger.attempts.length,document:ledger.attempts.at(-1)};
 }catch(error){
  // Do not consume/mutate an invalid approval. Persist failures only after this grant was recorded.
  if(ledger?.sequenceApprovals?.some(a=>a.id===approval?.id)){
   ledger.stopped={reason:error.message,at:new Date(now()).toISOString()};await saveJson(ledgerPath,ledger);
  }
  throw error;
 }finally{await lock.close();await unlink(join(directory,'run.lock'))}
}
