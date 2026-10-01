/** Transactional guards shared by the dated coordinator and isolated regression tests. */
export async function pending(q){
 const [r]=await q`select (select count(*) from app.collection_requests where outcome='running')+
  (select count(*) from app.collection_tasks where status='running')+
  (select count(*) from app.document_jobs where status='running')+
  (select count(*) from app.evidence_captures where status in ('queued','running'))+
  (select count(*) from app.processing_runs where status='running') n,
  (select coalesce(max(id),0)::text from raw.raw_documents) raw,
  (select coalesce(max(id),0)::text from app.collection_requests) request`;
 return r;
}
export async function control(q,boundary,expectedDatabase='seap'){
 const [c]=await q`select *,current_database() database from app.collection_control where id=1 for update`;
 const work=await pending(q);
 if(c?.database!==expectedDatabase||!c.paused||!c.maintenance||c.revision!==Number(boundary.revision)||Number(work.n)!==0
  ||work.raw!==boundary.rawBoundary||work.request!==boundary.lastRequest)throw Error('Publication boundary changed');
 return c;
}
export async function claim(q,expected,expectedDatabase='seap'){
   const [c]=await q`select *,current_database() database from app.collection_control where id=1 for update`;
   const [running]=await q`select count(*)::int n from app.processing_runs where status='running'`;
   const [latest]=await q`select id,status from app.monitoring_refreshes order by version desc limit 1`;
   if(c?.database!==expectedDatabase||c.revision!==expected||c.maintenance||running.n||latest?.status!=='ready')throw Error('Control changed or unfinished processing');
   await q`update app.collection_control set paused=true,maintenance=true,revision=revision+1,updated_at=clock_timestamp() where id=1`;
   await q`insert into app.collection_audit(actor_id,actor_name,action,before,after)
    values('operator:identity-repair','Corectare identități istorice','identity-repair-start',
     ${JSON.stringify({revision:c.revision,paused:c.paused})}::jsonb,${JSON.stringify({revision:c.revision+1,maintenance:true,paused:true})}::jsonb)`;
   return {revision:c.revision,paused:c.paused,previousCheckpoint:latest.id};
}
