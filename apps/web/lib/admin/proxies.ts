import type {DbSql} from '@seap/db';

interface ProxyEndpoint {
 id:string;exit_ip:string;configured:boolean;enabled:boolean;next_allowed_at:string|null;reserved_job:string|null;
 last_error:string|null;consecutive_failures:number;attempts:number;failed:number;bytes:string;
 last_at:string|null;job_status:string|null;
}

export async function proxyStatus(q:DbSql){
 const [settings]=await q`select * from app.collection_proxy_control where id=1`;
 const endpoints=await q<ProxyEndpoint[]>`select p.id,p.exit_ip,p.configured,p.enabled,p.next_allowed_at,p.reserved_job,p.last_error,p.consecutive_failures,
   coalesce(r.attempts,0)::int attempts,coalesce(r.failed,0)::int failed,coalesce(r.bytes,0)::text bytes,r.last_at,
   j.status job_status from app.collection_proxies p
   left join app.document_jobs j on j.id::text=p.reserved_job
   left join (select proxy_id,count(*) attempts,count(*) filter(where outcome in ('failed','interrupted')) failed,sum(bytes) bytes,max(started_at) last_at
     from app.collection_requests where started_at>=((now() at time zone 'Europe/Bucharest')::date::timestamp at time zone 'Europe/Bucharest') group by proxy_id) r on r.proxy_id=p.id order by substring(p.id from 7)::int`;
 // Same rolling window for the total and each endpoint, independent of today's totals.
 const pace=await q`select proxy_id,count(*)::int attempts from app.collection_requests
   where started_at>now()-interval '10 minutes' and started_at<=now() group by proxy_id`;
 const recent=new Map(pace.map(p=>[p.proxy_id,Number(p.attempts)]));
 return {directAllowed:process.env.SEAP_PROXY_REQUIRED!=='true',settings:settings!,
   endpoints:endpoints.map(p=>({...p,recent_attempts:recent.get(p.id)??0,observed_per_minute:(recent.get(p.id)??0)/10})),
   observedPerMinute:pace.reduce((sum,p)=>sum+Number(p.attempts),0)/10,
   directPerMinute:(recent.get(null)??0)/10,
   retiredPerMinute:pace.filter(p=>p.proxy_id!==null&&!endpoints.some(e=>e.id===p.proxy_id&&e.configured)).reduce((sum,p)=>sum+Number(p.attempts),0)/10};
}
export async function changeProxySettings(q:DbSql,body:Record<string,unknown>){
 const {enabled,minSeconds,maxSeconds,requestsPerMinute,activeIds}=body;
 const [before]=await q`select * from app.collection_proxy_control where id=1`;
 const maxInFlight=body.maxInFlight??before!.max_in_flight;
 if(!Number.isInteger(maxInFlight)||Number(maxInFlight)<1||Number(maxInFlight)>10)throw Error('Limita trebuie să fie între 1 și 10 cereri simultane.');
 if(typeof enabled!=='boolean'||!Number.isInteger(minSeconds)||!Number.isInteger(maxSeconds)||Number(minSeconds)<1||Number(maxSeconds)>3600||Number(maxSeconds)<Number(minSeconds))throw Error('Intervalul proxy trebuie să fie între 1 și 3.600 de secunde.');
 if(!Number.isInteger(requestsPerMinute)||Number(requestsPerMinute)<1||Number(requestsPerMinute)>50)throw Error('Limita totală trebuie să fie între 1 și 50 cereri pe minut.');
 if(!Array.isArray(activeIds)||activeIds.some(id=>typeof id!=='string'||!/^proxy-[1-9]\d{0,2}$/.test(id))||new Set(activeIds).size!==activeIds.length||(enabled&&!activeIds.length))throw Error('Selectează cel puțin un proxy pentru activare.');
 if(!enabled&&process.env.SEAP_PROXY_REQUIRED==='true')throw Error('Selectează conexiunea prin proxy: conexiunea directă este blocată pe acest server.');
 const endpoints=await q`select id from app.collection_proxies where configured`;
 if(activeIds.some(id=>!endpoints.some(p=>p.id===id)))throw Error('Selectează numai proxy-uri înregistrate în lista curentă de pe server.');
 const old=await q`select id from app.collection_proxies where enabled order by id`;
 await q`update app.collection_proxy_control set enabled=${enabled},max_in_flight=${Number(maxInFlight)},min_seconds=${Number(minSeconds)},max_seconds=${Number(maxSeconds)},requests_per_minute=${Number(requestsPerMinute)} where id=1`;
 await q`update app.collection_proxies set consecutive_failures=case when not enabled and id=any(${activeIds}::text[]) then 0 else consecutive_failures end,last_error=case when not enabled and id=any(${activeIds}::text[]) then null else last_error end,enabled=id=any(${activeIds}::text[]),
   next_allowed_at=case when ${Number(minSeconds)}> ${Number(before!.min_seconds)} then greatest(next_allowed_at,clock_timestamp()+${Number(minSeconds)}*interval '1 second') else next_allowed_at end`;
 // Changing mode or slowing the ceiling cannot shorten an existing wait.
 await q`update app.collection_control set next_allowed_at=greatest(next_allowed_at,clock_timestamp()+${enabled?60/Number(requestsPerMinute):Number(maxSeconds)}*interval '1 second') where id=1`;
 return {before:{...before,activeIds:old.map(p=>p.id)},after:{enabled,max_in_flight:maxInFlight,min_seconds:minSeconds,max_seconds:maxSeconds,requests_per_minute:requestsPerMinute,activeIds}};
}
