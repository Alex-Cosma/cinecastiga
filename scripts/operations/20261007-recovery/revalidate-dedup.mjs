// Explicit source re-verification for this incident, never an automatic hash reset.
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {readContractIdentityMembers,readContractIdentityQuality} from '/app/packages/db/dist/index.js';
import {loadIdentityRepairBundle,prepareIdentityRepair} from '/app/apps/ingestion/dist/normalize/scheduled-contract-identity.js';
export async function revalidateDedup(sql,{audit=true}={}){
 const bundle=await loadIdentityRepairBundle('/repairs/dq02-20261004/approved-bundle.json.gz','c3a570b5ad4638778183c77b2e0a7385a3467ae6c22af1e012afd22151621596');
 return sql.begin(async q=>{
  await q`set local statement_timeout='180s'`;
  const before=await readContractIdentityQuality(q);
  if(before.members!==16090||before.invalidDecisions)throw Error('Unexpected approved registry');
  const prepared=await prepareIdentityRepair(q,bundle,'17561343');
  if(prepared.groups.length!==8045||prepared.impact.duplicates!==7300||prepared.impact.reduction_ron!=='7100577914.82')throw Error('Deduplication impact changed');
  const stored=await q`select c.id,c.evidence,d.canonical_contract_id::text keeper from marts.contract_identity_candidates c join marts.contract_identity_decisions d on d.candidate_id=c.id order by c.id for update of c,d`;
  const proven=new Map(prepared.groups.map(g=>[g.id,g]));
  const oldHashes=await q`select contract_id::text id,snapshot_hash hash from marts.contract_identity_members order by contract_id for update`;
  const current=await readContractIdentityMembers(q,oldHashes.map(r=>r.id));
  const live=new Map(current.map(r=>[String(r.identity.id),r]));
  for(const group of stored){
   const checked=proven.get(group.id);
   if(!checked||!isDeepStrictEqual(checked.members,group.evidence.members))throw Error('Approved public identity changed');
   const ranked=[...checked.members].sort((a,b)=>Number(live.get(b.id).eligible)-Number(live.get(a.id).eligible)||(BigInt(a.id)<BigInt(b.id)?-1:1));
   if(ranked[0].id!==group.keeper)throw Error('Canonical publication choice changed');
  }
  const hashes=current.map(r=>({id:String(r.identity.id),hash:r.snapshot_hash}));
  await q`update marts.contract_identity_members m set snapshot_hash=x.hash from jsonb_to_recordset(${JSON.stringify(hashes)}::jsonb) x(id bigint,hash text) where m.contract_id=x.id`;
  const after=await readContractIdentityQuality(q);
  if(!after.valid)throw Error('Reverified registry does not validate');
  let evidence;
  if(audit){
   const payload=JSON.stringify({oldHashes,newHashes:hashes},null,2);
   const file='/reports/approved-dedup-hashes.json';
   await writeFile(file,payload,{mode:0o600,flag:'wx'});
   evidence={file:'approved-dedup-hashes.json',sha256:createHash('sha256').update(payload).digest('hex')};
  }
  if(audit)await q`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('ops:recovery-20261007','Reverificare din dovezile originale','identity-revalidation',${JSON.stringify({quality:before,evidence})}::jsonb,${JSON.stringify({quality:after,evidence,groups:8045,impact:prepared.impact,decisionsChanged:0,reason:'Each original approved identity and canonical choice reverified against the frozen evidence bundle and current available archives; no blanket approval or removed guard'})}::jsonb)`;
  return {before,after,groups:8045,impact:prepared.impact,decisionsChanged:0};
 });
}
