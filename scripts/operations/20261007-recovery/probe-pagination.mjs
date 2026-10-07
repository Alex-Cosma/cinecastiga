// One explicit incident probe, during drained maintenance only. Never scheduled.
// Run with the collection image/network/proxy mount; mount a private /reports directory.
import {writeFile} from 'node:fs/promises';
import {createDb,loadSeapProxies,responseDiagnosticBody,diagnosticError} from '/app/packages/db/dist/index.js';
import {withProxyResponse} from '/app/apps/ingestion/dist/scrape/elicitatie/proxy-fetch.js';
const skip=Number(process.argv[2]);
if(![200,400].includes(skip))throw Error('Only the two incident pages are authorized');
const worker=`ops:pagination-20261007:${skip}`, {sql}=createDb();
let requestId;
try {
 const proxies=await loadSeapProxies();
 const [source]=await sql`select diagnostics,parameters from app.collection_requests where id=51915`;
 const body=JSON.parse(source.diagnostics.request.body);body.skip=skip;
 const proxyId=await sql.begin(async q=>{
  const [c]=await q`select *,next_allowed_at<=now() due from app.collection_control where id=1 for update`;
  if(!c.maintenance||!c.paused||!c.due||c.blocked_reason!=='Sarcina 190888: Dimensiunea paginii depășește limita cerută.')throw Error('Unexpected control state');
  const [busy]=await q`select (select count(*) from app.collection_requests where outcome='running')+(select count(*) from app.collection_tasks where status='running')+(select count(*) from app.document_jobs where status='running')+(select count(*) from app.processing_runs where status='running') n`;
  if(Number(busy.n))throw Error('Maintenance must be drained');
  if((await q`select id from app.collection_requests where worker=${worker}`).length)throw Error('Probe already attempted; inspect it instead');
  if(c.daily_limit!==null){const [n]=await q`select count(*) n from app.collection_requests where started_at>=((now() at time zone 'Europe/Bucharest')::date::timestamp at time zone 'Europe/Bucharest')`;if(Number(n.n)>=c.daily_limit)throw Error('Daily cap');}
  const [p]=await q`select id from app.collection_proxies where configured and enabled and reserved_job is null and coalesce(next_allowed_at,now())<=now() order by id limit 1 for update`;
  if(!p||!proxies.some(x=>x.id===p.id))throw Error('No configured healthy proxy');
  const [r]=await q`insert into app.collection_requests(stream,worker,method,endpoint,parameters,proxy_id,diagnostics) values('awards',${worker},'POST',${source.diagnostics.request.path},${JSON.stringify({caNoticeId:100646288,skip,take:200})}::jsonb,${p.id},${JSON.stringify({context:{incident:'pagination-20261007',maintenanceProbe:true}})}::jsonb) returning id`;
  requestId=r.id;
  await q`update app.collection_control set next_allowed_at=clock_timestamp()+interval '70 seconds' where id=1`;
  await q`update app.collection_proxies set next_allowed_at=clock_timestamp()+interval '70 seconds' where id=${p.id}`;
  return p.id;
 });
 const result=await withProxyResponse('https://e-licitatie.ro'+source.diagnostics.request.path,{method:'POST',headers:source.diagnostics.request.headers,body:JSON.stringify(body)},proxies.find(p=>p.id===proxyId),AbortSignal.timeout(45000),async response=>{
  const bytes=new Uint8Array(await response.arrayBuffer());return {status:response.status,bytes,diagnostic:responseDiagnosticBody(bytes,true)};
 });
 const value=JSON.parse(Buffer.from(result.bytes).toString('utf8'));
 await sql`update app.collection_requests set outcome=${result.status===200?'success':'failed'},status=${result.status},bytes=${result.bytes.length},records=${value.items?.length??null},finished_at=clock_timestamp(),diagnostics=diagnostics||${JSON.stringify({response:result.diagnostic})}::jsonb where id=${requestId}`;
 if(result.status!==200)throw Error('Probe HTTP failure; no retries');
 await writeFile(`/reports/page-${skip}.json`,JSON.stringify(value),{mode:0o600});
 console.log(JSON.stringify({requestId,proxyId,skip,status:result.status,total:value.total,items:value.items?.length,frameworks:value.items?.filter(i=>i.contractType===2).map(i=>i.caNoticeContractId)}));
}catch(error){
 if(requestId)await sql`update app.collection_requests set outcome='failed',error='Incident pagination probe failed; inspect diagnostics',finished_at=clock_timestamp(),diagnostics=diagnostics||${JSON.stringify({exception:diagnosticError(error)})}::jsonb where id=${requestId}`;
 console.error('Probe failed; no automatic retry. Inspect incident ledger.');process.exitCode=1;
}finally{await sql.end({timeout:10});}
