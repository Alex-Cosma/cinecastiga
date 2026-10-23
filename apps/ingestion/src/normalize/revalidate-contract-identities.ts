import {readRecoveredIdentityArchives} from './contract-identity-archives.js';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {assertContractIdentityQuality,inspectContractIdentityQuality,readContractIdentityMembers,type DbSql,type SnapshotHashCache} from '@seap/db';
import {assessContractPublicationGroup,assessContractVersions,assessContractSource,contractVersionAnchor,contractIdentitySignature,IDENTITY_RULES_VERSION,type ArchivedAward,type IdentityContract} from './contract-identity.js';
import {IDENTITY_REPAIR_ID,loadIdentityRepairBundle,type IdentityRepairBundle} from './scheduled-contract-identity.js';
import {AUTOMATIC_IDENTITY_REASON} from './discover-contract-identities.js';

type MemberRow={identity:IdentityContract;eligible:boolean;snapshot_hash:string};
type RegistryRow={id:string;fingerprint:string;evidence:{members:IdentityContract[]};decision:{canonical_contract_id:string|number;fingerprint:string}};
/** A group that failed re-verification. `id` is null when isolating it alone
 * cannot be safe (two approvals claim the same publication). */
type Blocked={id:string|null;message:string};
export {IDENTITY_RULES_VERSION};

/** Only extend an existing, explicitly approved identity. Every old economic
 * field of a stored publication must remain identical; separately published
 * amendments need complete proof and unambiguous source dates.
 * Unrelated new contracts never become approvals through this function. */
export function verifyApprovedPublications(registry:RegistryRow[],rows:MemberRow[],archives:ArchivedAward[]) {
 const {groups,blocked}=verifyApprovedBatch(registry,rows,archives,new Set());
 if(blocked.length)throw reviewError(blocked);
 return groups;
}
const reviewError=(blocked:Blocked[])=>Error(`${blocked.length} approved publication groups need review. ${blocked.slice(0,3).map(b=>b.message).join('; ')}`);

/** One bounded slice of the registry. `rows` must contain every contract of the
 * slice's official notice numbers; `used` spans all slices to detect overlaps. */
function verifyApprovedBatch(registry:RegistryRow[],rows:MemberRow[],archives:ArchivedAward[],used:Set<string>) {
 const byId=new Map(rows.map(r=>[r.identity.id,r]));
 const bySignature=new Map<string,IdentityContract[]>();
 const anchor=contractVersionAnchor;
 const byAnchor=new Map<string,IdentityContract[]>();
 for(const r of rows){const key=contractIdentitySignature(r.identity);bySignature.set(key,[...(bySignature.get(key)??[]),r.identity]);const a=anchor(r.identity);byAnchor.set(a,[...(byAnchor.get(a)??[]),r.identity]);}
 const byNotice=new Map<string,ArchivedAward[]>();
 for(const a of archives){const key=String(a.payload.caNoticeId);byNotice.set(key,[...(byNotice.get(key)??[]),a]);}
 const blocked:Blocked[]=[];
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
  for(const m of members){if(used.has(m.id))throw Object.assign(Error(`Overlapping approved groups: ${m.publicId}`),{overlap:true});used.add(m.id);}
  return [{id:previous.id,previous,verified,canonical,members:members.map(m=>({contract_id:m.id,candidate_id:previous.id,snapshot_hash:byId.get(m.id)!.snapshot_hash}))}];
  } catch(error) {
   blocked.push({id:(error as {overlap?:boolean}).overlap?null:previous.id,message:error instanceof Error?error.message:String(error)});return [];
  }
 });
 return {groups:verifiedGroups,blocked};
}

export const REVALIDATION_BATCH=500;
/** Production ceiling for groups that lose their approval in one run instead of
 * stopping publication (owner decision, 18 October 2026). More failures at once
 * point to a code or source-format change, which still stops the run. */
