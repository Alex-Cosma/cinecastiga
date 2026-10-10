/** Explicit bounded production pilot. Inspection is the default; --run admits source traffic. */
import {createDb} from '@seap/db';
import {contractNotice,registerNotice} from '../../lib/documents/store';
import {runDocumentPoolPilot} from '../../lib/documents/pool-pilot';
const {sql:q}=createDb(undefined,{max:16}),stop=new AbortController();
process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
const id=process.argv.find(s=>s.startsWith('--batch='))?.slice(8);
if(!id||!/^document-pool-20261010-[a-z0-9-]+$/.test(id))throw Error('Use a dated explicit batch ID.');
try{
 const [control]=await q`select revision,paused,maintenance,blocked_reason from app.collection_control where id=1`;
 const [proxy]=await q`select * from app.collection_proxy_control where id=1`;
 if(!control||control.paused||control.maintenance||control.blocked_reason||!proxy?.enabled)throw Error('Inspect source controls before pilot.');
 const existing=await q`select id from app.document_batches where id=${id}`;
 if(existing.length)throw Error('Batch already exists; inspect its persisted results. No automatic replay.');
 const candidates=await q`with recent as materialized (
  select c_notice_id,notice_namespace,state_date,authority_entity_id,procedure_id from core.notices where sys_notice_type_id=17 order by state_date desc nulls last,c_notice_id desc limit 10000
 ), associated as (
  select n.c_notice_id,n.state_date,a.ca_notice_id from recent n join core.awards a on a.procedure_id=n.procedure_id and a.authority_entity_id=n.authority_entity_id where n.procedure_id is not null
  union
  select n.c_notice_id,n.state_date,a.ca_notice_id from recent n join core.notice_award_sources l on l.c_notice_id=n.c_notice_id and l.notice_namespace=n.notice_namespace
  join core.awards a on a.ca_notice_id=l.ca_notice_id and a.authority_entity_id=n.authority_entity_id
 ) select distinct on(n.state_date,n.c_notice_id) c.ca_notice_contract_id::text contract_id,n.c_notice_id::text notice_id,n.state_date
 from associated n join core.contracts c on c.ca_notice_id=n.ca_notice_id
 order by n.state_date desc nulls last,n.c_notice_id desc,c.ca_notice_contract_id limit 60`;
 const notices=new Map<string,{notice:NonNullable<Awaited<ReturnType<typeof contractNotice>>>;contractId:string}>();
 for(const c of candidates){const notice=await contractNotice(c.contract_id,q);if(notice&&notice.noticeId===c.notice_id)notices.set(notice.key,{notice,contractId:c.contract_id});if(notices.size===20)break;}
 if(!notices.size)throw Error('No uniquely associated recent supported procedures found.');
 console.log(JSON.stringify({event:'document-pilot-preflight',batchId:id,notices:[...notices.values()].map(n=>({notice:n.notice.noticeNo,contractId:n.contractId,url:n.notice.url})),maxRequests:300,maxFiles:50,maxFileMiB:50,downloadSessions:10,ocrWorkers:4,sharedBudget:proxy,execute:process.argv.includes('--run')}));
 if(process.argv.includes('--run')){
  await q.begin(async tx=>{
   const [fresh]=await tx`select revision,paused,maintenance,blocked_reason from app.collection_control where id=1 for update`;
   if(!fresh||fresh.revision!==control.revision||fresh.paused||fresh.maintenance||fresh.blocked_reason)throw Error('Controls changed; inspect.');
   const [lock]=await tx`select pg_try_advisory_xact_lock(729114,1) acquired`;
   if(!lock?.acquired||(await tx`select id from app.document_jobs where status='running' limit 1`).length)throw Error('Wait for documents to drain.');
   await tx`insert into app.document_batches(id,max_requests,max_files,concurrency) values(${id},300,50,10)`;
   for(const {notice} of notices.values()){
    await registerNotice(notice,tx as unknown as typeof q);
    await tx`insert into app.document_jobs(notice_key,kind,dedup_key,requested_by,batch_id) values(${notice.key},'list',${`list:${notice.key}`},'system:document-pool-pilot',${id})`;
   }
   await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('ops:document-pool-pilot','Pilot documente','document-pool-pilot','{}',${JSON.stringify({batchId:id,notices:[...notices.keys()],maxRequests:300,maxFiles:50,maxFileMiB:50,downloadSessions:10,ocrWorkers:4,sharedBudgetPreserved:true})}::jsonb)`;
  });
  await runDocumentPoolPilot(q,id,stop.signal);
  const [batch]=await q`select * from app.document_batches where id=${id}`;
  const jobs=await q`select kind,status,count(*)::int n from app.document_jobs where batch_id=${id} group by 1,2`;
  const [files]=await q`select count(*)::int scheduled,count(*) filter(where d.original_hash is not null)::int downloaded,count(*) filter(where d.processed_at is not null)::int processed,coalesce(sum(d.page_count),0)::int pages from app.document_jobs j join app.procurement_documents d on d.id=j.document_id where j.batch_id=${id}`;
  console.log(JSON.stringify({event:'document-pilot-result',batch,jobs,files}));
 }
}finally{await q.end({timeout:5});}
