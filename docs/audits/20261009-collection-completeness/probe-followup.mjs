// Bounded follow-up: 8 historical award inventories + 9 direct-acquisition first pages.
// Explicitly invoked only; shared gate, no recovery writes or automatic retries.
import {mkdir,writeFile} from 'node:fs/promises';
import {withCollectionStream} from '/app/packages/db/dist/index.js';
import {getNoticeContracts,listDirectAcquisitions} from '/app/packages/scraper-clients/dist/index.js';
import {getElicitatieClient} from '/app/apps/ingestion/dist/scrape/elicitatie/client.js';
import {closeSharedDb} from '/app/apps/ingestion/dist/db.js';
const candidates=[{"year": 2018, "noticeId": 100041497}, {"year": 2019, "noticeId": 100112102}, {"year": 2020, "noticeId": 100182681}, {"year": 2021, "noticeId": 100257504}, {"year": 2022, "noticeId": 100311799}, {"year": 2023, "noticeId": 100426782}, {"year": 2024, "noticeId": 100518991}, {"year": 2025, "noticeId": 100598863}];
const dest='/tmp/coverage-audit-20261009-followup',summary=[];
try {
 await mkdir(dest,{recursive:true});
 const save=async(label,data,meta)=>{
  await writeFile(dest+'/'+label+'.json',JSON.stringify(data));
  const row={...meta,total:data.total,searchTooLong:data.searchTooLong??null,count:data.items?.length,ids:data.items?.map(i=>i.directAcquisitionId??i.caNoticeContractId??i.contractId)};
  summary.push(row);await writeFile(dest+'/summary.json',JSON.stringify(summary,null,2));
  console.log(JSON.stringify({...row,ids:undefined}));
 };
 for(const c of candidates){
  const {data}=await withCollectionStream('awards',()=>getNoticeContracts(getElicitatieClient(),{caNoticeId:c.noticeId,skip:0,take:200}),{purpose:'coverage-audit-20261009-followup',boundedRequests:17,...c});
  await save('contracts-'+c.year,data,{kind:'contracts',...c});
 }
 for(let year=2018;year<=2026;year++){
  const from=year+'-01-01',to=year===2026?'2026-10-08':year+'-12-31';
  const {data}=await withCollectionStream('da',()=>listDirectAcquisitions(getElicitatieClient(),{finalizationDateStart:from,finalizationDateEnd:to,pageIndex:0,pageSize:100}),{purpose:'coverage-audit-20261009-followup',boundedRequests:17,year});
  await save('da-'+year,data,{kind:'da',year,from,to});
 }
}finally{await closeSharedDb();}