export const MAX_REVOKED_GROUPS=25;
type Population={value:string|null;previous:boolean};
type Member={contract_id:string;candidate_id:string;snapshot_hash:string};
/** Membership order is not identity: rows read in text order must not count as a change. */
const byContract=(members:Member[]=[])=>[...members].map(m=>({contract_id:String(m.contract_id),candidate_id:String(m.candidate_id),snapshot_hash:String(m.snapshot_hash)}))
 .sort((a,b)=>BigInt(a.contract_id)<BigInt(b.contract_id)?-1:BigInt(a.contract_id)>BigInt(b.contract_id)?1:0);

/** Read-only, in bounded slices of the approval registry. Each slice reads every
 * contract and archive of its official notice numbers, so anchors, siblings and
 * versions see the same evidence as a single pass; only memory is bounded.
 * The old bundle supplies historical sources no longer present in raw; fresh
 * revisions are added, never substituted to hide conflicts. Each slice carries
 * its review failures; the caller decides between stopping and revoking. */
export async function* approvedRevalidationBatches(q:DbSql,bundle:IdentityRepairBundle,boundary:string,size=REVALIDATION_BATCH,only?:string[]) {
 const origins=new Map(bundle.groups.map(g=>[g.id,g]));
 const historical=new Map<string,ArchivedAward[]>(),targets=only&&new Set(only);
 for(const a of bundle.archives){const key=String(a.payload.caNoticeId);historical.set(key,[...(historical.get(key)??[]),a]);}
 const ids=(await q`select d.candidate_id::text id from marts.contract_identity_decisions d
   join marts.contract_identity_candidates c on c.id=d.candidate_id order by d.candidate_id`).map(r=>String(r.id)).filter(id=>!targets||targets.has(id));
 // A targeted pass still rejects a contract claimed by any group it does not re-verify.
 const used=new Set<string>(only?(await q`select contract_id::text from marts.contract_identity_members where not (candidate_id=any(${only}::text[]))`).map(r=>String(r.contract_id)):[]);
 for(let i=0;i<ids.length;i+=size){
  const slice=ids.slice(i,i+size);
  const registry=await q`select c.id,c.fingerprint,c.evidence,to_jsonb(d) decision
    from marts.contract_identity_candidates c join marts.contract_identity_decisions d on d.candidate_id=c.id
    where c.id=any(${slice}::text[]) order by c.id`;
  for(const row of registry){
   const origin=origins.get(String(row.id));
   if(origin ? origin.members.some(m=>!row.evidence.members.some((n:IdentityContract)=>isDeepStrictEqual(m,n)))
     : row.decision.reason!==AUTOMATIC_IDENTITY_REASON)throw Error(`Approval is outside the verified historical bundle: ${row.id}`);
  }
  const notices=[...new Set(registry.flatMap(r=>r.evidence.members.map((m:IdentityContract)=>m.noticeNo)))];
  const contracts=await q`select c.id::text from core.awards a join core.contracts c using(ca_notice_id) where a.notice_no=any(${notices}::text[])`;
  const rows=await readContractIdentityMembers(q,contracts.map(r=>String(r.id))) as MemberRow[];
  const external=[...new Set(rows.map(r=>'award:'+r.identity.noticeId))];
  const fresh=await q`select id::text,content_hash,endpoint_version,payload from raw.raw_documents
    where external_id=any(${external}::text[]) and endpoint_version in ('award-list:v1','award-contracts:v1') and id<=${boundary}::bigint`;
  const archives=[...external.flatMap(e=>historical.get(e.slice('award:'.length))??[]),...await readRecoveredIdentityArchives(q,external),
   ...fresh.map(r=>({source:'production-current',rawId:String(r.id),hash:String(r.content_hash),endpoint:String(r.endpoint_version),payload:r.payload}))];
  const verified=verifyApprovedBatch(registry as unknown as RegistryRow[],rows,archives,used);
  const beforeMembers=await q`select contract_id::text,candidate_id,snapshot_hash from marts.contract_identity_members
    where candidate_id=any(${slice}::text[]) order by contract_id`;
  const eligibleIds=new Set(rows.filter(r=>r.eligible).map(r=>r.identity.id));
  const population:Population[]=verified.groups.flatMap(g=>[
   ...g.verified.members.filter(m=>eligibleIds.has(m.id)&&m.id!==g.canonical).map(m=>({value:m.value,previous:false})),
   ...g.previous.evidence.members.filter(m=>eligibleIds.has(m.id)&&m.id!==String(g.previous.decision.canonical_contract_id)).map(m=>({value:m.value,previous:true})),
  ]);
  yield {groups:verified.groups,blocked:verified.blocked,beforeMembers,population,checked:Math.min(i+size,ids.length),total:ids.length};
 }
}

