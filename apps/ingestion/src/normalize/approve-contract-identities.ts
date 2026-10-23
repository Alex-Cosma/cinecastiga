import {isDeepStrictEqual} from 'node:util';
import {assertContractIdentityQuality,readContractIdentityMembers,type DbSql,type SnapshotHashCache} from '@seap/db';
import {assessContractIdentity,assessContractPublicationGroup,assessContractVersions,type ArchivedAward,type IdentityContract} from './contract-identity.js';

/** Caller holds the publication/writer gate and a transaction. Only explicitly
 * selected evidence fingerprints can be approved; never fuzzy/blanket merging. */
async function stageApprovals(q:DbSql, selected:{id:string;fingerprint:string}[], archives:ArchivedAward[],reason:string) {
 if(!reason.trim()||new Set(selected.map(s=>s.id)).size!==selected.length)throw Error('Unique explicit decisions and a reason are required');
 const registry=await q`select id,fingerprint,evidence from marts.contract_identity_candidates
   where active and status='source_verified' and id=any(${selected.map(s=>s.id)}::text[]) for update`;
 if(registry.length!==selected.length)throw Error('Selected decisions include unverified or inactive candidates');
 const expected=new Map(selected.map(s=>[s.id,s.fingerprint]));
 const byNotice=new Map<string,ArchivedAward[]>();
 for(const a of archives){const id=String(a.payload.caNoticeId);byNotice.set(id,[...(byNotice.get(id)??[]),a]);}
 const ids=registry.flatMap(r=>r.evidence.members.map((m:IdentityContract)=>m.id));
 if(new Set(ids).size!==ids.length)throw Error('A publication belongs to multiple selected identities');
 let current=await readContractIdentityMembers(q,ids);
 let live=new Map(current.map(r=>[String(r.identity.id),r]));
 const checkedRegistry=registry.map(r=>{
   const source=r.evidence.members as IdentityContract[];
   const assess=r.evidence.methodology==='contract-identity-3'?assessContractVersions:
     r.evidence.methodology==='contract-identity-2'?assessContractPublicationGroup:assessContractIdentity;
   const checked=assess(source,source.flatMap(m=>byNotice.get(m.noticeId)??[]));
   if(r.fingerprint!==expected.get(String(r.id))||checked.fingerprint!==r.fingerprint||checked.status!=='source_verified')throw Error(`Evidence changed: ${r.id}`);
   for(const m of source)if(!isDeepStrictEqual(live.get(m.id)?.identity,m))throw Error(`Current contract differs from verified evidence: ${m.publicId}`);
   return {r,source,checked};
 });
 // An archive supplied from a pinned backup may prove a legacy type absent in
 // raw_documents. Store that verified projection BEFORE taking member hashes.
 // Nothing changes the original amount/title or the archived response.
 const types=checkedRegistry.flatMap(g=>g.checked.proofs.flatMap(p=>typeof p.contractType==='number'&&Number.isInteger(p.contractType)
   ? [{public_id:String(p.contract),kind:p.contractType}]:[]));
 // Written only when a row still lacks its type: any statement on core.contracts,
 // even one changing nothing, changes the source version and voids the run's
 // snapshot hash memo (SnapshotHashCache).
 if(types.length&&(await q`select 1 from core.contracts c join jsonb_to_recordset(${JSON.stringify(types)}::jsonb) proof(public_id bigint,kind integer)
   on c.ca_notice_contract_id=proof.public_id where c.source_contract_type is null limit 1`).length)
  await q`update core.contracts c set source_contract_type=proof.kind,contract_type_raw_id=c.raw_id
   from jsonb_to_recordset(${JSON.stringify(types)}::jsonb) proof(public_id bigint,kind integer)
   where c.ca_notice_contract_id=proof.public_id and c.source_contract_type is null`;
 current=await readContractIdentityMembers(q,ids);live=new Map(current.map(r=>[String(r.identity.id),r]));
 const approvals:{candidate_id:string;fingerprint:string;canonical_contract_id:string;reason:string}[]=[];
 const members:{contract_id:string;candidate_id:string;snapshot_hash:string}[]=[];
 for(const {r,source,checked} of checkedRegistry){
   // Eligibility before ID order: never discard the sole eligible publication.
   const ranked=[...source].sort((a,b)=>Number(live.get(b.id)!.eligible)-Number(live.get(a.id)!.eligible)||(BigInt(a.id)<BigInt(b.id)?-1:1));
   const chosen=checked.methodology==='contract-identity-3'?source.find(m=>m.publicId===checked.latestPublicId)!:ranked[0]!;
   approvals.push({candidate_id:String(r.id),fingerprint:String(r.fingerprint),canonical_contract_id:chosen.id,reason});
   for(const m of source)members.push({contract_id:m.id,candidate_id:String(r.id),snapshot_hash:String(live.get(m.id)!.snapshot_hash)});
 }
 for(let i=0;i<approvals.length;i+=100)await q`insert into marts.contract_identity_decisions(candidate_id,fingerprint,canonical_contract_id,reason)
   select candidate_id,fingerprint,canonical_contract_id,reason from jsonb_to_recordset(${JSON.stringify(approvals.slice(i,i+100))}::jsonb)
    x(candidate_id text,fingerprint text,canonical_contract_id bigint,reason text) on conflict(candidate_id) do nothing`;
 for(let i=0;i<members.length;i+=200)await q`insert into marts.contract_identity_members(contract_id,candidate_id,snapshot_hash)
   select contract_id,candidate_id,snapshot_hash from jsonb_to_recordset(${JSON.stringify(members.slice(i,i+200))}::jsonb)
    x(contract_id bigint,candidate_id text,snapshot_hash text) on conflict(contract_id) do nothing`;
 return {approvedGroups:approvals.length,sourcePublications:members.length};
}

export type ApprovalBatch={selected:{id:string;fingerprint:string}[];archives:ArchivedAward[]};
/** One transaction and one final quality gate across bounded evidence batches.
 * The caller owns the transaction; an error rolls back every staged approval.
 * `identityHashes`: the processing run's snapshot hash memo for both quality gates. */
export async function approveContractIdentityBatches(q:DbSql,batches:Iterable<ApprovalBatch>|AsyncIterable<ApprovalBatch>,reason:string,identityHashes?:SnapshotHashCache) {
 if(!reason.trim())throw Error('A reason is required');
 await assertContractIdentityQuality(q,identityHashes);
 const result={approvedGroups:0,sourcePublications:0};
 const seen=new Set<string>();
 for await(const batch of batches){
  for(const s of batch.selected){
   if(seen.has(s.id))throw Error('A decision appears in multiple approval batches');
   seen.add(s.id);
  }
  const saved=await stageApprovals(q,batch.selected,batch.archives,reason);
  result.approvedGroups+=saved.approvedGroups;result.sourcePublications+=saved.sourcePublications;
 }
 await assertContractIdentityQuality(q,identityHashes);
 return result;
}
export async function approveContractIdentities(q:DbSql,selected:{id:string;fingerprint:string}[],archives:ArchivedAward[],reason:string){
 return approveContractIdentityBatches(q,[{selected,archives}],reason);
}
