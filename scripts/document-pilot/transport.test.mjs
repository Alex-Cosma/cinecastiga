import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {pilotRequest,PILOT_POLICY} from './transport.mjs';

async function fixture(run){
 let hits=0,clock=Date.now();const starts=[],waits=[];
 const server=createServer((req,res)=>{hits++;starts.push(clock);if(req.url==='/redirect'){res.writeHead(302,{location:'/ok'}).end();return}if(req.url==='/loop'){res.writeHead(302,{location:'/loop'}).end();return}if(req.url==='/outside'){res.writeHead(302,{location:'http://unapproved.invalid/'}).end();return}if(req.url==='/network'){req.socket.destroy();return}if(req.url.startsWith('/status/')){res.writeHead(Number(req.url.split('/').at(-1)),{'retry-after':'120'}).end();return}if(req.url==='/challenge'){res.writeHead(200,{'content-type':'text/html'}).end('<html><title>Access Denied</title></html>');return}if(req.url==='/large'){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({text:'x'.repeat(500)}));return}if(req.url.startsWith('/pdf')){res.writeHead(200,{'content-type':'application/pdf'}).end('%PDF-1.4\nsynthetic fixture, transport validation only');return}res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({ok:true}))});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;const directory=await mkdtemp(join(tmpdir(),'seap-pilot-test-'));
 const policy={...PILOT_POLICY,origins:[origin]};const deps={directory,policy,now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms}};
 const request=(path,kind='json')=>({id:path,url:origin+path,kind,institutionCui:'4233874',noticeId:'100231768',provenance:'local mock server only'});
 const get=(path,kind)=>pilotRequest({...deps,request:request(path,kind)});
 const ledger=async()=>JSON.parse(await readFile(join(directory,'ledger.json'),'utf8'));
 try{await run({get,request,ledger,deps,waits,starts,hits:()=>hits,directory})}finally{await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true})}
}
test('reserves before transmission, caches exact bytes, spaces request starts by at least15s',()=>fixture(async c=>{
 const result=await pilotRequest({...c.deps,request:c.request('/ok'),fetchImpl:async(...args)=>{assert.equal((await c.ledger()).attempts[0].state,'reserved');return fetch(...args)}});assert.equal(result.requestsUsed,1);assert.equal((await c.get('/ok')).cached,true);assert.equal(c.hits(),1);await c.get('/next');assert.equal(c.starts[1]-c.starts[0],15000);assert.equal(c.waits.length,1);
}));
test('manual redirect consumes two attempts and two throttled slots',()=>fixture(async c=>{const result=await c.get('/redirect');assert.equal(c.hits(),2);assert.equal(result.requestsUsed,2);assert.equal(c.starts[1]-c.starts[0],15000);assert.equal((await c.ledger()).attempts[0].state,'redirect')}));
test('redirect to unapproved origin stops without contacting target',()=>fixture(async c=>{await assert.rejects(c.get('/outside'),/allowlist/);assert.equal(c.hits(),1);assert.ok((await c.ledger()).stopped)}));
for(const status of [403,429,500])test('HTTP'+status+' stops persistently after exactly one attempt',()=>fixture(async c=>{await assert.rejects(c.get('/status/'+status),new RegExp('HTTP '+status));await assert.rejects(c.get('/ok'),/already stopped/);assert.equal(c.hits(),1);assert.equal((await c.ledger()).attempts[0].retryAfter,'120')}));
test('challenge response stops on200 without retry',()=>fixture(async c=>{await assert.rejects(c.get('/challenge','html'),/challenge/);assert.equal(c.hits(),1);assert.equal((await c.ledger()).pdfCount,0)}));
test('network failure persists and is never retried',()=>fixture(async c=>{await assert.rejects(c.get('/network'),/Network failure/);await assert.rejects(c.get('/ok'),/already stopped/);assert.equal(c.hits(),1)}));
test('total cap persists across separate invocations, request11never issued',()=>fixture(async c=>{for(let i=0;i<10;i++)await c.get('/ok/'+i);await assert.rejects(c.get('/eleven'),/budget exhausted/);assert.equal(c.hits(),10);assert.equal((await c.ledger()).attempts.length,10)}));
test('two PDF maximum, original bytes hashed and stored',()=>fixture(async c=>{await c.get('/pdf/1','pdf');const r=await c.get('/pdf/2','pdf');assert.equal(r.pdfs,2);assert.equal(r.attempt.sha256.length,64);assert.ok((await readFile(join(c.directory,r.attempt.file),'utf8')).startsWith('%PDF-'));await assert.rejects(c.get('/pdf/3','pdf'),/PDF limit/);assert.equal(c.hits(),2)}));
test('wrong format does not become a PDF',()=>fixture(async c=>{await assert.rejects(c.get('/ok','pdf'),/format differs/);assert.equal((await c.ledger()).pdfCount,0)}));
test('stream size limit stops and counts bytes already received',()=>fixture(async c=>{c.deps.policy={...c.deps.policy,maxMetadataBytes:50};await assert.rejects(c.get('/large'),/byte allowance/);assert.equal(c.hits(),1);assert.ok((await c.ledger()).bytes>0)}));
test('exclusive lock blocks concurrent run without any network',()=>fixture(async c=>{await writeFile(join(c.directory,'run.lock'),'fixture');await assert.rejects(c.get('/ok'),/holds the pilot lock/);assert.equal(c.hits(),0)}));
test('uncertain reserved attempt on restart stops without a repeat',()=>fixture(async c=>{await c.get('/ok');const ledger=await c.ledger();ledger.attempts[0].state='reserved';await writeFile(join(c.directory,'ledger.json'),JSON.stringify(ledger));await assert.rejects(c.get('/next'),/uncertain outcome/);assert.equal(c.hits(),1)}));
test('changing policy cannot reset or increase durable budget',()=>fixture(async c=>{await c.get('/ok');c.deps.policy={...c.deps.policy,maxRequests:100};await assert.rejects(c.get('/next'),/policy differs/);assert.equal(c.hits(),1)}));
test('other authority or unapproved notice rejected before any request',()=>fixture(async c=>{await assert.rejects(pilotRequest({...c.deps,request:{...c.request('/ok'),institutionCui:'123'}}),/approved institution/);await assert.rejects(pilotRequest({...c.deps,request:{...c.request('/ok'),noticeId:'999'}}),/approved institution/);assert.equal(c.hits(),0)}));
test('verified read-only document list POST is counted and cached by body',()=>fixture(async c=>{const r={...c.request('/api-pub/NoticeDocument/GetAll/'),method:'POST',body:{initNoticeId:100231768,sysNoticeTypeId:17,pageSize:5,pageIndex:0}};const a=await pilotRequest({...c.deps,request:r,fetchImpl:async(url,init)=>{assert.equal(init.method,'POST');assert.equal(JSON.parse(init.body).initNoticeId,100231768);return fetch(url,init)}});assert.equal(a.requestsUsed,1);assert.ok(a.attempt.bodyHash);await pilotRequest({...c.deps,request:r});assert.equal(c.hits(),1);await pilotRequest({...c.deps,request:{...r,body:{...r.body,pageIndex:1}}});assert.equal(c.hits(),2)}));
test('write-like POST route rejected before transmission',()=>fixture(async c=>{await assert.rejects(pilotRequest({...c.deps,request:{...c.request('/api-pub/NoticeDocument/saveNoticeDocument/'),method:'POST',body:{}}}),/read-only/);assert.equal(c.hits(),0)}));

