import {afterAll,describe,expect,it} from 'vitest';
import {createDb,readContractIdentityMembers,readContractIdentityQuality,type DbSql} from '@seap/db';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {seedVerifiedIdentity} from '../test/contract-identity-fixture.js';
import {revalidateApprovedContractIdentities,verifyApprovedPublications} from './revalidate-contract-identities.js';
const isolated=new URL(process.env.DATABASE_URL??'postgres://invalid/').pathname.startsWith('/seap_test_currency_');
const {sql}=createDb();afterAll(()=>sql.end({timeout:5}));
function scoped(q:DbSql,prefix:string):DbSql {
 const rewrite=(s:string)=>s.replace(/\b(core|raw|app|marts)\./g,`${prefix}_$1.`);
 const f=((parts:TemplateStringsArray,...values:unknown[])=>{const mapped=parts.map(rewrite);Object.defineProperty(mapped,'raw',{value:parts.raw.map(rewrite)});return q(mapped as unknown as TemplateStringsArray,...values as never[]);}) as unknown as DbSql;
 Object.assign(f,{begin:(fn:(tx:DbSql)=>Promise<unknown>)=>(q as any).savepoint((tx:DbSql)=>fn(scoped(tx,prefix)))});return f;
}
describe.skipIf(!isolated)('backed-up publication evidence revalidation',()=>{
 it('extends only approved identities, retains canonical/source/history, fails closed and is idempotent',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'seap-revalidation-')),path=join(dir,'bundle.gz'),rollback=Error('rollback');
  try{await expect(sql.begin(async tx=>{
   const prefix=`revalidation_${process.pid}`;
   for(const [schema,tables] of Object.entries({app:['data_repairs','processing_runs','collection_control','collection_audit'],core:['contracts','awards','entities','contract_winners'],raw:['raw_documents'],marts:['contract_identity_members','contract_identity_decisions','contract_identity_candidates','contract_identity_observations','contract_identity_revisions']})){
    await tx.unsafe(`create schema ${prefix}_${schema}`);
    for(const table of tables)await tx.unsafe(`create table ${prefix}_${schema}.${table} (like ${schema}.${table} including all)`);
   }
   const q=scoped(tx as unknown as DbSql,prefix),{assessed,archives}=await seedVerifiedIdentity(q);
   const bytes=gzipSync(JSON.stringify({version:1,groups:[assessed],archives,expected:{groups:1,duplicates:1,reductionRon:'100'}}));
   await writeFile(path,bytes);const sha=createHash('sha256').update(bytes).digest('hex');
   const run='00000000-0000-4000-8000-000000009999';
   await q`insert into app.collection_control(id,paused,maintenance,revision,blocked_reason) values(1,true,true,3,'pagination remains blocked')`;
   await q`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
    values(${run}::uuid,'2026-10-10','full',3,'{}','100','identity-repair','{"backup":{"completedAt":"2026-10-10T02:10:00Z"},"backup-verified":{"completedAt":"2026-10-10T02:11:00Z"},"normalize":{"completedAt":"2026-10-10T02:12:00Z"}}')`;
   await q`insert into app.data_repairs(id,scheduled_day,status,report) values('contract-publication-identity-v1','2026-10-04','completed',${JSON.stringify({configuration:{path,sha256:sha}})}::jsonb)`;
   // A third publication is never accepted by a hash reset alone.
   await q`insert into core.awards(id,raw_id,ca_notice_id,notice_no,authority_entity_id,cpv_code,procedure_type,acquisition_type)
    select 3,30,300,notice_no,authority_entity_id,cpv_code,procedure_type,acquisition_type from core.awards where id=1`;
   await q`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title,lots_caption,cpv_code)
    select 3,31,103,300,contract_no,contract_date,contract_value,currency,title,lots_caption,cpv_code from core.contracts where id=1`;
   await q`insert into core.contract_winners(contract_id,entity_id) values(3,10)`;
   expect((await readContractIdentityQuality(q)).valid).toBe(false);
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
   expect((await revalidateApprovedContractIdentities(q,run)).changedGroups).toBe(1);
   expect((await q`select count(*)::int n from marts.contract_identity_revisions`)[0]!.n).toBe(2);
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
   await expect(q.begin(async nested=>{
    await nested`update raw.raw_documents set payload=jsonb_set(payload,'{items,0,hasModifiedVersions}','false') where id=41`;
    await revalidateApprovedContractIdentities(nested as unknown as DbSql,run);
   })).rejects.toThrow('missing_amendment_evidence');
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
