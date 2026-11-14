import type {DbSql} from './client.js';
import {loadSeapProxies, SeapProxyConfigurationError, type SeapProxy} from './proxy-config.js';
import {REFUSED_ENDPOINT_LIMIT,RESTRICTED_PROXY_LIMIT,RESTRICTED_PROXY_WINDOW_MINUTES} from './collection-limits.js';

/** Registration is explicit, while paused. Endpoints start disabled; no source traffic. */
export async function registerSeapProxies(q:DbSql,proxies:SeapProxy[]){
 return q.begin(async tx=>{
  const [c]=await tx`select paused from app.collection_control where id=1 for update`;
  const [drained]=await tx`select pg_try_advisory_xact_lock(729114,4) acquired`;
  const [active]=await tx`select id from app.document_jobs where status='running' limit 1`;
  if(!c?.paused||active||!drained?.acquired)throw Error('Oprește colectarea și așteaptă documentul activ înainte de înregistrarea proxy-urilor.');
  for(const p of proxies){
   const [old]=await tx`select server,exit_ip from app.collection_proxies where id=${p.id}`;
   const ip=new URL(p.server).hostname;
   if(old&&(old.server!==p.server||old.exit_ip!==ip))throw Error('Un identificator proxy existent nu poate fi reutilizat pentru alt IP.');
   await tx`insert into app.collection_proxies(id,server,exit_ip) values(${p.id},${p.server},${ip}) on conflict(id) do update set configured=true`;
  }
  await tx`update app.collection_proxies set configured=false,enabled=false where not(id=any(${proxies.map(p=>p.id)}::text[]))`;
 });
}

/** Called under collection_control FOR UPDATE and a shared HTTP drain lock. */
export async function proxyAdmission(q:DbSql,pinnedId?:string,jobId?:string,allowBusy=false){
 if(process.env.SEAP_PROXY_REQUIRED!==undefined&&!['true','false'].includes(process.env.SEAP_PROXY_REQUIRED))throw new SeapProxyConfigurationError();
 const [settings]=await q`select * from app.collection_proxy_control where id=1`;
 if(!settings?.enabled){
  if(pinnedId||process.env.SEAP_PROXY_REQUIRED==='true')throw Error('Modul proxy este oprit. Conexiunea directă nu este permisă.');
  return null;
 }
 const pool=await loadSeapProxies();
 if(!pool.length)throw Error('Lipsește configurația proxy. Conexiunea directă nu este permisă.');
 await q`update app.collection_proxies p set reserved_job=null where reserved_job is not null
   and not exists(select 1 from app.document_jobs j where j.id::text=p.reserved_job and j.status='running')`;
 const rows=await q`select *,greatest(0,extract(epoch from(next_allowed_at-clock_timestamp()))*1000) delay_ms
   from app.collection_proxies where configured and enabled and (${pinnedId??null}::text is null or id=${pinnedId??null})
   and (reserved_job is null or reserved_job=${jobId??null})
   and (${allowBusy} or not exists(select 1 from pg_locks l where l.database=(select oid from pg_database where datname=current_database()) and l.locktype='advisory' and l.classid=729120::oid and l.objid=substring(id from 7)::int::oid and l.objsubid=2 and l.granted)) order by next_allowed_at nulls first,id limit 1`;
 const row=rows[0];
 if(!row){
  const [enabled]=await q`select id from app.collection_proxies where configured and enabled and (${pinnedId??null}::text is null or id=${pinnedId??null}) limit 1`;
  if(enabled)return {proxy:null,delay:2000,settings};
  throw Error('Niciun proxy disponibil. Verifică proxy-urile active și rezervările.');
 }
 const proxy=pool.find(p=>p.id===row.id&&p.server===row.server);
 if(!proxy)throw Error('Configurația proxy diferă de registru. Conexiunea directă nu este permisă.');
 return {proxy,delay:Number(row.delay_ms),settings};
}

/** Worker owns global document lock for the full job. Persist reservation until browser closes. */
/** preferred: the proxy of a session the caller keeps (a lane's reused SEAP session), taken when it is free. */
export async function reserveDocumentProxy(q:DbSql,jobId:string,preferred?:string):Promise<SeapProxy|null>{
 await q`begin`;
 try{
  await q`select id from app.collection_control where id=1 for update`;
  // Only terminal jobs can leave reservations behind; never steal from a running job.
  await q`update app.collection_proxies p set reserved_job=null where reserved_job is not null
   and not exists(select 1 from app.document_jobs j where j.id::text=p.reserved_job and j.status='running')`;
  const kept=preferred?await proxyAdmission(q,preferred,jobId,true).catch(()=>null):null;
  const admission=kept?.proxy?kept:await proxyAdmission(q,undefined,jobId,true);
  if(admission&&!admission.proxy)throw Error('Toate proxy-urile sunt rezervate. Fără conexiune directă.');
  if(admission?.proxy)await q`update app.collection_proxies set reserved_job=${jobId} where id=${admission.proxy.id}`;
  await q`commit`;return admission?.proxy??null;
 }catch(e){await q`rollback`;throw e;}
}
export async function releaseDocumentProxy(q:DbSql,jobId:string){
 await q`update app.collection_proxies set reserved_job=null where reserved_job=${jobId}`;
}