const approval=c=>({id:'explicit-single-retry',approvedAt:new Date(c.deps.now()).toISOString(),afterAttempt:1,reason:'User authorized exactly one retry of the failed PDF.'});
async function failedPdf(c){await assert.rejects(pilotRequest({...c.deps,request:c.request('/pdf/retry','pdf'),fetchImpl:async()=>new Response('diagnostic failure',{status:500,headers:{'content-type':'text/plain'}})}),/HTTP 500/);}
test('authorized retry preserves cumulative budget, saves PDF once, and cannot be reused',()=>fixture(async c=>{
 await failedPdf(c);const retryApproval=approval(c),request=c.request('/pdf/retry','pdf');
 const r=await pilotRequest({...c.deps,request,retryApproval});assert.equal(r.requestsUsed,2);assert.equal(r.pdfs,1);
 const l=await c.ledger();assert.equal(l.retryApprovals[0].previousStop.reason,'HTTP 500; pilot stopped without retry.');assert.ok(l.stopped);
 await assert.rejects(pilotRequest({...c.deps,request,retryApproval}),/approval/);await assert.rejects(c.get('/next'),/already stopped/);assert.equal(c.hits(),1);
}));
test('authorized retry never follows redirects or expands to another URL',()=>fixture(async c=>{
 await failedPdf(c);const retryApproval=approval(c);let sent=0;
 await assert.rejects(pilotRequest({...c.deps,request:c.request('/pdf/other','pdf'),retryApproval}),/approval/);
 await assert.rejects(pilotRequest({...c.deps,request:c.request('/pdf/retry','pdf'),retryApproval,fetchImpl:async()=>{sent++;return new Response(null,{status:302,headers:{location:'/pdf/next'}})}}),/no further request/);
 assert.equal(sent,1);assert.equal((await c.ledger()).attempts.length,2);
}));
test('expired retry approval sends nothing and error diagnostics are retained separately',()=>fixture(async c=>{
 await failedPdf(c);const retryApproval={...approval(c),approvedAt:new Date(c.deps.now()-PILOT_POLICY.maxRunMs).toISOString()};
 await assert.rejects(pilotRequest({...c.deps,request:c.request('/pdf/retry','pdf'),retryApproval}),/expired/);assert.equal(c.hits(),0);
 const l=await c.ledger();assert.equal(l.pdfCount,0);assert.equal(await readFile(join(c.directory,l.attempts[0].errorBodyFile),'utf8'),'diagnostic failure');
}));
test('failed retry persists its error and cannot send a third request',()=>fixture(async c=>{
 await failedPdf(c);const retryApproval=approval(c);let sent=0;
 const invoke=()=>pilotRequest({...c.deps,request:c.request('/pdf/retry','pdf'),retryApproval,fetchImpl:async()=>{sent++;return new Response('x'.repeat(100000),{status:500})}});
 await assert.rejects(invoke(),/HTTP 500/);await assert.rejects(invoke(),/approval/);assert.equal(sent,1);
 const l=await c.ledger(),a=l.attempts[1];assert.equal((await readFile(join(c.directory,a.errorBodyFile))).length,65536);assert.equal(a.errorBodyTruncated,true);assert.equal(l.pdfCount,0);
}));

