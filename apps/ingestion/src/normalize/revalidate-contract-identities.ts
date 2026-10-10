import {isDeepStrictEqual} from 'node:util';
import {assertContractIdentityQuality,readContractIdentityMembers,readContractIdentityQuality,type DbSql} from '@seap/db';
import {assessContractPublicationGroup,assessContractVersions,assessContractSource,contractVersionAnchor,contractIdentitySignature,type ArchivedAward,type IdentityContract} from './contract-identity.js';
import {IDENTITY_REPAIR_ID,loadIdentityRepairBundle,type IdentityRepairBundle} from './scheduled-contract-identity.js';

type MemberRow={identity:IdentityContract;eligible:boolean;snapshot_hash:string};
type RegistryRow={id:string;fingerprint:string;evidence:{members:IdentityContract[]};decision:{canonical_contract_id:string|number;fingerprint:string}};

/** Only extend an existing, explicitly approved identity. Every old economic
 * field of a stored publication must remain identical; separately published
 * amendments need complete proof and unambiguous source dates.
 * Unrelated new contracts never become approvals through this function. */
export function verifyApprovedPublications(registry:RegistryRow[],rows:MemberRow[],archives:ArchivedAward[]) {
 const byId=new Map(rows.map(r=>[r.identity.id,r]));
 const bySignature=new Map<string,IdentityContract[]>();
 const anchor=contractVersionAnchor;
 const byAnchor=new Map<string,IdentityContract[]>();
 for(const r of rows){const key=contractIdentitySignature(r.identity);bySignature.set(key,[...(bySignature.get(key)??[]),r.identity]);const a=anchor(r.identity);byAnchor.set(a,[...(byAnchor.get(a)??[]),r.identity]);}
 const byNotice=new Map<string,ArchivedAward[]>();
 for(const a of archives){const key=String(a.payload.caNoticeId);byNotice.set(key,[...(byNotice.get(key)??[]),a]);}
 const used=new Set<string>();
 const blocked:string[]=[];
 const verifiedGroups=registry.flatMap(previous=>{
  try {
  for(const member of previous.evidence.members){
   if(!isDeepStrictEqual(byId.get(member.id)?.identity,member))throw Error(`Approved economic identity changed: ${member.publicId}`);
  }
  const originalSignature=contractIdentitySignature(previous.evidence.members[0]!);
  const exact=bySignature.get(originalSignature)??[];
  const anchored=byAnchor.get(anchor(previous.evidence.members[0]!))??[];
  const siblingSignatures=new Set(anchored.filter(m=>contractIdentitySignature(m)!==originalSignature&&exact.some(e=>e.noticeId===m.noticeId)).map(contractIdentitySignature));
  const siblings=anchored.filter(m=>siblingSignatures.has(contractIdentitySignature(m)));
  for(const sibling of siblings){
   if(!exact.some(m=>m.noticeId===sibling.noticeId)||assessContractSource(sibling,byNotice.get(sibling.noticeId)??[]).status!=='source_verified')throw Error(`Ambiguous coexisting contract: ${sibling.publicId}`);
  }
  const members=anchored.filter(m=>!siblingSignatures.has(contractIdentitySignature(m)));
  const revised=new Set(members.map(contractIdentitySignature)).size>1;
  if(revised&&siblings.length)throw Error(`Version lineage is ambiguous between coexisting contracts: ${previous.id}`);
  if(previous.evidence.members.some(m=>!members.some(n=>n.id===m.id)))throw Error(`Approved member disappeared: ${previous.id}`);
  const verified=(revised?assessContractVersions:assessContractPublicationGroup)(members,members.flatMap(m=>byNotice.get(m.noticeId)??[]));
  if(verified.status!=='source_verified')throw Error(`Publication evidence needs review: ${previous.id}: ${verified.reasons.join(', ')}`);
  const canonical=revised?members.find(m=>m.publicId===verified.latestPublicId)!.id:String(previous.decision.canonical_contract_id);
  if(!members.some(m=>m.id===canonical)||(!revised&&!byId.get(canonical)?.eligible&&members.some(m=>byId.get(m.id)?.eligible)))throw Error(`Canonical publication eligibility changed: ${previous.id}`);
  for(const m of members){if(used.has(m.id))throw Error(`Overlapping approved groups: ${m.publicId}`);used.add(m.id);}
  return [{id:previous.id,previous,verified,canonical,members:members.map(m=>({contract_id:m.id,candidate_id:previous.id,snapshot_hash:byId.get(m.id)!.snapshot_hash}))}];
  } catch(error) { blocked.push(error instanceof Error?error.message:String(error));return []; }
 });
 if(blocked.length)throw Error(`${blocked.length} approved publication groups need review. ${blocked.slice(0,3).join('; ')}`);
 return verifiedGroups;
}

