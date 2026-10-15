// Bounded, explicitly invoked production audit. Uses the existing shared gate.
// Does not enqueue recovery, normalize data, or download attachments.
import {mkdir,writeFile} from 'node:fs/promises';
import {withCollectionStream} from '/app/packages/db/dist/index.js';
import {listNotices,NOTICE_TYPE_IDS,noticeIdOf} from '/app/packages/scraper-clients/dist/index.js';
import {getElicitatieClient} from '/app/apps/ingestion/dist/scrape/elicitatie/client.js';
import {getSharedSql,closeSharedDb} from '/app/apps/ingestion/dist/db.js';
const destination='/tmp/coverage-audit-20261009';
const summary=[];
try {
 const q=getSharedSql();
 const [control]=await q`select enabled from app.collection_proxy_control where id=1`;
 if(!control?.enabled)throw Error('Managed proxy mode is required');
 await mkdir(destination,{recursive:true});
 for(let year=2018;year<=2026;year++)for(const stream of ['tenders','awards']){
  const from=`${year}-01-01`,to=year===2026?'2026-10-08':`${year}-12-31`;
  const {data}=await withCollectionStream(stream,()=>listNotices(getElicitatieClient(),{
   sysNoticeTypeIds:stream==='tenders'?NOTICE_TYPE_IDS.participation:NOTICE_TYPE_IDS.award,
   startPublicationDate:from,endPublicationDate:to,pageIndex:0,pageSize:100,
  }),{purpose:'coverage-audit-20261009',boundedRequests:18,year,stream});
  await writeFile(`${destination}/${stream}-${year}.json`,JSON.stringify(data));
  const row={year,stream,from,to,total:data.total,searchTooLong:data.searchTooLong??null,count:data.items?.length,
   ids:Array.isArray(data.items)?data.items.map(noticeIdOf):[]};
  summary.push(row);await writeFile(`${destination}/summary.json`,JSON.stringify(summary,null,2));
  console.log(JSON.stringify({...row,ids:undefined}));
  if(!Number.isSafeInteger(row.total)||!Array.isArray(data.items))throw Error('Unexpected source envelope; audit stopped');
 }
}finally{await closeSharedDb();}
