import type {DbSql} from './client.js';
import {loadSeapProxies, SeapProxyConfigurationError, type SeapProxy} from './proxy-config.js';

/** Registration is explicit, while paused. Endpoints start disabled; no source traffic. */
export async function registerSeapProxies(q:DbSql,proxies:SeapProxy[]){
 return q.begin(async tx=>{
  const [c]=await tx`select paused from app.collection_control where id=1 for update`;
  const [active]=await tx`select id from app.document_jobs where status='running' limit 1`;
  if(!c?.paused||active)throw Error('Oprește colectarea și așteaptă documentul activ înainte de înregistrarea proxy-urilor.');
  for(const p of proxies){
   const [old]=await tx`select server,exit_ip from app.collection_proxies where id=${p.id}`;
   const ip=new URL(p.server).hostname;
   if(old&&(old.server!==p.server||old.exit_ip!==ip))throw Error('Un identificator proxy existent nu poate fi reutilizat pentru alt IP.');
   await tx`insert into app.collection_proxies(id,server,exit_ip) values(${p.id},${p.server},${ip}) on conflict(id) do nothing`;
  }
 });
}

/** Called under collection_control FOR UPDATE and the global HTTP lock. */
export async function proxyAdmission(q:DbSql,pinnedId?:string,jobId?:string){
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
   from app.collection_proxies where enabled and (${pinnedId??null}::text is null or id=${pinnedId??null})
   and (reserved_job is null or reserved_job=${jobId??null}) order by next_allowed_at nulls first,id`;
 const row=rows[0];
 if(!row){
  const [enabled]=await q`select id from app.collection_proxies where enabled limit 1`;
  if(enabled&&!pinnedId)return {proxy:null,delay:2000,settings};
  throw Error('Niciun proxy disponibil. Verifică proxy-urile active și rezervările.');
 }
 const proxy=pool.find(p=>p.id===row.id&&p.server===row.server);
 if(!proxy)throw Error('Configurația proxy diferă de registru. Conexiunea directă nu este permisă.');
 return {proxy,delay:Number(row.delay_ms),settings};
}

/** Worker owns global document lock for the full job. Persist reservation until browser closes. */
export async function reserveDocumentProxy(q:DbSql,jobId:string):Promise<SeapProxy|null>{
 await q`begin`;
 try{
  await q`select id from app.collection_control where id=1 for update`;
  // Only terminal jobs can leave reservations behind; never steal from a running job.
  await q`update app.collection_proxies p set reserved_job=null where reserved_job is not null
   and not exists(select 1 from app.document_jobs j where j.id::text=p.reserved_job and j.status='running')`;
  const admission=await proxyAdmission(q,undefined,jobId);
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
