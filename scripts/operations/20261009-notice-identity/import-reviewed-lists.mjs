// One-time reviewed source import, inside the new collector image while paused.
// Exact bundle derives from the committed 9October audit, not arbitrary user input.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getSharedSql,closeSharedDb} from '/app/apps/ingestion/dist/db.js';
import {archiveDocumentsSql} from '/app/apps/ingestion/dist/scrape/archive.js';
import {noticeArchiveKey} from '/app/packages/scraper-clients/dist/index.js';
try{
 const bytes=await readFile('/tmp/known-tender-recovery.json');
 if(createHash('sha256').update(bytes).digest('hex')!=='c47adb62159b78a8b65a4469aa7c3b8490f5b4048607e783c41bc19c5eb09752')throw Error('Unreviewed recovery bundle');
 const items=JSON.parse(bytes.toString());
 if(items.length!==221||new Set(items.map(i=>i.noticeNo)).size!==221)throw Error('Unexpected source population');
 const q=getSharedSql();
 const [control]=await q`select paused,maintenance from app.collection_control where id=1`;
 if(!control?.paused||!control.maintenance)throw Error('Pause and maintenance required');
 const [migration]=await q`select exists(select 1 from information_schema.columns where table_schema='core' and table_name='notices' and column_name='notice_namespace') ready`;
 if(!migration?.ready)throw Error('Identity migration is not installed');
 console.log(await q.begin(tx=>archiveDocumentsSql(tx,items.map(payload=>({source:'elicitatie',externalId:noticeArchiveKey('tenders',payload.cNoticeId,payload.sysNoticeTypeId),endpointVersion:'tender-list:v1',payload})))));
}finally{await closeSharedDb();}
