import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pilotRequest} from './transport.mjs';
const root=resolve(import.meta.dirname,'../..');
const manifest=JSON.parse(await readFile(join(root,'docs/implementation/previews/batch5-document-pilot/manifest.json'),'utf8'));
const id=process.argv[2],request=manifest.requests.find(r=>r.id===id);
if(!request)throw Error('Choose an explicitly documented request ID from the pilot manifest.');
// This fixed durable path is intentionally not a CLI option: restarts share the same budget.
const directory=join(root,'.local/document-pilot-buzau-20260926');
const retryApproval=process.argv[3]==='--single-approved-retry'?JSON.parse(await readFile(join(directory,'single-retry-approval.json'),'utf8')):undefined;
try{const result=await pilotRequest({directory,request,retryApproval});console.log(JSON.stringify(result,null,2))}
catch(error){console.error(error.message);process.exitCode=1}
finally{try{const ledger=JSON.parse(await readFile(join(directory,'ledger.json'),'utf8'));const summary={scope:manifest.scope,policy:ledger.policy,requestsUsed:ledger.attempts.length,pdfsCollected:ledger.pdfCount,bytesRead:ledger.bytes,stopped:ledger.stopped,attempts:ledger.attempts.map(({number,id,noticeId,startedAt,status,state,bytes,sha256,file,failure,retryAfter})=>({number,id,noticeId,startedAt,status,state,bytes,sha256,file,failure,retryAfter}))};await writeFile(join(root,'docs/implementation/previews/batch5-document-pilot/result.json'),JSON.stringify(summary,null,2)+'\n')}catch{}}
