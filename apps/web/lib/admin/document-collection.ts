import {collectionQuietWindow,type DbSql} from '@seap/db';
import {collectionDb,CollectionConflict} from './collection';
import {CLASSIFICATION_VERSION} from '../documents/classification';
import {DOCUMENT_NOTICE_TYPES} from '../documents/shared';

export async function documentCollectionStatus(q:DbSql=collectionDb()){
 return q.begin('isolation level repeatable read read only',async tx=>{
  await tx`set local statement_timeout='15000ms'`;
  const [control]=await tx`select *,heartbeat_at>now()-interval '30 seconds' alive from app.document_collection_control where id=1`;
  if(!control)throw Error('Configurația documentelor lipsește.');
  // The documents stream is resumed here: the collection page shows controls only for the data streams.
  const [source]=await tx`select c.paused,c.maintenance,c.blocked_reason,c.paused_streams,c.revision,p.enabled proxy_enabled,
   (select case when a.action='stream-auto-paused' then a.after->>'reason' end from app.collection_audit a
     where (a.action='stream-auto-paused' and a.after->>'stream'='documents')
        or (a.action='stream' and coalesce(a.after->'pausedStreams' ? 'documents',false)<>coalesce(a.before->'pausedStreams' ? 'documents',false))
     order by a.created_at desc limit 1) stream_reason
   from app.collection_control c cross join app.collection_proxy_control p where c.id=1 and p.id=1`;
  // Eligible: participation notices of a supported family that awarded contracts, as the collector seeds them.
  const [coverage]=await tx`select count(*) filter(where linked)::int eligible,count(*) filter(where not linked)::int unsupported from (
   select coalesce(n.sys_notice_type_id=any(${DOCUMENT_NOTICE_TYPES}::int[]) and (n.sys_notice_type_id<>17 or n.notice_namespace='rfq') and n.c_notice_id>0 and n.notice_no is not null
    and (exists(select 1 from core.awards a where a.procedure_id=n.procedure_id and a.authority_entity_id=n.authority_entity_id)
     or exists(select 1 from core.notice_award_sources l join core.awards a on a.ca_notice_id=l.ca_notice_id where l.c_notice_id=n.c_notice_id and l.notice_namespace=n.notice_namespace and a.authority_entity_id=n.authority_entity_id)),false) linked
   from core.notices n) x`;
  const [inventory]=await tx`select count(*)::int registered,count(*) filter(where checked_at is not null and inventory>=2)::int checked,count(*) filter(where checked_at is not null and total=0)::int empty from app.document_notices where automatic`;
  const [files]=await tx`select count(*)::int discovered,count(*) filter(where filename ~* '[.](pdf|p7[sm]|docx?|xlsx?|zip|rar|7z)$')::int supported,count(*) filter(where filename ~* '[.](pdf|p7[sm]|docx?|xlsx?|zip|rar|7z)$' and original_hash is not null)::int downloaded,count(*) filter(where filename ~* '[.](pdf|p7[sm]|docx?|xlsx?|zip|rar|7z)$' and processed_at is not null)::int processed from app.procurement_documents d join app.document_notices n on n.key=d.notice_key where n.automatic`;
  const [jobs]=await tx`select count(*) filter(where status='queued' and stage<>'specifications_only')::int queued,count(*) filter(where status='queued' and stage='specifications_only')::int held,count(*) filter(where status='running')::int running,count(*) filter(where status='failed')::int failed,count(*) filter(where status='queued' and stage<>'specifications_only' and retry_at>now())::int retries from app.document_jobs where automatic`;
  const [classification]=await tx`select count(*)::int total,
   count(*) filter(where classification_version>=${CLASSIFICATION_VERSION} and classification_pdf_hash is not distinct from pdf_hash)::int classified,
   count(*) filter(where classification is null or classification->'categories' @> '["unknown"]'::jsonb)::int uncertain,
   count(*) filter(where priority=0)::int specifications,
   count(*) filter(where priority=0 and original_hash is not null)::int specifications_downloaded,
   count(*) filter(where priority=0 and processed_at is not null)::int specifications_ready
   from app.procurement_documents`;
  const active=await tx`select j.id,j.kind,j.stage,j.pages_done,j.pages_total,n.notice_no,d.filename,d.original_hash is not null downloaded from app.document_jobs j join app.document_notices n on n.key=j.notice_key left join app.procurement_documents d on d.id=j.document_id where j.automatic and j.status='running' order by j.slot limit 14`;
  const errors=await tx`select j.id,j.kind,j.error,n.notice_no,d.filename from app.document_jobs j join app.document_notices n on n.key=j.notice_key left join app.procurement_documents d on d.id=j.document_id where j.automatic and j.status='failed' order by j.finished_at desc,j.id limit 10`;
  const [traffic]=await tx`select count(*)::int attempts,count(*) filter(where outcome='success')::int succeeded,count(*) filter(where outcome in ('failed','interrupted'))::int failed from app.collection_requests where stream='documents' and started_at>=((now() at time zone 'Europe/Bucharest')::date::timestamp at time zone 'Europe/Bucharest')`;
  const quiet=await collectionQuietWindow(tx as unknown as DbSql);
  return {control,source:source!,quiet:quiet.active,coverage:coverage!,inventory:inventory!,files:files!,jobs:jobs!,classification:classification!,active,errors,traffic:traffic!};
 });
}
export type DocumentCollectionStatus=Awaited<ReturnType<typeof documentCollectionStatus>>;
export async function changeDocumentCollection(actor:{id:string;name:string},body:Record<string,unknown>,q:DbSql=collectionDb()){
 if(!['start','pause','resume','retry','downloads-on','downloads-off'].includes(String(body.action)))throw Error('Acțiune nevalidă.');
 return q.begin(async tx=>{
  const [before]=await tx`select * from app.document_collection_control where id=1 for update`;
  if(!before||before.revision!==body.revision)throw new CollectionConflict('Statusul s-a schimbat. Actualizează înainte să reîncerci.');
  if(body.action==='start'||body.action==='resume'){
   const [proxy]=await tx`select enabled,exists(select 1 from app.collection_proxies where configured and enabled) available from app.collection_proxy_control where id=1`;
   if(!proxy?.enabled||!proxy.available)throw Error('Activează mai întâi poolul din Conexiune SEAP.');
   await tx`update app.document_collection_control set enabled=true,paused=false,started_at=coalesce(started_at,now()),error=null where id=1`;
  }else if(body.action==='pause'){
   await tx`update app.document_collection_control set paused=true where id=1`;
  }else if(body.action==='downloads-on'||body.action==='downloads-off'){
   await tx`update app.document_collection_control set automatic_downloads=${body.action==='downloads-on'} where id=1`;
  }else{
   await tx`update app.document_jobs set status='queued',stage=case when kind='file' and exists(select 1 from app.procurement_documents d where d.id=document_id and d.original_hash is not null) then 'process_queued' else 'queued' end,attempts=0,retry_at=null,finished_at=null where automatic and status='failed' and not exists(select 1 from app.document_jobs active where active.dedup_key=document_jobs.dedup_key and active.status in ('queued','running'))`;
  }
  const [after]=await tx`update app.document_collection_control set revision=revision+1 where id=1 returning *`;
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values(${actor.id},${actor.name},${'documents-'+body.action},${JSON.stringify({enabled:before.enabled,paused:before.paused,automaticDownloads:before.automatic_downloads,revision:before.revision})}::jsonb,${JSON.stringify({enabled:after!.enabled,paused:after!.paused,automaticDownloads:after!.automatic_downloads,revision:after!.revision})}::jsonb)`;
  return after!;
 });
}