/** Read-only preflight, also used on a copied production cohort. The old bundle
 * supplies historical sources no longer present in raw; fresh revisions are
 * added, never substituted to hide conflicts. */
export async function prepareApprovedRevalidation(q:DbSql,bundle:IdentityRepairBundle,boundary:string) {
 const registry=await q`select c.id,c.fingerprint,c.evidence,to_jsonb(d) decision
   from marts.contract_identity_candidates c join marts.contract_identity_decisions d on d.candidate_id=c.id order by c.id`;
 const origins=new Map(bundle.groups.map(g=>[g.id,g]));
 for(const row of registry){
  const origin=origins.get(String(row.id));
  if(!origin||origin.members.some(m=>!row.evidence.members.some((n:IdentityContract)=>isDeepStrictEqual(m,n))))throw Error(`Approval is outside the verified historical bundle: ${row.id}`);
 }
 const notices=[...new Set(registry.flatMap(r=>r.evidence.members.map((m:IdentityContract)=>m.noticeNo)))];
 const ids=await q`select c.id::text from core.awards a join core.contracts c using(ca_notice_id) where a.notice_no=any(${notices}::text[])`;
 const rows=await readContractIdentityMembers(q,ids.map(r=>String(r.id))) as MemberRow[];
 const external=[...new Set(rows.map(r=>'award:'+r.identity.noticeId))];
 const fresh=await q`select id::text,content_hash,endpoint_version,payload from raw.raw_documents
   where external_id=any(${external}::text[]) and endpoint_version in ('award-list:v1','award-contracts:v1') and id<=${boundary}::bigint`;
 const archives=[...bundle.archives,...fresh.map(r=>({source:'production-current',rawId:String(r.id),hash:String(r.content_hash),endpoint:String(r.endpoint_version),payload:r.payload}))];
 const groups=verifyApprovedPublications(registry as unknown as RegistryRow[],rows,archives);
 const beforeMembers=await q`select contract_id::text,candidate_id,snapshot_hash from marts.contract_identity_members order by contract_id`;
 const eligibleIds=new Set(rows.filter(r=>r.eligible).map(r=>r.identity.id));
 const population=groups.flatMap(g=>[
  ...g.verified.members.filter(m=>eligibleIds.has(m.id)&&m.id!==g.canonical).map(m=>({value:m.value,previous:false})),
  ...g.previous.evidence.members.filter(m=>eligibleIds.has(m.id)&&m.id!==String(g.previous.decision.canonical_contract_id)).map(m=>({value:m.value,previous:true})),
 ]);
 const [impact]=await q`select count(*) filter(where not previous)::int excluded_publications,
   trim_scale(coalesce(sum(value) filter(where not previous),0))::text excluded_value_ron,
   (count(*) filter(where not previous)-count(*) filter(where previous))::int additional_exclusions,
   trim_scale(coalesce(sum(value) filter(where not previous),0)-coalesce(sum(value) filter(where previous),0))::text net_reduction_ron
   from jsonb_to_recordset(${JSON.stringify(population)}::jsonb) x(value numeric,previous boolean)`;
 return {groups,beforeMembers,impact};
}

/** Atomic, fully audited replacement of evidence for already approved groups.
 * Called only within backed-up, frozen nightly publication after normalization.
 * No changes to collection controls or original source rows. Versioned groups
 * select the latest source-dated, verified version; prior choices are audited. */
