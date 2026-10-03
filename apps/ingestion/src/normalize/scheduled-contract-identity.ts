import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {isDeepStrictEqual} from 'node:util';
import {readContractIdentityMembers,type DbSql} from '@seap/db';
import {assessContractIdentity,contractIdentitySignature,type IdentityContract,type ArchivedAward} from './contract-identity.js';
import {approveContractIdentities} from './approve-contract-identities.js';
import {MONEY_REPAIR_ID} from './scheduled-money-repair.js';
export const IDENTITY_REPAIR_ID='contract-publication-identity-v1';
export interface IdentityRepairBundle {
 version:1; groups:ReturnType<typeof assessContractIdentity>[]; archives:ArchivedAward[];
 expected:{groups:number;duplicates:number;reductionRon:string};
}
export async function loadIdentityRepairBundle(path:string,sha256:string):Promise<IdentityRepairBundle> {
 if(!/^[a-f0-9]{64}$/.test(sha256))throw Error('Invalid identity bundle checksum');
 const bytes=await readFile(path);
 if(createHash('sha256').update(bytes).digest('hex')!==sha256)throw Error('Identity evidence bundle checksum mismatch');
 const bundle=JSON.parse(gunzipSync(bytes).toString('utf8')) as IdentityRepairBundle;
 if(bundle.version!==1||!Array.isArray(bundle.groups)||!Array.isArray(bundle.archives)||bundle.groups.length!==bundle.expected?.groups||!bundle.groups.length)throw Error('Invalid identity evidence bundle');
 return bundle;
}

/** Read-only re-inventory against CURRENT contracts and all archived revisions
 * available at the publication boundary. IDs alone never authorize grouping. */
export async function prepareIdentityRepair(q:DbSql,bundle:IdentityRepairBundle,boundary:string) {
 const notices=[...new Set(bundle.groups.flatMap(g=>g.members.map(m=>m.noticeNo)))];
 const ids=await q`select c.id::text from core.awards a join core.contracts c using(ca_notice_id) where a.notice_no=any(${notices}::text[])`;
 const rows=await readContractIdentityMembers(q,ids.map(r=>String(r.id)));
 const byPublic=new Map(rows.map(r=>[String(r.identity.publicId),r.identity as IdentityContract]));
 const signatures=new Map<string,number>();
 for(const r of rows){const key=contractIdentitySignature(r.identity as IdentityContract);signatures.set(key,(signatures.get(key)??0)+1);}
 const external=[...new Set(bundle.groups.flatMap(g=>g.members.map(m=>'award:'+m.noticeId)))];
 const fresh=await q`select id::text,content_hash,endpoint_version,payload from raw.raw_documents
  where external_id=any(${external}::text[]) and endpoint_version in ('award-list:v1','award-contracts:v1') and id<=${boundary}::bigint`;
 const archives=[...bundle.archives,...fresh.map(r=>({source:'production-current',rawId:String(r.id),hash:String(r.content_hash),endpoint:String(r.endpoint_version),payload:r.payload}))];
 const byNotice=new Map<string,ArchivedAward[]>();
 for(const a of archives){const key=String(a.payload.caNoticeId);byNotice.set(key,[...(byNotice.get(key)??[]),a]);}
 const groups=bundle.groups.map(expected=>{
  const members=expected.members.map(m=>{
   const live=byPublic.get(m.publicId);
   if(!live||!isDeepStrictEqual(live,m))throw Error(`Verified contract changed before scheduled deduplication: ${m.publicId}`);
   if(signatures.get(contractIdentitySignature(live))!==2)throw Error(`Publication multiplicity changed: ${m.publicId}`);
   return live;
  });
  const current=assessContractIdentity(members,members.flatMap(m=>byNotice.get(m.noticeId)??[]));
  if(current.id!==expected.id||current.status!=='source_verified')throw Error(`Current sources no longer support identity: ${expected.id}`);
  return current;
 });
 if(new Set(groups.map(g=>g.id)).size!==groups.length||new Set(groups.flatMap(g=>g.members.map(m=>m.id))).size!==groups.length*2)throw Error('Overlapping identity approvals');
 const membership=new Map(groups.flatMap(g=>g.members.map(m=>[m.id,g.id] as const)));
 const population=rows.filter(r=>r.eligible&&membership.has(String(r.identity.id))).map(r=>({group_id:membership.get(String(r.identity.id)),value:r.identity.value}));
 const [impact]=await q`with g as (select group_id,count(*) n,min(value) value from jsonb_to_recordset(${JSON.stringify(population)}::jsonb) x(group_id text,value numeric) group by group_id)
   select coalesce(sum(greatest(n-1,0)),0)::int duplicates,trim_scale(coalesce(sum(greatest(n-1,0)*value),0))::text reduction_ron from g`;
 if(impact?.duplicates!==bundle.expected.duplicates||impact?.reduction_ron!==bundle.expected.reductionRon)throw Error('Current deduplication impact differs from the approved simulation');
 return {groups,archives,impact};
}