async function revalidationImpact(q:DbSql,population:Population[]) {
 const [impact]=await q`select count(*) filter(where not previous)::int excluded_publications,
   trim_scale(coalesce(sum(value) filter(where not previous),0))::text excluded_value_ron,
   (count(*) filter(where not previous)-count(*) filter(where previous))::int additional_exclusions,
   trim_scale(coalesce(sum(value) filter(where not previous),0)-coalesce(sum(value) filter(where previous),0))::text net_reduction_ron
   from jsonb_to_recordset(${JSON.stringify(population)}::jsonb) x(value numeric,previous boolean)`;
 return impact;
}

/** Whole-registry result for small cohorts and tests. Production uses the batches. */
export async function prepareApprovedRevalidation(q:DbSql,bundle:IdentityRepairBundle,boundary:string) {
 const groups=[],beforeMembers=[],population:Population[]=[],blocked:Blocked[]=[];
 for await(const batch of approvedRevalidationBatches(q,bundle,boundary)){
  groups.push(...batch.groups);beforeMembers.push(...batch.beforeMembers);population.push(...batch.population);blocked.push(...batch.blocked);
 }
 if(blocked.length)throw reviewError(blocked);
 return {groups,beforeMembers,impact:await revalidationImpact(q,population)};
}

/** Removes the approval of groups that failed re-verification. The candidate keeps
 * its previous evidence plus the failure; discovery then excludes every former
 * member from totals and does not approve them again under the same rules
 * (`revokedIdentityHolds`). Source rows and history stay intact. */
async function revokeApprovals(sql:DbSql,runId:string,blocked:Blocked[],log:(message:string)=>void) {
 const revoked:{candidateId:string;reason:string;contracts:string[]}[]=[];
 for(const b of blocked){
  const [prev]=await sql`select c.fingerprint,c.evidence,to_jsonb(d) decision from marts.contract_identity_candidates c
   join marts.contract_identity_decisions d on d.candidate_id=c.id where c.id=${b.id!}`;
  if(!prev)throw Error(`Revoked approval disappeared: ${b.id}`);
  const members=byContract(await sql`select contract_id::text,candidate_id,snapshot_hash from marts.contract_identity_members where candidate_id=${b.id!}` as unknown as Member[]);
  const fingerprint=createHash('sha256').update(JSON.stringify(['revoked-approval-v1',prev.fingerprint,runId])).digest('hex');
  const revocation={runId,reason:b.message,rules:IDENTITY_RULES_VERSION,contracts:members.map(m=>m.contract_id)};
  const evidence={...prev.evidence,status:'conflict',fingerprint,
   reasons:[...new Set([...(prev.evidence.reasons??[]),'approval_revalidation_failed'])].sort(),revocation};
  await sql`insert into marts.contract_identity_revisions(candidate_id,processing_run_id,previous_snapshot,next_snapshot)
   values(${b.id!},${runId}::uuid,${JSON.stringify({decision:prev.decision,members})}::jsonb,
    ${JSON.stringify({revoked:true,fingerprint,reason:b.message,rules:IDENTITY_RULES_VERSION})}::jsonb)`;
  await sql`insert into marts.contract_identity_observations(fingerprint,candidate_id,evidence)
   values(${fingerprint},${b.id!},${JSON.stringify(evidence)}::jsonb) on conflict(fingerprint) do nothing`;
  await sql`update marts.contract_identity_candidates set status='conflict',fingerprint=${fingerprint},evidence=${JSON.stringify(evidence)}::jsonb,
   observed_at=clock_timestamp() where id=${b.id!}`;
  await sql`delete from marts.contract_identity_members where candidate_id=${b.id!}`;
  await sql`delete from marts.contract_identity_decisions where candidate_id=${b.id!}`;
  await sql`insert into app.collection_audit(actor_id,actor_name,action,before,after)
   values('system:processor','Reverificarea publicațiilor aprobate','identity-revoked',
    ${JSON.stringify({candidateId:b.id,decision:prev.decision})}::jsonb,${JSON.stringify({candidateId:b.id,fingerprint,...revocation})}::jsonb)`;
  log(`Publication revalidation: approval revoked for ${b.id}: ${b.message}`);
  revoked.push({candidateId:b.id!,reason:b.message,contracts:revocation.contracts});
 }
 return revoked;
}

