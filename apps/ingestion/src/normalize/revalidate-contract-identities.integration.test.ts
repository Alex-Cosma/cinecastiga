import {afterAll,describe,expect,it} from 'vitest';
import {createDb,currentSnapshotHashes,readContractIdentityMembers,readContractIdentityQuality,type DbSql} from '@seap/db';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {seedVerifiedIdentity} from '../test/contract-identity-fixture.js';
import {revalidateApprovedContractIdentities,verifyApprovedPublications} from './revalidate-contract-identities.js';
import {discoverAndApproveContractIdentities,revokedIdentityHolds} from './discover-contract-identities.js';
const isolated=new URL(process.env.DATABASE_URL??'postgres://invalid/').pathname.startsWith('/seap_test_currency_');
const {sql}=createDb();afterAll(()=>sql.end({timeout:5}));
function scoped(q:DbSql,prefix:string):DbSql {
 const rewrite=(s:string)=>s.replace(/\b(core|raw|app|marts)\./g,`${prefix}_$1.`);
 const f=((parts:TemplateStringsArray,...values:unknown[])=>{if(typeof parts==='string')return q(parts);const mapped=parts.map(rewrite);Object.defineProperty(mapped,'raw',{value:parts.raw.map(rewrite)});return q(mapped as unknown as TemplateStringsArray,...values as never[]);}) as unknown as DbSql;
 Object.assign(f,{begin:(fn:(tx:DbSql)=>Promise<unknown>)=>(q as any).savepoint((tx:DbSql)=>fn(scoped(tx,prefix)))});return f;
}
describe.skipIf(!isolated)('backed-up publication evidence revalidation',()=>{
 it('extends only approved identities, retains canonical/source/history, fails closed and is idempotent',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'seap-revalidation-')),path=join(dir,'bundle.gz'),rollback=Error('rollback');
  try{await expect(sql.begin(async tx=>{
   const prefix=`revalidation_${process.pid}`;
   for(const [schema,tables] of Object.entries({app:['data_repairs','processing_runs','collection_control','collection_audit'],core:['contracts','awards','entities','contract_winners'],raw:['raw_documents'],marts:['contract_identity_exclusions','contract_identity_archives','contract_identity_members','contract_identity_decisions','contract_identity_candidates','contract_identity_observations','contract_identity_revisions']})){
    await tx.unsafe(`create schema ${prefix}_${schema}`);
    for(const table of tables)await tx.unsafe(`create table ${prefix}_${schema}.${table} (like ${schema}.${table} including all)`);
   }
   const q=scoped(tx as unknown as DbSql,prefix),{assessed,archives}=await seedVerifiedIdentity(q);
   const bytes=gzipSync(JSON.stringify({version:1,groups:[assessed],archives,expected:{groups:1,duplicates:1,reductionRon:'100'}}));
   await writeFile(path,bytes);const sha=createHash('sha256').update(bytes).digest('hex');
   const run='00000000-0000-4000-8000-000000009999';
   await q`insert into app.collection_control(id,paused,maintenance,revision,blocked_reason) values(1,true,true,3,'pagination remains blocked')`;
   await q`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
    values(${run}::uuid,'2026-10-11','full',3,'{}','100','identity-repair','{"backup":{"completedAt":"2026-10-10T02:10:00Z"},"backup-verified":{"completedAt":"2026-10-10T02:11:00Z"},"normalize":{"completedAt":"2026-10-10T02:12:00Z"}}')`;
   await q`insert into app.data_repairs(id,scheduled_day,status,report) values('contract-publication-identity-v1','2026-10-04','completed',${JSON.stringify({configuration:{path,sha256:sha}})}::jsonb)`;
   // A third publication is never accepted by a hash reset alone.
   await q`insert into core.awards(id,raw_id,ca_notice_id,notice_no,authority_entity_id,cpv_code,procedure_type,acquisition_type)
    select 3,30,300,notice_no,authority_entity_id,cpv_code,procedure_type,acquisition_type from core.awards where id=1`;
   await q`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title,lots_caption,cpv_code)
    select 3,31,103,300,contract_no,contract_date,contract_value,currency,title,lots_caption,cpv_code from core.contracts where id=1`;
   await q`insert into core.contract_winners(contract_id,entity_id) values(3,10)`;
   expect((await readContractIdentityQuality(q)).valid).toBe(false);
   // Chunked hashes equal one read: cohorts span every publication of the notice number.
   const single=await readContractIdentityMembers(q,['1','2','3']);
   expect(await currentSnapshotHashes(q,['1','2','3'],1)).toEqual(new Map(single.map(r=>[String(r.identity.id),String(r.snapshot_hash)])));
   await expect(revalidateApprovedContractIdentities(q,run)).rejects.toThrow('missing_archive');
   expect((await q`select count(*)::int n from marts.contract_identity_revisions`)[0]!.n).toBe(0);
   const third=structuredClone(archives.slice(2));
   third[0]!.payload.caNoticeId=300;third[0]!.payload.noticeStateDate='2026-10-03T10:00:00+03:00';third[1]!.payload.caNoticeId=300;
   Object.assign(third[1]!.payload.items[0],{caNoticeId:300,caNoticeContractId:103});
   for(let i=0;i<third.length;i++)await q`insert into raw.raw_documents(id,source,external_id,endpoint_version,content_hash,payload)
    values(${30+i},'elicitatie','award:300',${third[i]!.endpoint},${'third-'+i},${JSON.stringify(third[i]!.payload)}::jsonb)`;
   for(const change of ['value','supplier','canonical']){
    await expect(q.begin(async nested=>{
     if(change==='value')await nested`update core.contracts set contract_value=101 where id=1`;
     if(change==='supplier')await nested`update core.entities set cui_canonical='391391' where id=10`;
     if(change==='canonical')await nested`update core.contracts set title='Acord-cadru' where id=1`;
     await revalidateApprovedContractIdentities(nested as unknown as DbSql,run);
    })).rejects.toThrow('Approved economic identity changed');
   }
   await expect(q.begin(async nested=>{
    await nested`update core.contracts set contract_value=110 where id=3`;
    await revalidateApprovedContractIdentities(nested as unknown as DbSql,run);
   })).rejects.toThrow('archive_disagrees_with_core');
   await expect(q.begin(async nested=>{
    await nested`update raw.raw_documents set payload=jsonb_set(payload,'{procedureId}','999') where id=30`;
    await revalidateApprovedContractIdentities(nested as unknown as DbSql,run);
   })).rejects.toThrow('different_procedures');
   await expect(q.begin(async nested=>{
    await nested`update raw.raw_documents set payload=jsonb_set(payload,'{items,0,conditions}','{"changed":true}') where id=31`;
    await revalidateApprovedContractIdentities(nested as unknown as DbSql,run);
   })).rejects.toThrow('different_source_conditions');
   for(const field of ['paused','revision','stage','backup'])await expect(q.begin(async nested=>{
    if(field==='paused')await nested`update app.collection_control set paused=false`;
    if(field==='revision')await nested`update app.collection_control set revision=4`;
    if(field==='stage')await nested`update app.processing_runs set stage='normalize'`;
    if(field==='backup')await nested`update app.processing_runs set stages='{}'`;
    await revalidateApprovedContractIdentities(nested as unknown as DbSql,run);
   })).rejects.toThrow('backed-up');
   const report=await revalidateApprovedContractIdentities(q,run);
   expect(report.changedGroups).toBe(1);expect(report.quality.valid).toBe(true);
   expect((await q`select canonical_contract_id::text id from marts.contract_identity_decisions`)[0]!.id).toBe('1');
   expect((await q`select count(*)::int n from core.contracts`)[0]!.n).toBe(3);
   expect((await q`select count(*)::int n from marts.contract_identity_observations`)[0]!.n).toBe(2);
   expect((await q`select count(*)::int n from marts.contract_identity_revisions`)[0]!.n).toBe(1);
   expect((await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason).toBe('pagination remains blocked');
   expect((await revalidateApprovedContractIdentities(q,run)).changedGroups).toBe(0);
   // A later identical re-import changes a raw pointer, not economic identity.
   await q`update core.contracts set raw_id=99 where id=3`;
   const pointer=await revalidateApprovedContractIdentities(q,run);
   expect(pointer).toMatchObject({changedGroups:1,mode:'full',staleGroups:1,changedOutsideTargets:0});
   expect((await q`select count(*)::int n from marts.contract_identity_revisions`)[0]!.n).toBe(2);
   // Membership read back in text order ('10' < '9') is not a change.
   const [revision]=await q`select previous_snapshot->'members' before,next_snapshot->'members' after from marts.contract_identity_revisions order by id desc limit 1`;
   expect(revision!.before.map((m:{contract_id:string})=>m.contract_id)).toEqual(revision!.after.map((m:{contract_id:string})=>m.contract_id));
   // After a clean full baseline under the same rules, a daily run re-verifies only
   // groups with a changed member.
   await q`update app.processing_runs set scope='daily'`;
   await q`update core.contracts set raw_id=98 where id=3`;
   expect(await revalidateApprovedContractIdentities(q,run)).toMatchObject({changedGroups:1,mode:'targeted',staleGroups:1});
   expect((await q`select count(*)::int n from marts.contract_identity_revisions`)[0]!.n).toBe(3);
   // A rule change, or a full pass that found changes outside the stale groups, forces full again.
   await q`update core.contracts set raw_id=97 where id=3`;
   await expect(q.begin(async nested=>{
    await nested`update app.collection_audit set after=jsonb_set(after,'{rules}','"older-rules"') where after->>'mode'='full'`;
    expect((await revalidateApprovedContractIdentities(nested as unknown as DbSql,run)).mode).toBe('full');
    throw rollback;
   })).rejects.toBe(rollback);
   await expect(q.begin(async nested=>{
    await nested`update app.collection_audit set after=jsonb_set(after,'{changedOutsideTargets}','2') where after->>'mode'='full'`;
    expect((await revalidateApprovedContractIdentities(nested as unknown as DbSql,run)).mode).toBe('full');
    throw rollback;
   })).rejects.toBe(rollback);
   expect((await revalidateApprovedContractIdentities(q,run)).mode).toBe('targeted');
   await q`update app.processing_runs set scope='full'`;
   // Only the scheduled risk day (Sunday, 2026-10-11) re-verifies everything; a full run on another
   // day (archive collection during maintenance) or a manual recovery stays targeted.
   for(const [day,trigger,mode] of [['2026-10-10','scheduled','targeted'],['2026-10-11','manual','targeted'],['2026-10-11','scheduled','full']] as const)await expect(q.begin(async nested=>{
    await nested`update core.contracts set raw_id=96 where id=3`;
    await nested`update app.processing_runs set scheduled_day=${day}::date,trigger=${trigger}`;
    expect(await revalidateApprovedContractIdentities(nested as unknown as DbSql,run)).toMatchObject({changedGroups:1,mode});
    throw rollback;
   })).rejects.toBe(rollback);
   // Same-publication duplication remains ambiguous; new unrelated contracts stay unapproved.
   const members=await readContractIdentityMembers(q,['1','2','3']);
   const registry=await q`select c.*,to_jsonb(d) decision from marts.contract_identity_candidates c join marts.contract_identity_decisions d on d.candidate_id=c.id`;
   expect(()=>verifyApprovedPublications(registry as any,[...members,{...members[2],identity:{...members[2]!.identity,id:'4',publicId:'104'}}] as any,[...archives,...third])).toThrow('ambiguous_multiplicity');
   // A source-dated amendment contributes its latest amount once and preserves
   // every older publication/decision. The count is corroboration, not an ID.
   await q`insert into core.awards(id,raw_id,ca_notice_id,notice_no,authority_entity_id,cpv_code,procedure_type,acquisition_type)
    select 4,40,400,notice_no,authority_entity_id,cpv_code,procedure_type,acquisition_type from core.awards where id=1`;
   await q`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title,lots_caption,cpv_code)
    select 4,41,104,400,contract_no,contract_date,110,currency,title,lots_caption,cpv_code from core.contracts where id=1`;
   await q`insert into core.contract_winners(contract_id,entity_id) values(4,10)`;
   const fourth=structuredClone(third);fourth[0]!.payload.caNoticeId=400;fourth[0]!.payload.noticeStateDate='2026-10-04T10:00:00+03:00';
   fourth[1]!.payload.caNoticeId=400;Object.assign(fourth[1]!.payload.items[0],{caNoticeId:400,caNoticeContractId:104,contractValue:110,defaultCurrencyContractValue:110,hasModifiedVersions:true,modifiedCount:1});
   for(let i=0;i<fourth.length;i++)await q`insert into raw.raw_documents(id,source,external_id,endpoint_version,content_hash,payload)
    values(${40+i},'elicitatie','award:400',${fourth[i]!.endpoint},${'fourth-'+i},${JSON.stringify(fourth[i]!.payload)}::jsonb)`;
   // A targeted pass still rejects a new member already held by a group it does not re-verify.
   await expect(q.begin(async nested=>{
    await nested`update app.processing_runs set scope='daily'`;
    const current=(await currentSnapshotHashes(nested as unknown as DbSql,['4'])).get('4');
    await nested`insert into marts.contract_identity_members(contract_id,candidate_id,snapshot_hash) values(4,'another-approved-group',${current!})`;
    await revalidateApprovedContractIdentities(nested as unknown as DbSql,run);
   })).rejects.toThrow('Overlapping approved groups');
   // Owner decision 2026-10-12: an unflagged amount-only change is accepted and
   // recorded; a changed title without amendment wording still needs proof.
   const unflagged=Error('unflagged accepted');
   await expect(q.begin(async nested=>{
    await nested`update raw.raw_documents set payload=jsonb_set(payload,'{items,0,hasModifiedVersions}','false') where id=41`;
    expect((await revalidateApprovedContractIdentities(nested as unknown as DbSql,run)).quality.valid).toBe(true);
    throw unflagged;
   })).rejects.toBe(unflagged);
   await expect(q.begin(async nested=>{
    await nested`update raw.raw_documents set payload=jsonb_set(jsonb_set(payload,'{items,0,hasModifiedVersions}','false'),'{items,0,contractTitle}','"Contract nr. 9"') where id=41`;
    await nested`update core.contracts set title='Contract nr. 9' where id=4`;
    await revalidateApprovedContractIdentities(nested as unknown as DbSql,run);
   })).rejects.toThrow('missing_amendment_evidence');
   // Owner decision 2026-10-18: under a ceiling, a group that no longer verifies loses its
   // approval and its publications are excluded, instead of stopping publication. Discovery
   // does not approve them again under the same rules; a rule change releases the hold.
   const isolated=Error('isolated');
   await expect(q.begin(async tx=>{
    const n=tx as unknown as DbSql;
    const [original]=await n`select payload from raw.raw_documents where id=41`;
    await n`update raw.raw_documents set payload=jsonb_set(jsonb_set(payload,'{items,0,hasModifiedVersions}','false'),'{items,0,contractTitle}','"Contract nr. 9"') where id=41`;
    await n`update core.contracts set title='Contract nr. 9' where id=4`;
    const report=await revalidateApprovedContractIdentities(n,run,()=>{},1);
    expect(report.quality.valid).toBe(true);
    expect(report).toMatchObject({revoked:[{publications:3,reason:expect.stringContaining('missing_amendment_evidence')}]});
    expect((await n`select count(*)::int n from marts.contract_identity_decisions`)[0]!.n).toBe(0);
    expect((await n`select count(*)::int n from marts.contract_identity_members`)[0]!.n).toBe(0);
    expect((await n`select status from marts.contract_identity_candidates`).map(r=>r.status)).toEqual(['conflict']);
    expect((await n`select next_snapshot->>'revoked' revoked from marts.contract_identity_revisions order by id desc limit 1`)[0]!.revoked).toBe('true');
    expect(await revokedIdentityHolds(n)).toEqual([expect.objectContaining({contracts:['1','2','3']})]);
    const excluded=async()=>(await n`select contract_id::text id from marts.contract_identity_exclusions order by contract_id`).map(r=>r.id);
    await discoverAndApproveContractIdentities(n,run);
    expect(await excluded()).toEqual(['1','2','3','4']);
    // The source corrected again: same evidence that was approved before, still held.
    await n`update raw.raw_documents set payload=${JSON.stringify(original!.payload)}::jsonb where id=41`;
    await n`update core.contracts set title=(select title from core.contracts where id=1) where id=4`;
    await discoverAndApproveContractIdentities(n,run);
    expect(await excluded()).toEqual(['1','2','3','4']);
    expect((await n`select count(*)::int n from marts.contract_identity_decisions`)[0]!.n).toBe(0);
    await n`update app.collection_audit set after=jsonb_set(after,'{rules}','"older-rules"') where action='identity-revoked'`;
    await discoverAndApproveContractIdentities(n,run);
    expect(await excluded()).toEqual([]);
    expect((await n`select count(*)::int n from marts.contract_identity_members`)[0]!.n).toBe(4);
    throw isolated;
   })).rejects.toBe(isolated);
   await expect(q.begin(async nested=>{
    await nested`update raw.raw_documents set payload=jsonb_set(payload,'{noticeStateDate}','"2026-10-03T10:00:00+03:00"') where id=40`;
    await revalidateApprovedContractIdentities(nested as unknown as DbSql,run);
   })).rejects.toThrow('ambiguous_version_order');
   expect((await revalidateApprovedContractIdentities(q,run)).quality.valid).toBe(true);
   expect((await q`select canonical_contract_id::text id from marts.contract_identity_decisions`)[0]!.id).toBe('4');
   expect((await q`select count(*)::int n from marts.contract_identity_members`)[0]!.n).toBe(4);
   expect((await q`select previous_snapshot->'decision'->>'canonical_contract_id' old from marts.contract_identity_revisions order by id desc limit 1`)[0]!.old).toBe('1');
   expect((await revalidateApprovedContractIdentities(q,run)).changedGroups).toBe(0);
   throw rollback;
  })).rejects.toBe(rollback);}finally{await rm(dir,{recursive:true,force:true});}
 },60_000);
});