/** One date, one full backed-up publication; deploy alone does not activate it. */
export async function runScheduledIdentityRepair(q:DbSql,runId:string,log:(m:string)=>void=()=>{}) {
 try{return await q.begin(async tx=>{
  const sql=tx as unknown as DbSql;
  const [repair]=await sql`select * from app.data_repairs where id=${IDENTITY_REPAIR_ID} for update`;
  if(!repair||repair.status==='completed')return null;
  const [r]=await sql`select r.*,c.maintenance,c.paused from app.processing_runs r cross join app.collection_control c where r.id=${runId}::uuid and c.id=1`;
  if(!r||!r.maintenance||!r.paused||r.status!=='running')throw Error('Identity repair requires active maintenance');
  if(repair.scheduled_day>r.scheduled_day)return null;
  if(repair.status!=='scheduled')throw Error('Unfinished identity repair requires operator recovery');
  if(repair.scheduled_day!==r.scheduled_day||r.scope!=='full'||!r.raw_boundary||!r.stages?.backup?.completedAt||!r.stages?.normalize?.completedAt||r.stage!=='identity-repair')throw Error('Identity repair requires its backed-up and normalized full run');
  const [money]=await sql`select status,processing_run_id from app.data_repairs where id=${MONEY_REPAIR_ID}`;
  if(!money||!['applied','completed'].includes(money.status)||(money.status==='applied'&&money.processing_run_id!==runId))throw Error('Currency repair must finish before identity repair');
  await sql`set local work_mem='8MB'`;await sql`set local max_parallel_workers_per_gather=0`;await sql`set local jit=off`;await sql`set local statement_timeout='180s'`;
  const config=repair.report?.configuration;
  if(!config?.path||!config?.sha256)throw Error('Missing identity evidence bundle configuration');
  const bundle=await loadIdentityRepairBundle(config.path,config.sha256);
  const prepared=await prepareIdentityRepair(sql,bundle,String(r.raw_boundary));
  for(let i=0;i<prepared.groups.length;i+=100){
   const batch=prepared.groups.slice(i,i+100).map(g=>({id:g.id,fingerprint:g.fingerprint,status:g.status,evidence:g}));
   await sql`insert into marts.contract_identity_candidates(id,fingerprint,status,evidence,active)
     select id,fingerprint,status,evidence,true from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) x(id text,fingerprint text,status text,evidence jsonb)
     on conflict(id) do update set fingerprint=excluded.fingerprint,status=excluded.status,evidence=excluded.evidence,active=true,observed_at=clock_timestamp()`;
   await sql`insert into marts.contract_identity_observations(fingerprint,candidate_id,evidence)
     select fingerprint,id,evidence from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) x(id text,fingerprint text,evidence jsonb) on conflict(fingerprint) do nothing`;
  }
  const approved=await approveContractIdentities(sql,prepared.groups,prepared.archives,'Owner-authorized one-time production repair, 2026-10-04, after verified backup and monetary normalization');
  const report={configuration:config,...approved,impact:prepared.impact};
  await sql`update app.data_repairs set status='applied',processing_run_id=${runId}::uuid,applied_at=clock_timestamp(),report=${JSON.stringify(report)}::jsonb,error=null where id=${IDENTITY_REPAIR_ID}`;
  log(`identity repair applied: ${approved.approvedGroups} groups; ${prepared.impact?.duplicates} repeated contributions`);return report;
 });}catch(error){
  log(`identity repair failed: ${error instanceof Error?error.message:'unknown error'}`);
  await q`update app.data_repairs set status='failed',processing_run_id=${runId}::uuid,error='Deduplicarea s-a oprit; tranzacția a fost anulată. Reverifică dovezile înainte de recuperare.' where id=${IDENTITY_REPAIR_ID} and status='scheduled'`;
  throw error;
 }
}
