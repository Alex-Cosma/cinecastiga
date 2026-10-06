import type {DbSql} from '@seap/db';

export async function proxyStatus(q:DbSql){
 const [settings]=await q`select * from app.collection_proxy_control where id=1`;
 const endpoints=await q`select p.id,p.exit_ip,p.enabled,p.next_allowed_at,p.reserved_job,p.last_error,
   coalesce(r.attempts,0)::int attempts,coalesce(r.failed,0)::int failed,coalesce(r.bytes,0)::text bytes,r.last_at,
   j.status job_status from app.collection_proxies p
   left join app.document_jobs j on j.id::text=p.reserved_job
   left join (select proxy_id,count(*) attempts,count(*) filter(where outcome in ('failed','interrupted')) failed,sum(bytes) bytes,max(started_at) last_at
     from app.collection_requests where started_at>=((now() at time zone 'Europe/Bucharest')::date::timestamp at time zone 'Europe/Bucharest') group by proxy_id) r on r.proxy_id=p.id order by p.id`;
 const [pace]=await q`select count(*)::int attempts from app.collection_requests where started_at>now()-interval '10 minutes'`;
 return {directAllowed:process.env.SEAP_PROXY_REQUIRED!=='true',settings:settings!,endpoints,observedPerMinute:Number(pace?.attempts??0)/10};
}
export async function changeProxySettings(q:DbSql,body:Record<string,unknown>){
 const {enabled,minSeconds,maxSeconds,requestsPerMinute,activeIds}=body;
 if(typeof enabled!=='boolean'||!Number.isInteger(minSeconds)||!Number.isInteger(maxSeconds)||Number(minSeconds)<1||Number(maxSeconds)>3600||Number(maxSeconds)<Number(minSeconds))throw Error('Intervalul proxy trebuie să fie între 1 și 3.600 de secunde.');
 if(!Number.isInteger(requestsPerMinute)||Number(requestsPerMinute)<1||Number(requestsPerMinute)>10)throw Error('Limita totală trebuie să fie între 1 și 10 cereri pe minut.');
 if(!Array.isArray(activeIds)||activeIds.some(id=>typeof id!=='string'||!/^proxy-[1-9]\d{0,2}$/.test(id))||new Set(activeIds).size!==activeIds.length||(enabled&&!activeIds.length))throw Error('Selectează cel puțin un proxy pentru activare.');
 if(!enabled&&process.env.SEAP_PROXY_REQUIRED==='true')throw Error('Selectează conexiunea prin proxy: conexiunea directă este blocată pe acest server.');
 const endpoints=await q`select id from app.collection_proxies`;
 if(activeIds.some(id=>!endpoints.some(p=>p.id===id)))throw Error('Selectează numai proxy-uri înregistrate pe server.');
 const [before]=await q`select * from app.collection_proxy_control where id=1`;
 const old=await q`select id from app.collection_proxies where enabled order by id`;
 await q`update app.collection_proxy_control set enabled=${enabled},min_seconds=${Number(minSeconds)},max_seconds=${Number(maxSeconds)},requests_per_minute=${Number(requestsPerMinute)} where id=1`;
 await q`update app.collection_proxies set enabled=id=any(${activeIds}::text[]),
   next_allowed_at=case when ${Number(minSeconds)}> ${Number(before!.min_seconds)} then greatest(next_allowed_at,clock_timestamp()+${Number(minSeconds)}*interval '1 second') else next_allowed_at end`;
 // Changing mode or slowing the ceiling cannot shorten an existing wait.
 await q`update app.collection_control set next_allowed_at=greatest(next_allowed_at,clock_timestamp()+${enabled?60/Number(requestsPerMinute):Number(maxSeconds)}*interval '1 second') where id=1`;
 return {before:{...before,activeIds:old.map(p=>p.id)},after:{enabled,min_seconds:minSeconds,max_seconds:maxSeconds,requests_per_minute:requestsPerMinute,activeIds}};
}
