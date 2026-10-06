import type {DbSql} from '@seap/db';

/** Metadata only. Append immutable closed windows; never rewrite existing tasks or retry budgets. */
export async function advanceRecovery(q:DbSql,{enable=false,now}:{enable?:boolean;now?:Date}={}){
 return q.begin(async tx=>{
  const [control]=await tx`select maintenance from app.collection_control where id=1 for update`;
  if(!control||control.maintenance)return null;
  const batches=await tx`select * from app.collection_batches order by created_at for update`;
  if(!batches.length)return null;
  if(batches.length!==1)throw Error('Inspect multiple recovery batches before advancing their scope.');
  const b=batches[0]!;
  if(!enable&&!b.follow_latest)return null;
  const [clock]=await tx`select (d::date-case when d::time<'03:30'::time then 2 else 1 end)::text target from
   (select coalesce(${now?.toISOString()??null}::timestamptz,clock_timestamp()) at time zone 'Europe/Bucharest' d) x`;
  const target=String(clock!.target);
  if(target<=String(b.end_day)){
   if(enable&&!b.follow_latest){
    await tx`update app.collection_batches set follow_latest=true,seed_end_day=coalesce(seed_end_day,end_day) where id=${b.id}`;
    await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:recovery-scope','Colector','recovery-scope',${JSON.stringify({batchId:b.id,endDay:b.end_day,followLatest:false})}::jsonb,${JSON.stringify({batchId:b.id,endDay:b.end_day,followLatest:true,added:0})}::jsonb)`;
   }
   return {batchId:b.id,endDay:b.end_day,added:0};
  }
  const [range]=await tx`select (${b.end_day}::date+1)::text start`;
  const from=String(range!.start);
  // Include catalogue-discovered authorities even if nightly core processing has not published them yet.
  const da=await tx`with authorities as (
   select sicap_id id from core.entity_sicap_ids where namespace='authority'
   union select (params->>'authorityId')::bigint from app.collection_tasks where batch_id=${b.id} and kind='da'
  ) insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,priority)
   select ${b.id},'da:da:'||id||':'||${from}||':'||${target}||':0','da:da:'||id||':'||${from}||':'||${target},'da','da',jsonb_build_object('authorityId',id,'from',${from}::text,'to',${target}::text,'page',0),10 from authorities where id is not null
   on conflict(batch_id,key) do nothing returning id`;
  const notices=await tx`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,priority)
   select ${b.id},f||':list::'||d::date||':'||d::date||':0',f||':list::'||d::date||':'||d::date,f,'list',jsonb_build_object('from',d::date::text,'to',d::date::text,'page',0),10
   from generate_series(${from}::date,${target}::date,interval '1 day') d cross join unnest(array['tenders','awards']) f
   on conflict(batch_id,key) do nothing returning id`;
  const catalogue=await tx`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,priority)
   values(${b.id},${`catalogue:catalogue::${from}:${target}:0`},${`catalogue:catalogue::${from}:${target}`},'catalogue','catalogue',${JSON.stringify({from,to:target,page:0})}::jsonb,10)
   on conflict(batch_id,key) do nothing returning id`;
  const added=da.length+notices.length+catalogue.length;
  await tx`update app.collection_batches set seed_end_day=coalesce(seed_end_day,end_day),end_day=${target},follow_latest=true,status='collecting' where id=${b.id}`;
  await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:recovery-scope','Colector','recovery-scope',${JSON.stringify({batchId:b.id,endDay:b.end_day,followLatest:b.follow_latest})}::jsonb,${JSON.stringify({batchId:b.id,from,endDay:target,followLatest:true,added,direct:da.length,noticeDays:notices.length,catalogue:catalogue.length})}::jsonb)`;
  return {batchId:b.id,from,endDay:target,added};
 });
}
