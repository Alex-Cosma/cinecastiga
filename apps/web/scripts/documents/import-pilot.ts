/** Explicit local-only import of archived metadata/original from the completed pilot. No network. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createDb} from '@seap/db';
import {contractNotice,registerNotice} from '../../lib/documents/store';
import {parseList} from '../../lib/documents/seap';
import {sha256} from '../../lib/documents/process';
if(!process.argv.includes('--local-pilot'))throw Error('Requires --local-pilot; never run as a deployment seed.');
const url=process.env.DATABASE_URL??'postgres://seap:seap_dev@localhost:5432/seap';
if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Local database required.');
const dir=resolve(process.argv[process.argv.indexOf('--local-pilot')+1]??'');
const {sql:q}=createDb(url);
try{
 const n=await contractNotice('107063311',q);if(n?.noticeNo!=='SCN1168231')throw Error('Pilot source mismatch');
 const list=parseList(JSON.parse(await readFile(resolve(dir,'browser-response-16-c62a5a414f3c.json'),'utf8')),n.noticeNo);
 const original=await readFile(resolve(dir,'HC-127-2025.pdf')),hash=sha256(original);
 if(hash!=='9b305927ede6acf7a831ecde2a111df668bac20e046d61fefdf33f879b3cb4da')throw Error('Pilot original hash mismatch');
 const ledger=JSON.parse(await readFile(resolve(dir,'ledger.json'),'utf8'));const attempt=ledger.attempts.find((a:{number:number})=>a.number===18);
 await registerNotice(n,q);
 await q.begin(async tx=>{
  for(const d of list.items)await tx`insert into app.procurement_documents(notice_key,source_id,code,filename) values(${n.key},${String(d.noticeDocumentId)},${d.noticeDocumentCode},${d.documentName}) on conflict(notice_key,source_id) do nothing`;
  await tx`update app.document_notices set total=${list.total} where key=${n.key}`;
  await tx`insert into app.document_blobs(hash,bytes,mime) values(${hash},${original},'application/pdf') on conflict(hash) do nothing`;
  await tx`update app.procurement_documents set original_hash=${hash},downloaded_at=${attempt.startedAt} where notice_key=${n.key} and source_id='110778324' and original_hash is null`;
 });
 console.log('Imported 5 of 9 known metadata rows, 1 original; full-list checked_at remains unset. Zero network requests.');
}finally{await q.end();}
