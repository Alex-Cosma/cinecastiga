/** Read-only audit of pending contractual identities on an isolated local copy.
 * Does not start collection, approve candidates or change any database rows.
 * Usage: node --import tsx .../audit-contract-ambiguities.ts OUTPUT.json
 * OUTPUT must not exist; public source evidence can be large, keep it outside Git.
 */
import {writeFile} from 'node:fs/promises';
import {createDb,readContractIdentityMembers,type DbSql} from '@seap/db';
import {prepareNewContractIdentities} from '../normalize/discover-contract-identities.js';
import {IDENTITY_REPAIR_ID,loadIdentityRepairBundle} from '../normalize/scheduled-contract-identity.js';

const target=process.argv[2];
const url=new URL(process.env.DATABASE_URL??'postgres://invalid/');
if(!target||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!url.pathname.startsWith('/seap_test_'))
 throw Error('Usage: audit-contract-ambiguities.ts OUTPUT.json with an isolated localhost seap_test_* database');
const tally=(values:string[])=>{
 const counts=new Map<string,number>();for(const key of values)counts.set(key,(counts.get(key)??0)+1);
 return Object.fromEntries([...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])));
};
const {sql}=createDb();
try{
 const report=await sql.begin('isolation level repeatable read read only',async tx=>{
  const q=tx as unknown as DbSql;
  await q`set local statement_timeout='120s'`;await q`set local lock_timeout='1s'`;
  await q`set local work_mem='8MB'`;await q`set local max_parallel_workers_per_gather=0`;await q`set local jit=off`;
  const prior=await q`select distinct x.candidate_id,x.fingerprint,o.evidence from marts.contract_identity_exclusions x
   join marts.contract_identity_observations o on o.fingerprint=x.fingerprint order by x.candidate_id`;
  const ids=prior.flatMap(g=>g.evidence.members.map((m:{id:string})=>m.id));
  const rows=await readContractIdentityMembers(q,ids);
  const eligible=new Set(rows.filter(r=>r.eligible).map(r=>String(r.identity.id)));
  const notices=[...new Set(rows.map(r=>String(r.identity.noticeNo)))];
  const [boundary]=await q`select max(id)::text id from raw.raw_documents`;
  const [repair]=await q`select status,report from app.data_repairs where id=${IDENTITY_REPAIR_ID}`;
  const config=repair?.report?.configuration;
  const supplemental=repair?.status==='completed'&&config?.path&&config?.sha256
   ?(await loadIdentityRepairBundle(config.path,config.sha256)).archives:[];
  const prepared=await prepareNewContractIdentities(q,String(boundary?.id??'0'),notices,supplemental,false,console.log);
  const byGroup=new Map(prepared.groups.map(g=>[g.id,g]));
  const groups=prior.map(g=>{
   const current=byGroup.get(String(g.candidate_id));
   const financial=g.evidence.members.some((m:{id:string})=>eligible.has(m.id));
   return {id:String(g.candidate_id),financial,previousFingerprint:String(g.fingerprint),previousReasons:g.evidence.reasons as string[],
    resolved:current?.status==='source_verified',currentReasons:current?.reasons??['identity_relationship_unresolved'],
    members:current?.members??g.evidence.members,current:current??null};
  });
  const unresolved=groups.filter(g=>!g.resolved);
  const targets=new Map<string,{noticeId:string;groups:string[];contractPublicIds:string[];reasons:string[];financial:boolean}>();
  for(const g of unresolved)for(const member of g.members){
   const id=String(member.noticeId);
   const t=targets.get(id)??{noticeId:id,groups:[],contractPublicIds:[],reasons:[],financial:false};
   t.groups=[...new Set([...t.groups,g.id])];t.contractPublicIds=[...new Set([...t.contractPublicIds,String(member.publicId)])];
   t.reasons=[...new Set([...t.reasons,...g.currentReasons])];t.financial||=g.financial;targets.set(id,t);
  }
  return {version:1,checkedAt:new Date().toISOString(),database:url.pathname.slice(1),mode:'read-only',sourceRequests:0,rawBoundary:boundary?.id??null,
   summary:{beforeGroups:groups.length,beforeFinancial:groups.filter(g=>g.financial).length,
    resolved:groups.filter(g=>g.resolved).length,resolvedFinancial:groups.filter(g=>g.resolved&&g.financial).length,
    remaining:unresolved.length,remainingFinancial:unresolved.filter(g=>g.financial).length,
    remainingReasons:tally(unresolved.flatMap(g=>g.currentReasons)),remainingFinancialReasons:tally(unresolved.filter(g=>g.financial).flatMap(g=>g.currentReasons)),
    evidenceTargetNotices:targets.size,evidenceTargetFinancialNotices:[...targets.values()].filter(t=>t.financial).length},
   groups,evidenceTargets:[...targets.values()].sort((a,b)=>Number(b.financial)-Number(a.financial)||a.noticeId.localeCompare(b.noticeId)),
   limitation:'Evidence targets are notice IDs to inspect in existing archives first, not an authorized request queue or an HTTP request count.'};
 });
 await writeFile(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report.summary,null,2));
}finally{await sql.end();}
