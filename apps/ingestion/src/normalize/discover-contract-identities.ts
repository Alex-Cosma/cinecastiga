import {createHash} from 'node:crypto';
import { readRecoveredIdentityArchives } from './contract-identity-archives.js';
import { assertContractIdentityQuality, assertContractExclusionsQuality, readContractIdentityMembers, type DbSql } from '@seap/db';
import { assessContractPublicationGroup, assessContractVersions, contractIdentitySignature, contractVersionAnchor, type ArchivedAward, type IdentityContract } from './contract-identity.js';
import { approveContractIdentityBatches } from './approve-contract-identities.js';
import { IDENTITY_REPAIR_ID, loadIdentityRepairBundle } from './scheduled-contract-identity.js';

export const AUTOMATIC_IDENTITY_REASON = 'system:source-verified-publications-v1';

/** Same contract number/date under a repeated official notice is a candidate,
 * never proof. Partition coexisting lots/orders before checking source archives.
 * Deliberately does not conflate a separately numbered addendum with its base. */
export function discoverPublicationGroups(members: IdentityContract[], archives: ArchivedAward[], approved:ReadonlySet<string>=new Set()) {
  const anchors = new Map<string, IdentityContract[]>();
  for (const m of members) {
    if (!m.number?.trim() || !m.date || !m.noticeNo) continue;
    const key=contractVersionAnchor(m);
    anchors.set(key,[...(anchors.get(key)??[]),m]);
  }
  const byNotice=new Map<string,ArchivedAward[]>();
  for (const a of archives) {
    const key=String(a.payload.caNoticeId);
    byNotice.set(key,[...(byNotice.get(key)??[]),a]);
  }
  return [...anchors.values()].flatMap(group=>{
    if (new Set(group.map(m=>m.noticeId)).size<2) return [];
    const signatures=new Map<string,IdentityContract[]>();
    for (const m of group) {
      const key=contractIdentitySignature(m);
      signatures.set(key,[...(signatures.get(key)??[]),m]);
    }
    // More than one distinct contract in a publication cannot be interpreted as
    // successive versions. Only independently identical sibling chains qualify.
    const coexisting=new Set(group.map(m=>m.noticeId)).size!==group.length;
    const ambiguousSibling=coexisting&&[...signatures.values()].some(g=>new Set(g.map(m=>m.noticeId)).size<2);
    const groups=coexisting&&!ambiguousSibling?[...signatures.values()]:[group];
    return groups.filter(g=>!g.some(m=>approved.has(m.id))).map(g=>{
      const revised=new Set(g.map(contractIdentitySignature)).size>1;
      return (revised?assessContractVersions:assessContractPublicationGroup)(g,
        [...new Set(g.map(m=>m.noticeId))].flatMap(id=>byNotice.get(id)??[]));
    });
  });
}

/** Read-only first; reusable for rehearsal. Default scans all repeated notices,
 * so an old unapproved duplicate is not missed by a new ingestion watermark.
 * Caller can scope official notice numbers for a bounded investigation. */
export async function prepareNewContractIdentities(q: DbSql, boundary: string, noticeNumbers?: string[],
  supplemental: ArchivedAward[] | ((externalIds:string[])=>Promise<ArchivedAward[]>) = [], retainArchives = true, log:(message:string)=>void=()=>{}) {
  const notices=noticeNumbers ?? (await q`select a.notice_no from core.awards a
    where a.notice_no is not null group by a.notice_no having count(*)>1 order by a.notice_no`).map(r=>String(r.notice_no));
  const approved=new Set((await q`select contract_id::text from marts.contract_identity_members`).map(r=>String(r.contract_id)));
  const groups:ReturnType<typeof discoverPublicationGroups>=[];
  const archives:ArchivedAward[]=[];
  const eligible=new Set<string>();
  for(let i=0;i<notices.length;i+=100) {
    const ids=await q`select c.id::text from core.awards a join core.contracts c using(ca_notice_id)
      where a.notice_no=any(${notices.slice(i,i+100)}::text[]) and (c.raw_id is null or c.raw_id<=${boundary}::bigint)`;
    const rows=await readContractIdentityMembers(q,ids.map(r=>String(r.id)));
    for(const row of rows)if(row.eligible)eligible.add(String(row.identity.id));
    // An approved lineage is handled by the existing full revalidation; a new
    // group must never take any of its members away.
    const candidates=rows.map(r=>r.identity as IdentityContract);
    const external=[...new Set(candidates.map(m=>'award:'+m.noticeId))];
    const raw=await q`select id::text,content_hash,endpoint_version,payload from raw.raw_documents
      where source='elicitatie' and external_id=any(${external}::text[])
        and endpoint_version in ('award-list:v1','award-contracts:v1') and id<=${boundary}::bigint`;
    const extra=typeof supplemental==='function'?await supplemental(external):supplemental.filter(a=>external.includes('award:'+String(a.payload.caNoticeId)));
    const recovered=await readRecoveredIdentityArchives(q,external);
    const batch=[...extra,...recovered,
      ...raw.map(r=>({source:'production-current',rawId:String(r.id),hash:String(r.content_hash),endpoint:String(r.endpoint_version),payload:r.payload}))];
    const found=discoverPublicationGroups(candidates,batch,approved);
    groups.push(...found);
    if(i%500===0)log(`Identity sources: ${Math.min(i+100,notices.length)}/${notices.length} repeated notices checked`);
    const used=new Set(found.filter(g=>g.status==='source_verified').flatMap(g=>g.members.map(m=>m.noticeId)));
    if(retainArchives)archives.push(...batch.filter(a=>used.has(String(a.payload.caNoticeId))));
  }
  const blocked=groups.filter(g=>g.status!=='source_verified'&&g.members.some(m=>eligible.has(m.id)));
  return {groups,archives,blocked};
}

