import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {runDownloadSequence} from './download-sequence.mjs';
const root=resolve(import.meta.dirname,'../..'),directory=join(root,'.local/document-pilot-buzau-20260926'),reports=join(root,'docs/implementation/previews/batch5-document-pilot');
const approval=JSON.parse(await readFile(join(directory,process.argv[2]||'post-get-approval.json'),'utf8'));
let requestNumber=approval.expectedPriorAttempts??9;
try{
 const result=await runDownloadSequence({directory,approval,fetchImpl:async(url,init)=>{
  const number=++requestNumber;console.log(`Request ${number}: ${init.method} ${url}`);
  const response=await fetch(url,init);console.log(`Request ${number}: HTTP ${response.status}, ${response.headers.get('content-type')}`);return response;
 }});console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message);process.exitCode=1}
finally{
 const l=JSON.parse(await readFile(join(directory,'ledger.json'),'utf8'));
 const manifest=JSON.parse(await readFile(join(reports,'manifest.json'),'utf8'));
 const summary={scope:manifest.scope,policy:l.policy,sequenceAllowances:l.sequenceApprovals,requestsUsed:l.attempts.length,pdfsCollected:l.pdfCount,cmsCollected:l.cmsCount||0,bytesRead:l.bytes,stopped:l.stopped,attempts:l.attempts};
 await writeFile(join(reports,'result.json'),JSON.stringify(summary,null,2)+'\n');
 const a=l.attempts.at(-1);console.log(JSON.stringify({requestsUsed:l.attempts.length,pdfs:l.pdfCount,cms:l.cmsCount||0,lastAttempt:a},null,2));
 if(a.state==='failed'&&a.file)console.log('Error response:',(await readFile(join(directory,a.file),'utf8')).slice(0,2000));
}