export async function revalidateApprovedContractIdentities(q:DbSql,runId:string,log:(message:string)=>void=()=>{}) {
 return q.begin(async tx=>{
  const sql=tx as unknown as DbSql;
  await sql`set local statement_timeout='180s'`;await sql`set local work_mem='8MB'`;await sql`set local max_parallel_workers_per_gather=0`;await sql`set local jit=off`;
  const [run]=await sql`select r.*,c.maintenance,c.paused,c.revision from app.processing_runs r cross join app.collection_control c where r.id=${runId}::uuid and c.id=1 for update of r,c`;
  if(!run||run.status!=='running'||!run.maintenance||!run.paused||run.revision!==run.control_revision||run.stage!=='identity-repair'||!run.raw_boundary||!run.stages?.backup?.completedAt||!run.stages?.['backup-verified']?.completedAt||!run.stages?.normalize?.completedAt)throw Error('Publication revalidation requires backed-up, normalized maintenance with unchanged operator control');
  const before=await readContractIdentityQuality(sql);
  if(before.valid)return {changedGroups:0,quality:before};
  if(before.invalidDecisions)throw Error('Invalid approval registry requires manual recovery');
  const [repair]=await sql`select status,report from app.data_repairs where id=${IDENTITY_REPAIR_ID}`;
  const config=repair?.report?.configuration;
  if(repair?.status!=='completed'||!config?.path||!config?.sha256)throw Error('Completed historical approval and pinned evidence are required');
  const bundle=await loadIdentityRepairBundle(config.path,config.sha256);
  const prepared=await prepareApprovedRevalidation(sql,bundle,String(run.raw_boundary));
  const oldByGroup=new Map<string,Array<(typeof prepared.beforeMembers)[number]>>();
  for(const m of prepared.beforeMembers)oldByGroup.set(String(m.candidate_id),[...(oldByGroup.get(String(m.candidate_id))??[]),m]);
  const changed=prepared.groups.filter(g=>g.verified.fingerprint!==g.previous.fingerprint||!isDeepStrictEqual(oldByGroup.get(g.id),g.members));
  // Every check above completes before the first write. Any later failure rolls
  // back candidates, observations, decisions, memberships AND revision history.
  for(let i=0;i<changed.length;i+=100){
   const batch=changed.slice(i,i+100).map(g=>({id:g.id,fingerprint:g.verified.fingerprint,evidence:g.verified,
    previous_snapshot:{decision:g.previous.decision,members:oldByGroup.get(g.id)},
    next_snapshot:{fingerprint:g.verified.fingerprint,canonical_contract_id:g.canonical,members:g.members}}));
   await sql`insert into marts.contract_identity_revisions(candidate_id,processing_run_id,previous_snapshot,next_snapshot)
    select id,${runId}::uuid,previous_snapshot,next_snapshot from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
    x(id text,previous_snapshot jsonb,next_snapshot jsonb)`;
   await sql`insert into marts.contract_identity_observations(fingerprint,candidate_id,evidence)
    select fingerprint,id,evidence from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) x(id text,fingerprint text,evidence jsonb) on conflict(fingerprint) do nothing`;
   await sql`update marts.contract_identity_candidates c set fingerprint=x.fingerprint,evidence=x.evidence,observed_at=clock_timestamp()
    from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) x(id text,fingerprint text,evidence jsonb) where c.id=x.id`;
   await sql`update marts.contract_identity_decisions d set fingerprint=x.fingerprint,canonical_contract_id=(x.next_snapshot->>'canonical_contract_id')::bigint
    from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) x(id text,fingerprint text,next_snapshot jsonb) where d.candidate_id=x.id`;
   const members=changed.slice(i,i+100).flatMap(g=>g.members);
   await sql`insert into marts.contract_identity_members(contract_id,candidate_id,snapshot_hash)
    select contract_id,candidate_id,snapshot_hash from jsonb_to_recordset(${JSON.stringify(members)}::jsonb) x(contract_id bigint,candidate_id text,snapshot_hash text)
    on conflict(contract_id) do update set snapshot_hash=excluded.snapshot_hash where marts.contract_identity_members.candidate_id=excluded.candidate_id`;
  }
  const after=await assertContractIdentityQuality(sql);
  const report={changedGroups:changed.length,extendedGroups:changed.filter(g=>g.verified.members.length>g.previous.evidence.members.length).length,
   quality:after,impact:prepared.impact,rawBoundary:String(run.raw_boundary),canonicalIdsChanged:changed.filter(g=>g.canonical!==String(g.previous.decision.canonical_contract_id)).length};
  await sql`insert into app.collection_audit(actor_id,actor_name,action,before,after)
   values('system:processor','Reverificarea publicațiilor aprobate','identity-revalidation',${JSON.stringify({runId,quality:before})}::jsonb,${JSON.stringify(report)}::jsonb)`;
  log(`Publication revalidation: ${report.changedGroups} groups, ${report.extendedGroups} extended; ${after.members} verified source publications`);
  return report;
 });
}