async function originMismatch(c,message='Access Denied: Referer and Origin headers mismatch'){
 c.deps.policy={...PILOT_POLICY};
 const request={...c.request('/pdf/retry','pdf'),url:'https://e-licitatie.ro/api-pub/files/noticedoc/test',referer:'https://www.e-licitatie.ro/pub/notices/simplified-notice/v2/view/100231768'};
 await assert.rejects(pilotRequest({...c.deps,request,fetchImpl:async()=>new Response(JSON.stringify({message}),{status:403})}),/HTTP 403/);
 return {request:{...request,url:request.url.replace('https://e-','https://www.e-'),origin:'https://www.e-licitatie.ro'},retryApproval:{...approval(c),correction:'align-public-origin'}};
}
test('explicit origin correction sends matching headers once and preserves original failure',()=>fixture(async c=>{
 const config=await originMismatch(c);let sent=0;
 const run=()=>pilotRequest({...c.deps,...config,fetchImpl:async(url,init)=>{sent++;assert.equal(new URL(url).origin,init.headers.origin);assert.equal(new URL(init.headers.referer).origin,init.headers.origin);assert.equal(init.redirect,'manual');return new Response('%PDF-1.4\nfixture',{headers:{'content-type':'application/pdf'}})}});
 const result=await run();assert.equal(result.requestsUsed,2);assert.equal(result.pdfs,1);await assert.rejects(run(),/approval/);assert.equal(sent,1);assert.equal((await c.ledger()).attempts[0].status,403);
}));
test('origin correction cannot bypass a different403or change document or preserve mismatched Origin',()=>fixture(async c=>{
 const config=await originMismatch(c);let sent=0;const fetchImpl=async()=>{sent++;throw Error('must not fetch')};
 for(const patch of [{url:config.request.url+'/other'},{origin:'https://e-licitatie.ro'},{referer:'https://www.e-licitatie.ro/pub/notices/c-notice/v2/view/100231768'}])await assert.rejects(pilotRequest({...c.deps,...config,request:{...config.request,...patch},fetchImpl}),/approval/);
 assert.equal(sent,0);
}));
test('generic403does not qualify for origin correction',()=>fixture(async c=>{
 const config=await originMismatch(c,'Access denied');let sent=0;
 await assert.rejects(pilotRequest({...c.deps,...config,fetchImpl:async()=>{sent++;throw Error('must not fetch')}}),/approval/);assert.equal(sent,0);
}));