/** Called inside frozen publication only. A source mismatch cannot silently
 * publish a doubled sum; unprovable non-additive records remain review leads. */
export async function discoverAndApproveContractIdentities(q: DbSql, runId: string, log:(message:string)=>void=()=>{}) {
  return q.begin(async tx=>{
    const sql=tx as unknown as DbSql;
    const [run]=await sql`select r.*,c.maintenance,c.paused,c.revision from app.processing_runs r cross join app.collection_control c
      where r.id=${runId}::uuid and c.id=1 for update of r,c`;
    if(!run||run.status!=='running'||!run.maintenance||!run.paused||run.revision!==run.control_revision||run.stage!=='identity-repair'
      ||!run.raw_boundary||!run.stages?.backup?.completedAt||!run.stages?.['backup-verified']?.completedAt||!run.stages?.normalize?.completedAt)
      throw Error('New identity discovery requires backed-up, normalized maintenance with unchanged operator control');
    await assertContractIdentityQuality(sql);
    const boundary=String(run.raw_boundary);
    const [repair]=await sql`select status,report from app.data_repairs where id=${IDENTITY_REPAIR_ID}`;
    const config=repair?.report?.configuration;
    const supplemental=repair?.status==='completed'&&config?.path&&config?.sha256
      ? (await loadIdentityRepairBundle(config.path,config.sha256)).archives : [];
    // Keep only assessments between batches, not the entire national archive in
    // worker memory. Evidence is reread in bounded batches under the same freeze.
    const prepared=await prepareNewContractIdentities(sql,boundary,undefined,supplemental,false,log);
    const previousExclusions=await sql`select * from marts.contract_identity_exclusions order by contract_id`;
    // An uncertain group may cease matching its old anchor after a source
    // correction. Keep its unmatched members under explicit review with their
    // CURRENT state; uncertainty alone must not stop the whole publication.
    // Never release them just because today's candidate search did not find it.
    const assigned=new Set(prepared.groups.flatMap(g=>g.members.map(m=>m.id)));
    const approvedIds=new Set((await sql`select contract_id::text from marts.contract_identity_members`).map(r=>String(r.contract_id)));
    const retained=previousExclusions.filter(r=>!assigned.has(String(r.contract_id))&&!approvedIds.has(String(r.contract_id)));
    for(const candidate of new Set(retained.map(r=>String(r.candidate_id)))){
      const retainedIds=retained.filter(r=>r.candidate_id===candidate).map(r=>String(r.contract_id));
      const rows=await readContractIdentityMembers(sql,retainedIds);
      if(rows.length!==retainedIds.length)throw Error('An excluded source record disappeared; restore or explicitly reconcile it before publication');
      const [previous]=await sql`select evidence from marts.contract_identity_candidates where id=${candidate}`;
      if(!previous)throw Error('Exclusion origin disappeared');
      const members=rows.map(r=>r.identity as IdentityContract);
      const origin=previous.evidence.previousObservation??previous.evidence.fingerprint;
      const base=assessContractPublicationGroup(members,[]);
      // This is a retained unresolved relationship, not an assertion that the
      // archives are missing or proof that these records are duplicates.
      const review={...base,status:'needs_evidence' as const,proofs:[],
        reasons:['identity_relationship_unresolved'],previousObservation:origin,
        methodology:'contract-identity-review-1',
        fingerprint:createHash('sha256').update(JSON.stringify(['retained-review-v1',base.fingerprint,origin])).digest('hex')};
      prepared.groups.push(review);
    }
    for(let i=0;i<prepared.groups.length;i+=200) {
      const batch=prepared.groups.slice(i,i+200).map(g=>({id:g.id,fingerprint:g.fingerprint,status:g.status,evidence:g}));
      await sql`insert into marts.contract_identity_candidates(id,fingerprint,status,evidence,active)
        select id,fingerprint,status,evidence,true from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
          x(id text,fingerprint text,status text,evidence jsonb)
        on conflict(id) do update set fingerprint=excluded.fingerprint,status=excluded.status,evidence=excluded.evidence,active=true,observed_at=clock_timestamp()`;
      await sql`insert into marts.contract_identity_observations(fingerprint,candidate_id,evidence)
        select fingerprint,id,evidence from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
          x(id text,fingerprint text,evidence jsonb) on conflict(fingerprint) do nothing`;
    }
    const verified=prepared.groups.filter(g=>g.status==='source_verified');
    async function* batches(){
    for(let i=0;i<verified.length;i+=100){
      const selected=verified.slice(i,i+100);
      const external=[...new Set(selected.flatMap(g=>g.members.map(m=>'award:'+m.noticeId)))];
      const raw=await sql`select id::text,content_hash,endpoint_version,payload from raw.raw_documents
        where source='elicitatie' and external_id=any(${external}::text[])
          and endpoint_version in ('award-list:v1','award-contracts:v1') and id<=${boundary}::bigint`;
      const archives=[...supplemental.filter(a=>external.includes('award:'+String(a.payload.caNoticeId))),...await readRecoveredIdentityArchives(sql,external),
        ...raw.map(r=>({source:'production-current',rawId:String(r.id),hash:String(r.content_hash),endpoint:String(r.endpoint_version),payload:r.payload}))];
      yield {selected,archives};
      if(i%2000===0)log(`Identity approvals: ${Math.min(i+100,verified.length)}/${verified.length} groups staged`);
    }
    }
    const result=await approveContractIdentityBatches(sql,batches(),AUTOMATIC_IDENTITY_REASON);
    // Approval is the only automatic way out. A candidate disappearing or
    // changing its anchor must never silently release a previous exclusion.
    await sql`delete from marts.contract_identity_exclusions x using marts.contract_identity_members m
      where m.contract_id=x.contract_id`;
    const pending=prepared.groups.filter(g=>g.status!=='source_verified');
    const ids=pending.flatMap(g=>g.members.map(m=>m.id));
    if(new Set(ids).size!==ids.length)throw Error('Overlapping uncertain identity groups');
    const current=await readContractIdentityMembers(sql,ids);
    const eligibleIds=new Set(current.filter(r=>r.eligible).map(r=>String(r.identity.id)));
    const hashes=new Map(current.map(r=>[String(r.identity.id),String(r.snapshot_hash)]));
    for(let i=0;i<pending.length;i+=200){
      const rows=pending.slice(i,i+200).flatMap(g=>g.members.map(m=>({contract_id:m.id,candidate_id:g.id,
        fingerprint:g.fingerprint,snapshot_hash:hashes.get(m.id)})));
      await sql`insert into marts.contract_identity_exclusions(contract_id,candidate_id,fingerprint,snapshot_hash,processing_run_id)
        select contract_id,candidate_id,fingerprint,snapshot_hash,${runId}::uuid
        from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) x(contract_id bigint,candidate_id text,fingerprint text,snapshot_hash text)
        on conflict(contract_id) do update set candidate_id=excluded.candidate_id,fingerprint=excluded.fingerprint,
          snapshot_hash=excluded.snapshot_hash,processing_run_id=excluded.processing_run_id,reviewed_at=clock_timestamp()`;
    }
    const quality=await assertContractExclusionsQuality(sql);
    const exclusions=await sql`select * from marts.contract_identity_exclusions order by contract_id`;
    const before=new Map(previousExclusions.map(r=>[String(r.contract_id),r]));
    const after=new Map(exclusions.map(r=>[String(r.contract_id),r]));
    const changes=[...new Set([...before.keys(),...after.keys()])].filter(id=>{
      const a=before.get(id),b=after.get(id);
      return a?.fingerprint!==b?.fingerprint||a?.snapshot_hash!==b?.snapshot_hash;
    });
    // Store transitions against the original candidate as immutable revisions,
    // including releases and regrouping, while preserving all observations.
    const changedGroups=[...new Set(changes.map(id=>String(before.get(id)?.candidate_id??after.get(id)!.candidate_id)))];
    for(const candidate of changedGroups){
      await sql`insert into marts.contract_identity_revisions(candidate_id,processing_run_id,previous_snapshot,next_snapshot)
        values(${candidate},${runId}::uuid,
          ${JSON.stringify({exclusions:previousExclusions.filter(r=>r.candidate_id===candidate)})}::jsonb,
          ${JSON.stringify({exclusions:exclusions.filter(r=>r.candidate_id===candidate),policy:'temporary-exclusion-v1'})}::jsonb)`;
    }
    const report={...result,...quality,excludedGroups:new Set(exclusions.map(r=>r.candidate_id)).size,
      uncertainFinancialGroups:pending.filter(g=>g.members.some(m=>eligibleIds.has(m.id))).length};
    await sql`insert into app.collection_audit(actor_id,actor_name,action,before,after)
      values('system:processor','Verificarea publicațiilor noi','identity-discovery',
        ${JSON.stringify({excludedPublications:previousExclusions.length})}::jsonb,${JSON.stringify({runId,...report})}::jsonb)`;
    return report;
  });
}
