// Two bounded source calls confirming type-scoped public IDs. No recovery writes.
import {writeFile} from 'node:fs/promises';
import {withCollectionStream} from '/app/packages/db/dist/index.js';
import {getNoticeDetailPart} from '/app/packages/scraper-clients/dist/index.js';
import {getElicitatieClient} from '/app/apps/ingestion/dist/scrape/elicitatie/client.js';
import {closeSharedDb} from '/app/apps/ingestion/dist/db.js';
const rows=[];
try{
 for(const noticeType of [2,17]){
  const {data}=await withCollectionStream('tenders',()=>getNoticeDetailPart(getElicitatieClient(),{
   noticeId:100004524,noticeType,noticeVersion:2,page:0,
  }),{purpose:'coverage-audit-20261009-identity',boundedRequests:2,noticeType});
  // Persist only the public identity, not document contacts or other body fields.
  const row={noticeType,publicId:data.cNoticeId??data.rfqInvitationId,
   internalId:data.noticeID??data.noticeId,noticeNo:data.noticeNumber??data.noticeNo,
   actualType:data.sysNoticeType?.id};
  rows.push(row);console.log(JSON.stringify(row));
 }
 await writeFile('/tmp/coverage-audit-20261009-identity.json',JSON.stringify(rows,null,2));
}finally{await closeSharedDb();}