/** Failure circuit is per endpoint, across tasks; success elsewhere cannot reset it. */
export async function recordProxyFailure(q:DbSql,id:string){
 await q`begin`;
 try{
  await q`select id from app.collection_control where id=1 for update`;
  const [p]=await q`update app.collection_proxies set consecutive_failures=consecutive_failures+1,
   enabled=case when consecutive_failures>=2 then false else enabled end,
   next_allowed_at=greatest(next_allowed_at,clock_timestamp()+(case when consecutive_failures=0 then 300 else 600 end)*interval '1 second'),
   last_error=case when consecutive_failures>=2 then 'Oprit după 3 erori consecutive. Verifică jurnalul înainte de reactivare.' else 'Conexiune eșuată. Pauză pentru acest proxy; celelalte continuă.' end
   where id=${id} returning consecutive_failures`;
  if(p?.consecutive_failures===3){
   await q`update app.collection_control set revision=revision+1,updated_at=clock_timestamp() where id=1`;
   await q`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:proxy-circuit','Sistem','proxy-auto-disabled',${JSON.stringify({proxyId:id,enabled:true})}::jsonb,${JSON.stringify({proxyId:id,enabled:false,reason:'3 consecutive connection failures'})}::jsonb)`;
  }
  await q`commit`;
 }catch(error){await q`rollback`.catch(()=>{});throw error;}
}

export const PROXY_RESTRICTED='SEAP a restricționat acest IP (403). Oprit automat; celelalte proxy-uri continuă.';
/**
 * A 403 through a proxy (owner, 11 November 2026): SEAP restricted that IP, so only that proxy stops (disabled and
 * audited) and its request goes to another IP. Everything still stops, as every 403 did before, when
 * - several IPs that had worked in the week before are refused within the window: SEAP is reacting to our traffic,
 *   not to an IP someone else had already burned (those fail on their first request and are only disabled);
 * - the same address is refused on several IPs: the refusal is about the request, and rotating would burn the pool.
 * Both count from the last confirmed unblock. Returns the reason when everything stops, otherwise null.
 */
export async function restrictProxy(q:DbSql,id:string,requestId:number,endpoint:string):Promise<string|null>{
 await q`begin`;
 try{
  await q`select id from app.collection_control where id=1 for update`;
  const [p]=await q`update app.collection_proxies set enabled=false,last_error=${PROXY_RESTRICTED} where id=${id} and enabled returning id`;
  if(p){
   await q`update app.collection_control set revision=revision+1,updated_at=clock_timestamp() where id=1`;
   await q`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:proxy-circuit','Sistem','proxy-restricted',${JSON.stringify({proxyId:id,enabled:true})}::jsonb,${JSON.stringify({proxyId:id,enabled:false,requestId,reason:'SEAP 403: IP restricționat'})}::jsonb)`;
  }
  const [n]=await q`with since as (select greatest(clock_timestamp()-${RESTRICTED_PROXY_WINDOW_MINUTES}*interval '1 minute',
     coalesce((select max(created_at) from app.collection_audit where action='unblock'),'-infinity'::timestamptz)) at)
   select (select count(distinct r.proxy_id) from app.collection_requests r,since where r.status=403 and r.proxy_id is not null and r.stream<>'ted' and r.started_at>since.at
     and exists(select 1 from app.collection_requests s where s.proxy_id=r.proxy_id and s.outcome='success' and s.started_at<r.started_at and s.started_at>r.started_at-interval '7 days'))::int proven,
    (select count(distinct r.proxy_id) from app.collection_requests r,since where r.status=403 and r.proxy_id is not null and r.endpoint=${endpoint} and r.started_at>since.at)::int same`;
  const reason=Number(n?.proven)>=RESTRICTED_PROXY_LIMIT?`SEAP a restricționat ${n!.proven} IP-uri care mergeau, în ${RESTRICTED_PROXY_WINDOW_MINUTES} de minute. Verifică ritmul înainte de reluare.`
   :Number(n?.same)>=REFUSED_ENDPOINT_LIMIT?`SEAP a refuzat aceeași cerere pe ${n!.same} IP-uri diferite (403). Verifică jurnalul înainte de reluare.`:null;
  if(reason)await q`update app.collection_control set blocked_reason=coalesce(blocked_reason,${reason}),blocked_until=null where id=1`;
  await q`commit`;return reason;
 }catch(error){await q`rollback`.catch(()=>{});throw error;}
}