/** Atomic, fully audited replacement of evidence for already approved groups.
 * Called only within backed-up, frozen nightly publication after normalization.
 * No changes to collection controls or original source rows. Versioned groups
 * select the latest source-dated, verified version; prior choices are audited.
 * Up to `maxRevoked` groups that no longer verify lose their approval instead of
 * stopping publication; the default stops on the first one. `identityHashes`: the
 * processing run's snapshot hash memo, for the opening and closing quality checks;
 * the evidence and the hashes written come from fresh reads either way. */
export async function revalidateApprovedContractIdentities(q:DbSql,runId:string,log:(message:string)=>void=()=>{},maxRevoked=0,identityHashes?:SnapshotHashCache) {
 return q.begin(async tx=>{
  const sql=tx as unknown as DbSql;
  await sql`set local statement_timeout='180s'`;await sql`set local work_mem='8MB'`;await sql`set local max_parallel_workers_per_gather=0`;await sql`set local jit=off`;
  const [run]=await sql`select r.*,c.maintenance,c.paused,c.revision,extract(dow from r.scheduled_day)::int=c.risk_weekday risk_day from app.processing_runs r cross join app.collection_control c where r.id=${runId}::uuid and c.id=1 for update of r,c`;
  if(!run||run.status!=='running'||!run.maintenance||!run.paused||run.revision!==run.control_revision||run.stage!=='identity-repair'||!run.raw_boundary||!run.stages?.backup?.completedAt||!run.stages?.['backup-verified']?.completedAt||!run.stages?.normalize?.completedAt)throw Error('Publication revalidation requires backed-up, normalized maintenance with unchanged operator control');
  const {report:before,staleGroups}=await inspectContractIdentityQuality(sql,identityHashes);
  if(before.valid)return {changedGroups:0,quality:before,mode:'none' as const};
  if(before.invalidDecisions)throw Error('Invalid approval registry requires manual recovery');
  const [repair]=await sql`select status,report from app.data_repairs where id=${IDENTITY_REPAIR_ID}`;
  const config=repair?.report?.configuration;
  if(repair?.status!=='completed'||!config?.path||!config?.sha256)throw Error('Completed historical approval and pinned evidence are required');
  const bundle=await loadIdentityRepairBundle(config.path,config.sha256);
  // Only groups with a stale member can change (verified against every full run
  // since 10 October). Full passes remain the weekly scheduled risk run, any rule
  // change, and every run until a full pass under the current rules confirms that
  // nothing outside the stale groups changed. Other full runs (archive collection
  // during maintenance, reporting changes, manual recovery) stay targeted: about
  // three hours each since the registry reached ~199,000 members (16 October).
  const [baseline]=await sql`select after->>'rules' rules,(after->>'changedOutsideTargets')::int outside from app.collection_audit
    where action='identity-revalidation' and after->>'mode'='full' order by id desc limit 1`;
  const weekly=run.trigger==='scheduled'&&run.scope==='full'&&run.risk_day===true;
  const mode=!weekly&&baseline?.rules===IDENTITY_RULES_VERSION&&baseline?.outside===0?'targeted':'full';
  log(`Publication revalidation: ${mode}, ${staleGroups.length} approved groups with changed members`);
  // Every slice is verified before its writes; a review failure in any later
  // slice rolls back candidates, observations, decisions, memberships AND history.
  const population:Population[]=[],blocked:Blocked[]=[];
  let changedGroups=0,extendedGroups=0,canonicalIdsChanged=0;
  let changedOutsideTargets=0;
  const targets=new Set(staleGroups);
  for await(const slice of approvedRevalidationBatches(sql,bundle,String(run.raw_boundary),REVALIDATION_BATCH,mode==='targeted'?staleGroups:undefined)){
   population.push(...slice.population);blocked.push(...slice.blocked);
   const oldByGroup=new Map<string,Array<(typeof slice.beforeMembers)[number]>>();
   for(const m of slice.beforeMembers)oldByGroup.set(String(m.candidate_id),[...(oldByGroup.get(String(m.candidate_id))??[]),m]);
   const changed=slice.groups.filter(g=>g.verified.fingerprint!==g.previous.fingerprint||!isDeepStrictEqual(byContract(oldByGroup.get(g.id) as Member[]),byContract(g.members)));
   changedGroups+=changed.length;changedOutsideTargets+=changed.filter(g=>!targets.has(g.id)).length;
   extendedGroups+=changed.filter(g=>g.verified.members.length>g.previous.evidence.members.length).length;
   canonicalIdsChanged+=changed.filter(g=>g.canonical!==String(g.previous.decision.canonical_contract_id)).length;
   for(let i=0;i<changed.length;i+=100){
    const batch=changed.slice(i,i+100).map(g=>({id:g.id,fingerprint:g.verified.fingerprint,evidence:g.verified,
     previous_snapshot:{decision:g.previous.decision,members:byContract(oldByGroup.get(g.id) as Member[])},
     next_snapshot:{fingerprint:g.verified.fingerprint,canonical_contract_id:g.canonical,members:byContract(g.members)}}));
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
   if(slice.checked%(REVALIDATION_BATCH*20)===0||slice.checked===slice.total)log(`Publication revalidation: ${slice.checked}/${slice.total} approved groups checked`);
  }
  // Owner decision 18 October 2026: a few groups that no longer verify are excluded
  // from totals until reviewed, instead of keeping the whole site in maintenance.
  if(blocked.length>maxRevoked||blocked.some(b=>!b.id))throw reviewError(blocked);
  const revoked=await revokeApprovals(sql,runId,blocked,log);
  changedOutsideTargets+=revoked.filter(r=>!targets.has(r.candidateId)).length;
  const impact=await revalidationImpact(sql,population);
  const after=await assertContractIdentityQuality(sql,identityHashes);
  // Impact covers the re-verified groups only; a targeted pass leaves the rest untouched.
  const report={changedGroups,extendedGroups,quality:after,impact,rawBoundary:String(run.raw_boundary),canonicalIdsChanged,
   mode,rules:IDENTITY_RULES_VERSION,staleGroups:staleGroups.length,...(mode==='full'?{changedOutsideTargets}:{}),
   ...(revoked.length?{revoked:revoked.map(r=>({candidateId:r.candidateId,reason:r.reason,publications:r.contracts.length}))}:{})};
  await sql`insert into app.collection_audit(actor_id,actor_name,action,before,after)
   values('system:processor','Reverificarea publicațiilor aprobate','identity-revalidation',${JSON.stringify({runId,quality:before})}::jsonb,${JSON.stringify(report)}::jsonb)`;
  log(`Publication revalidation: ${report.changedGroups} groups, ${report.extendedGroups} extended; ${after.members} verified source publications${mode==='full'?`; ${changedOutsideTargets} changed outside the stale groups`:''}`);
  return report;
 });
}
