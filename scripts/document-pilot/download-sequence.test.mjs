import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {runDownloadSequence,DOWNLOAD_SEQUENCE} from './download-sequence.mjs';
import {PILOT_POLICY} from './transport.mjs';
async function fixture(fn){
 const directory=await mkdtemp(join(tmpdir(),'seap-sequence-'));let clock=Date.now();
 const ledger={policy:PILOT_POLICY,policyHash:createHash('sha256').update(JSON.stringify(PILOT_POLICY)).digest('hex'),startedAt:new Date(clock-3600000).toISOString(),attempts:Array.from({length:9},(_,i)=>({number:i+1,state:i===8?'failed':'complete',status:i===8?500:200,startedAt:new Date(clock-60000+i*1000).toISOString()})),pdfCount:0,bytes:100,stopped:{reason:'HTTP 500'}};
 await writeFile(join(directory,'ledger.json'),JSON.stringify(ledger));
 const approval={id:'local-test',sequenceId:DOWNLOAD_SEQUENCE.id,authorizedAt:new Date(clock).toISOString(),additionalRequests:2,cumulativeRequestLimit:11,reason:'Local-only test approval'};
 const deps={directory,approval,now:()=>clock,sleep:async ms=>{clock+=ms}};
 try{await fn({deps,directory,ledger:async()=>JSON.parse(await readFile(join(directory,'ledger.json'),'utf8'))})}finally{await rm(directory,{recursive:true,force:true})}
}
test('empty POST then GET, same-origin session retained without secrets in ledger,15seconds apart',()=>fixture(async c=>{
 const calls=[];const fetchImpl=async(url,init)=>{calls.push(init);assert.equal(url,DOWNLOAD_SEQUENCE.url);assert.equal(init.redirect,'manual');assert.equal(new URL(url).origin,init.headers.origin);assert.equal(new URL(init.headers.referer).origin,init.headers.origin);if(init.method==='POST'){assert.equal(init.body,undefined);assert.equal(init.headers.cookie,undefined);const headers=new Headers({'content-type':'application/json'});headers.append('set-cookie','_HttpSessionID=local-secret; Path=/; Secure; HttpOnly');headers.append('set-cookie','foreign=secret; Domain=example.invalid');return new Response('""',{headers})}assert.equal(init.headers.cookie,'_HttpSessionID=local-secret');return new Response('%PDF-1.4\ntransport fixture',{headers:{'content-type':'application/pdf'}})};
 const result=await runDownloadSequence({...c.deps,fetchImpl});assert.equal(result.requestsUsed,11);assert.deepEqual(calls.map(x=>x.method),['POST','GET']);const l=await c.ledger();assert.equal(Date.parse(l.attempts[10].startedAt)-Date.parse(l.attempts[9].startedAt),15000);assert.equal(l.pdfCount,1);assert.ok(!JSON.stringify(l).includes('local-secret'));await assert.rejects(runDownloadSequence({...c.deps,fetchImpl}),/unconsumed/);assert.equal(calls.length,2);
}));
for(const [status,body] of [[403,'denied'],[200,'{"error":true}'],[302,'']])test('verification'+status+' '+body+' stops before GET',()=>fixture(async c=>{
 let calls=0;await assert.rejects(runDownloadSequence({...c.deps,fetchImpl:async()=>{calls++;return new Response(body,{status,headers:{'content-type':'application/json',location:'/other'}})}}));assert.equal(calls,1);assert.equal((await c.ledger()).attempts.length,10);
}));
test('GET failure preserves both attempts and never retries',()=>fixture(async c=>{
 let calls=0;await assert.rejects(runDownloadSequence({...c.deps,fetchImpl:async()=>++calls===1?new Response('""',{headers:{'content-type':'application/json'}}):new Response('failed',{status:500})}),/HTTP 500/);assert.equal(calls,2);const l=await c.ledger();assert.equal(l.attempts.length,11);assert.equal(l.pdfCount,0);
}));
test('missing budget approval causes zero network requests',()=>fixture(async c=>{
 let calls=0;await assert.rejects(runDownloadSequence({...c.deps,approval:undefined,fetchImpl:async()=>{calls++}}),/allowance/);assert.equal(calls,0);assert.equal((await c.ledger()).attempts.length,9);
}));
test('fresh session page emits cookie used in both verification and download, three counted requests',()=>fixture(async c=>{
 const approval={...c.deps.approval,initializeSession:true,expectedPriorAttempts:9,additionalRequests:3,cumulativeRequestLimit:12};let calls=0;
 const r=await runDownloadSequence({...c.deps,approval,fetchImpl:async(url,init)=>{
  calls++;if(calls===1){assert.equal(url,DOWNLOAD_SEQUENCE.referer);return new Response('<!doctype html><html></html>',{headers:{'content-type':'text/html','set-cookie':'_HttpSessionID=own-session; Path=/; Secure'}})}
  assert.equal(url,DOWNLOAD_SEQUENCE.url);assert.equal(init.headers.cookie,'_HttpSessionID=own-session');return calls===2?new Response('""',{headers:{'content-type':'application/json'}}):new Response('%PDF-1.4\nfixture',{headers:{'content-type':'application/pdf'}});
 }});assert.equal(calls,3);assert.equal(r.requestsUsed,12);assert.ok(!JSON.stringify(await c.ledger()).includes('own-session'));
}));
