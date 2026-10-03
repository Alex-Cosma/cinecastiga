import {isDeepStrictEqual} from 'node:util';
import {assertContractIdentityQuality,readContractIdentityMembers,type DbSql} from '@seap/db';
import {assessContractIdentity,type ArchivedAward,type IdentityContract} from './contract-identity.js';

/** Caller holds the publication/writer gate and a transaction. Only explicitly
 * selected evidence fingerprints can be approved; never fuzzy/blanket merging. */
export async function approveContractIdentities(q:DbSql, selected:{id:string;fingerprint:string}[], archives:ArchivedAward[],reason:string) {
 if(!reason.trim()||new Set(selected.map(s=>s.id)).size!==selected.length)throw Error('Unique explicit decisions and a reason are required');
 await assertContractIdentityQuality(q);
 const registry=await q`select id,fingerprint,evidence from marts.contract_identity_candidates
   where active and status='source_verified' and id=any(${selected.map(s=>s.id)}::text[]) for update`;
 if(registry.length!==selected.length)throw Error('Selected decisions include unverified or inactive candidates');
 const expected=new Map(selected.map(s=>[s.id,s.fingerprint]));
 const byNotice=new Map<string,ArchivedAward[]>();
 for(const a of archives){const id=String(a.payload.caNoticeId);byNotice.set(id,[...(byNotice.get(id)??[]),a]);}
 const ids=registry.flatMap(r=>r.evidence.members.map((m:IdentityContract)=>m.id));
 if(new Set(ids).size!==ids.length)throw Error('A publication belongs to multiple selected identities');
 const current=await readContractIdentityMembers(q,ids);
 const live=new Map(current.map(r=>[String(r.identity.id),r]));
 const approvals:{candidate_id:string;fingerprint:string;canonical_contract_id:string;reason:string}[]=[];
 const members:{contract_id:string;candidate_id:string;snapshot_hash:string}[]=[];
 for(const r of registry){
   const source=r.evidence.members as IdentityContract[];
   const checked=assessContractIdentity(source,source.flatMap(m=>byNotice.get(m.noticeId)??[]));
   if(r.fingerprint!==expected.get(String(r.id))||checked.fingerprint!==r.fingerprint||checked.status!=='source_verified')throw Error(`Evidence changed: ${r.id}`);
   for(const m of source)if(!isDeepStrictEqual(live.get(m.id)?.identity,m))throw Error(`Current contract differs from verified evidence: ${m.publicId}`);
   // Eligibility before ID order: never discard the sole eligible publication.
   const ranked=[...source].sort((a,b)=>Number(live.get(b.id)!.eligible)-Number(live.get(a.id)!.eligible)||(BigInt(a.id)<BigInt(b.id)?-1:1));
   approvals.push({candidate_id:String(r.id),fingerprint:String(r.fingerprint),canonical_contract_id:ranked[0]!.id,reason});
   for(const m of source)members.push({contract_id:m.id,candidate_id:String(r.id),snapshot_hash:String(live.get(m.id)!.snapshot_hash)});
 }
 for(let i=0;i<approvals.length;i+=100)await q`insert into marts.contract_identity_decisions(candidate_id,fingerprint,canonical_contract_id,reason)
   select candidate_id,fingerprint,canonical_contract_id,reason from jsonb_to_recordset(${JSON.stringify(approvals.slice(i,i+100))}::jsonb)
    x(candidate_id text,fingerprint text,canonical_contract_id bigint,reason text) on conflict(candidate_id) do nothing`;
 for(let i=0;i<members.length;i+=200)await q`insert into marts.contract_identity_members(contract_id,candidate_id,snapshot_hash)
   select contract_id,candidate_id,snapshot_hash from jsonb_to_recordset(${JSON.stringify(members.slice(i,i+200))}::jsonb)
    x(contract_id bigint,candidate_id text,snapshot_hash text) on conflict(contract_id) do nothing`;
 await assertContractIdentityQuality(q);
 return {approvedGroups:approvals.length,sourcePublications:members.length};
}
