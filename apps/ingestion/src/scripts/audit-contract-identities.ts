/** Offline evidence inventory on a local isolated copy. Never modifies contract/mart totals. */
import {createDb,contractRonValue} from '@seap/db';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {mkdir,writeFile} from 'node:fs/promises';
import {assessContractIdentity,contractIdentitySignature,type IdentityContract,type ArchivedAward} from '../normalize/contract-identity.js';
const u=new URL(process.env.DATABASE_URL??'postgres://invalid/');
if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||!u.pathname.startsWith('/seap_test_currency_'))throw Error('Requires local isolated monetary copy');
const [output,...files]=process.argv.slice(2);if(!output||!files.length)throw Error('Provide output directory and targeted archived JSONL files');
const {sql}=createDb();
try {
 const archives:ArchivedAward[]=[];
 for(const file of files)for await(const line of createInterface({input:createReadStream(file),crlfDelay:Infinity})) {
  const r=JSON.parse(line);archives.push({source:r.archive_source??file.split('/').slice(-2).join('/'),hash:r.content_hash,rawId:String(r.id),endpoint:r.endpoint_version,payload:r.payload});
 }
 const byNotice=new Map<string,ArchivedAward[]>();
 for(const a of archives){const id=String(a.payload.caNoticeId);const list=byNotice.get(id)??[];list.push(a);byNotice.set(id,list);}
 const result=await sql.begin(async tx=>{
  const q=tx as unknown as typeof sql;
  await q`set local statement_timeout='120s'`;await q`set local work_mem='8MB'`;await q`set local max_parallel_workers_per_gather=0`;await q`set local jit=off`;
  const rows=await q`with repeated as materialized (select notice_no from core.awards where notice_no is not null group by notice_no having count(*)>1)
   select c.id::text,c.ca_notice_contract_id::text "publicId",c.ca_notice_id::text "noticeId",a.notice_no "noticeNo",a.authority_entity_id::text authority,e.cui_canonical "authorityCui",
    c.contract_no number,to_char(c.contract_date at time zone 'Europe/Bucharest','YYYY-MM-DD') date,trim_scale(${contractRonValue(q)})::text value,
    case when ${contractRonValue(q)} is not null then 'RON' end currency,c.title,c.lots_caption lots,coalesce(c.cpv_code,a.cpv_code) cpv,a.procedure_type procedure,a.acquisition_type acquisition,
    array(select w.entity_id::text from core.contract_winners w where w.contract_id=c.id order by w.entity_id) winners,
    array(select we.cui_canonical from core.contract_winners w join core.entities we on we.id=w.entity_id where w.contract_id=c.id order by w.entity_id) "winnerCuis"
   from repeated r join core.awards a using(notice_no) join core.contracts c using(ca_notice_id) left join core.entities e on e.id=a.authority_entity_id
   where c.contract_no is not null and ${contractRonValue(q)}>0`;
  const groups=new Map<string,IdentityContract[]>();
  for(const row of rows){const c=row as unknown as IdentityContract;const key=contractIdentitySignature(c);const list=groups.get(key)??[];list.push(c);groups.set(key,list);}
  const candidates=[...groups.values()].filter(g=>g.length>1&&new Set(g.map(c=>c.noticeId)).size>1).map(g=>assessContractIdentity(g,[...new Set(g.map(c=>c.noticeId))].flatMap(id=>byNotice.get(id)??[])));
  const before=await q`select id,fingerprint from marts.contract_identity_candidates where active`;
  const previous=new Map(before.map(r=>[String(r.id),String(r.fingerprint)]));
  await q`update marts.contract_identity_candidates set active=false where active`;
  for(let n=0;n<candidates.length;n+=100){
   const batch=candidates.slice(n,n+100).map(c=>({id:c.id,fingerprint:c.fingerprint,status:c.status,evidence:c}));
   await q`insert into marts.contract_identity_candidates(id,fingerprint,status,evidence,active)
    select id,fingerprint,status,evidence,true from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) x(id text,fingerprint text,status text,evidence jsonb)
    on conflict(id) do update set fingerprint=excluded.fingerprint,status=excluded.status,evidence=excluded.evidence,active=true,observed_at=clock_timestamp()`;
   await q`insert into marts.contract_identity_observations(fingerprint,candidate_id,evidence)
    select fingerprint,id,evidence from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) x(id text,fingerprint text,evidence jsonb)
    on conflict(fingerprint) do nothing`;
  }
  // Population AFTER the monetary correction, before any identity exclusions.
  await q`create temp table identity_eligible on commit drop as
   select c.id,${contractRonValue(q)} value_ron,a.authority_entity_id,c.contract_date,a.cpv_code
   from core.contracts c join core.awards a using(ca_notice_id)
   where ${contractRonValue(q)}>0 and ${contractRonValue(q)}<=1000000000 and c.contract_date is not null and a.authority_entity_id is not null
    and exists(select 1 from core.contract_winners w where w.contract_id=c.id)
    and not(coalesce(c.title,'')~*'acord[- ]cadru' and coalesce(c.title,'')!~*'subsecvent' and exists(select 1 from core.contracts s where s.ca_notice_id=c.ca_notice_id and s.title~*'subsecvent'))`;
  await q`create index on identity_eligible(id)`;
  const exposure=await q`with members as (
   select r.id,r.status,(m->>'id')::bigint contract_id from marts.contract_identity_candidates r cross join lateral jsonb_array_elements(r.evidence->'members') m where active
  ), grouped as(select m.id,m.status,count(e.id)::int n,min(e.value_ron) value from members m left join identity_eligible e on e.id=m.contract_id group by 1,2)
  select status,count(*)::int groups,count(*) filter(where n>1)::int multiple_included,
   coalesce(sum(greatest(n-1,0)*value),0)::text hypothetical_reduction_ron from grouped group by status order by status`;
  // Counterfactual only: deterministic representative among equally eligible,
  // source-verified members. This is NOT a legal replacement decision.
  await q`create temp table identity_simulated_removals on commit drop as
   with members as (select r.id group_id,(m->>'id')::bigint contract_id
    from marts.contract_identity_candidates r cross join lateral jsonb_array_elements(r.evidence->'members') m
    where r.active and r.status='source_verified'), ranked as (
    select m.*,row_number() over(partition by group_id order by contract_id) position,
     min(contract_id) over(partition by group_id) retained_id
    from members m join identity_eligible e on e.id=m.contract_id)
   select * from ranked where position>1`;
  await q`create unique index on identity_simulated_removals(contract_id)`;
  await q`analyze identity_simulated_removals`;
  const deltas=await q`select r.group_id,c.ca_notice_contract_id::text removed_public_id,k.ca_notice_contract_id::text retained_public_id,
    e.value_ron::text reduction_ron,e.authority_entity_id::text authority_id,e.cpv_code,
    to_char(e.contract_date at time zone 'Europe/Bucharest','YYYY') as year
   from identity_simulated_removals r join identity_eligible e on e.id=r.contract_id
   join core.contracts c on c.id=r.contract_id join core.contracts k on k.id=r.retained_id
   order by e.value_ron desc,c.id`;
  const dimensions=await q`with removed as(select e.* from identity_simulated_removals r join identity_eligible e on e.id=r.contract_id)
   select 'authority' dimension,authority_entity_id::text key,count(*)::int contracts,sum(value_ron)::text reduction_ron from removed group by 2
   union all select 'cpv',cpv_code,count(*)::int,sum(value_ron)::text from removed group by 2
   union all select 'year',to_char(contract_date at time zone 'Europe/Bucharest','YYYY'),count(*)::int,sum(value_ron)::text from removed group by 2`;
  const suppliers=await q`with w as(
   select r.contract_id,e.value_ron,cw.entity_id,
    count(*) over(partition by r.contract_id) n,row_number() over(partition by r.contract_id order by cw.entity_id) position
   from identity_simulated_removals r join identity_eligible e on e.id=r.contract_id join core.contract_winners cw on cw.contract_id=r.contract_id
  ), allocations as(select *,case when position=n then value_ron-trunc(value_ron/n,case when value_ron/n<0.01 then scale(value_ron)+length(n::text)+1 else 2 end)*(n-1)
   else trunc(value_ron/n,case when value_ron/n<0.01 then scale(value_ron)+length(n::text)+1 else 2 end) end allocated_value from w)
   select 'supplier' dimension,entity_id::text key,count(*)::int contracts,sum(allocated_value)::text reduction_ron from allocations group by entity_id`;
  dimensions.push(...suppliers);
  const [balanced]=await q`select not exists(select 1 from (
   select dimension,sum(reduction_ron) amount from jsonb_to_recordset(${JSON.stringify(dimensions)}::jsonb) x(dimension text,reduction_ron numeric) group by dimension
  ) d where amount is distinct from (select coalesce(sum(e.value_ron),0) from identity_simulated_removals r join identity_eligible e on e.id=r.contract_id)) ok`;
  if(!balanced?.ok)throw Error('Simulation dimensions do not reconcile');
  const [simulation]=await q`select count(*)::int contracts_before,sum(value_ron)::text total_before_ron,
   count(*) filter(where r.contract_id is null)::int contracts_after,
   sum(value_ron) filter(where r.contract_id is null)::text total_after_ron,
   coalesce(sum(value_ron) filter(where r.contract_id is not null),0)::text hypothetical_reduction_ron
   from identity_eligible e left join identity_simulated_removals r on r.contract_id=e.id`;
  const reasons:Record<string,number>={};for(const c of candidates)for(const r of c.reasons)reasons[r]=(reasons[r]??0)+1;
  return {candidates,deltas,dimensions,summary:{methodology:'contract-identity-1',database:u.pathname.slice(1),archivedResponses:archives.length,groups:candidates.length,
   added:candidates.filter(c=>!previous.has(c.id)).length,changed:candidates.filter(c=>previous.has(c.id)&&previous.get(c.id)!==c.fingerprint).length,
   inactive:[...previous.keys()].filter(id=>!candidates.some(c=>c.id===id)).length,reasons,exposure,simulation,approvedGroups:0,appliedReductionRon:'0',note:'Source verification is not a decision to merge. Amounts are hypothetical, after monetary correction.'}};
 });
 await mkdir(output,{recursive:true});await writeFile(output+'/summary.json',JSON.stringify(result.summary,null,2)+'\n');
 await writeFile(output+'/examples.json',JSON.stringify(['source_verified','needs_evidence','conflict'].flatMap(status=>result.candidates.filter(c=>c.status===status).slice(0,3)),null,2)+'\n');
 await writeFile(output+'/simulated-removals.json',JSON.stringify(result.deltas,null,2)+'\n');
 await writeFile(output+'/simulated-dimensions.json',JSON.stringify(result.dimensions,null,2)+'\n');
 console.log(JSON.stringify(result.summary));
}finally{await sql.end();}
