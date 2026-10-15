import {runCoverage} from './coverage.js';
import {afterAll,describe,it,expect} from 'vitest';
import {createDb,type DbSql,readContractIdentityQuality,readContractIdentityMembers,claimProcessing,CONTRACT_REPORTING_VERSION,canonicalContract,assertContractExclusionsQuality} from '@seap/db';
import {seedVerifiedIdentity} from '../test/contract-identity-fixture.js';
import {discoverAndApproveContractIdentities,AUTOMATIC_IDENTITY_REASON} from './discover-contract-identities.js';
import {prepareApprovedRevalidation} from './revalidate-contract-identities.js';
import {approveContractIdentityBatches} from './approve-contract-identities.js';
const isolated=new URL(process.env.DATABASE_URL??'postgres://invalid/').pathname==='/seap_test_currency_reporting_20261011';
const {sql}=createDb();afterAll(()=>sql.end());
function scoped(q:DbSql,prefix:string):DbSql {
 const rewrite=(s:string)=>s.replace(/\b(core|raw|app|marts)\./g,`${prefix}_$1.`);
 const f=((parts:TemplateStringsArray,...values:unknown[])=>{
  if(typeof parts==='string')return q(parts);
  const mapped=parts.map(rewrite);Object.defineProperty(mapped,'raw',{value:parts.raw.map(rewrite)});
  return q(mapped as unknown as TemplateStringsArray,...values as never[]);
 }) as unknown as DbSql;
 Object.assign(f,{begin:(first:unknown,last?:unknown)=>(q as any).savepoint((tx:DbSql)=>(typeof first==='function'?first:last as (tx:DbSql)=>Promise<unknown>)(scoped(tx,prefix)))});
 return f;
}
describe.skipIf(!isolated)('automatic publication discovery inside the production gates',()=>{
 it('releases verified converted/foreign contracts once, preserves the source, and detects changed foreign evidence',async()=>{
  const rollback=Error('foreign identity fixture rollback');
  await expect(sql.begin(async tx=>{
   const prefix=`foreign_identity_${process.pid}`;
   for(const [schema,tables] of Object.entries({app:['processing_runs','collection_control','collection_audit','data_repairs'],
    core:['contracts','awards','entities','contract_winners'],raw:['raw_documents'],
    marts:['contract_identity_revisions','contract_identity_exclusions','contract_identity_archives','contract_identity_candidates','contract_identity_observations','contract_identity_decisions','contract_identity_members']})){
    await tx.unsafe(`create schema ${prefix}_${schema}`);
    for(const table of tables)await tx.unsafe(`create table ${prefix}_${schema}.${table} (like ${schema}.${table} including all)`);
   }
   const q=scoped(tx as unknown as DbSql,prefix),{archives,assessed}=await seedVerifiedIdentity(q);
   // The additional projection must not invalidate the approved Romanian data.
   expect((await readContractIdentityQuality(q)).valid).toBe(true);
   expect((await readContractIdentityMembers(q,['1']))[0]!.identity).toEqual(assessed.members[0]);
   await q`delete from marts.contract_identity_members`;await q`delete from marts.contract_identity_decisions`;
   await q`delete from marts.contract_identity_observations`;await q`delete from marts.contract_identity_candidates`;
   await q`update core.entities set cui_canonical=null,cui_valid=false,is_foreign=true,country_code='NL',foreign_id_norm='NL817417813B01' where id=10`;
   await q`update core.contracts set currency='EUR',original_currency='EUR',original_value=20,value_ron=100,currency_rate=5,
    amount_status='converted',amount_raw_id=raw_id,amount_evidence='{"version":1}'`;
   for(let i=0;i<archives.length;i++){
    const a=archives[i]!;
    if(a.endpoint==='award-contracts:v1')Object.assign(a.payload.items[0],{contractValue:20,defaultCurrencyContractValue:100,currencyRate:5,currency:{text:'EUR'},winner:{fiscalNumber:'NL 817417813B01',address:{countryItem:{localeKey:'NL'}}}});
    await q`insert into raw.raw_documents(id,source,external_id,endpoint_version,content_hash,payload)
     values(${i+1},'elicitatie',${'award:'+a.payload.caNoticeId},${a.endpoint},${a.hash},${JSON.stringify(a.payload)}::jsonb)`;
   }
   const run='00000000-0000-4000-8000-000000009995';
   await q`insert into app.collection_control(id,paused,maintenance,revision) values(1,true,true,7)`;
   await q`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
    values(${run}::uuid,'2026-10-12','full',7,'{}','100','identity-repair','{"backup":{"completedAt":"ok"},"backup-verified":{"completedAt":"ok"},"normalize":{"completedAt":"ok"}}')`;
   await q`update raw.raw_documents set payload=jsonb_set(payload,'{items,0,winner,address,countryItem,localeKey}','"BE"') where id=4`;
   expect(await discoverAndApproveContractIdentities(q,run)).toMatchObject({approvedGroups:0,excludedGroups:1});
   await q`update raw.raw_documents set payload=jsonb_set(payload,'{items,0,winner,address,countryItem,localeKey}','"NL"') where id=4`;
   expect(await discoverAndApproveContractIdentities(q,run)).toMatchObject({approvedGroups:1,excludedGroups:0});
   expect(await discoverAndApproveContractIdentities(q,run)).toMatchObject({approvedGroups:0,excludedGroups:0});
   expect(await q`select id from core.contracts c where ${canonicalContract(q)}`).toHaveLength(1);
   expect(await q`select id from core.contracts where original_value=20 and value_ron=100 and currency='EUR'`).toHaveLength(2);
   expect((await readContractIdentityQuality(q)).valid).toBe(true);
   const future=await prepareApprovedRevalidation(q,{version:1,groups:[],archives:[],expected:{groups:0,duplicates:0,reductionRon:'0'}},'100');
   expect(future.groups).toHaveLength(1);
   await q`update core.entities set foreign_id_norm='NL817417813B02' where id=10`;
   expect((await readContractIdentityQuality(q)).staleMembers).toBe(2);
   await expect(discoverAndApproveContractIdentities(q,run)).rejects.toThrow('identity changed');
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('requests one full baseline after a population policy change, then returns to the ordinary daily schedule',async()=>{
  const rollback=Error('policy schedule rollback');
  await expect(sql.begin(async tx=>{
   const prefix=`reporting_schedule_${process.pid}`;
   await tx.unsafe(`create schema ${prefix}_app`);
   for(const table of ['collection_control','collection_workers','processing_runs','collection_audit','monitoring_refreshes'])
    await tx.unsafe(`create table ${prefix}_app.${table} (like app.${table} including all)`);
   const q=scoped(tx as unknown as DbSql,prefix);
   await q`insert into app.collection_control(id,processing_enabled,processing_enabled_at,processing_time,risk_weekday,revision)
     values(1,true,'2026-10-01T00:00:00Z','05:00',0,1)`;
   await q`insert into app.monitoring_refreshes(kind,status,methodology,completed_at) values('coordinated','ready','{}',clock_timestamp())`;
   expect(await claimProcessing(q,new Date('2026-10-12T02:05:00Z'))).toMatchObject({scope:'full'});
   await q`update app.processing_runs set status='ready',completed_at=clock_timestamp()`;
   await q`update app.collection_control set maintenance=false,paused=false`;
   await q`insert into app.monitoring_refreshes(kind,status,methodology,completed_at)
     values('coordinated','ready',${JSON.stringify({contractReporting:CONTRACT_REPORTING_VERSION})}::jsonb,clock_timestamp())`;
   expect(await claimProcessing(q,new Date('2026-10-13T02:05:00Z'))).toMatchObject({scope:'daily'});
   const rows=await q`select after->>'reportingChanged' changed from app.collection_audit order by id`;
   expect(rows.map(r=>r.changed)).toEqual(['true','false']);
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('requires backup/freeze, quarantines missing source proof, approves once and can revalidate outside the historical bundle',async()=>{
  const rollback=Error('discovery rollback');
  await expect(sql.begin(async tx=>{
   const prefix=`discovery_${process.pid}`;
   for(const [schema,tables] of Object.entries({app:['processing_runs','collection_control','collection_audit','data_repairs'],
     core:['contracts','awards','entities','contract_winners','direct_acquisitions','ted_notices','ted_lot_results'],raw:['raw_documents'],
     marts:['data_coverage','contract_transactions','da_transactions','contract_identity_revisions','contract_identity_exclusions','contract_identity_archives','contract_identity_candidates','contract_identity_observations','contract_identity_decisions','contract_identity_members']})) {
    await tx.unsafe(`create schema ${prefix}_${schema}`);
    for(const table of tables)await tx.unsafe(`create table ${prefix}_${schema}.${table} (like ${schema}.${table} including all)`);
   }
   const q=scoped(tx as unknown as DbSql,prefix),{archives}=await seedVerifiedIdentity(q);
   await q`delete from marts.contract_identity_members`;await q`delete from marts.contract_identity_decisions`;
   const selected=await q`select id,fingerprint from marts.contract_identity_candidates`;
   // The first batch is valid; a bad second batch must undo every earlier
   // approval, including the type projection written from historical proofs.
   const batches=[{selected:selected.map(r=>({id:String(r.id),fingerprint:String(r.fingerprint)})),archives},
    {selected:[{id:'missing',fingerprint:'missing'}],archives}];
   await expect(q.begin(inner=>approveContractIdentityBatches(inner as unknown as DbSql,batches,'test:atomic'))).rejects.toThrow('unverified');
   expect(await q`select * from marts.contract_identity_decisions`).toHaveLength(0);
   expect(await q`select * from marts.contract_identity_members`).toHaveLength(0);
   await expect(q.begin(inner=>approveContractIdentityBatches(inner as unknown as DbSql,[batches[0]!,batches[0]!],'test:duplicate'))).rejects.toThrow('multiple approval batches');
   expect(await q`select * from marts.contract_identity_decisions`).toHaveLength(0);
   await q`delete from marts.contract_identity_observations`;await q`delete from marts.contract_identity_candidates`;
   for(let i=0;i<archives.length;i++){
    const a=archives[i]!;
    await q`insert into raw.raw_documents(id,source,external_id,endpoint_version,content_hash,payload)
      values(${i+1},'elicitatie',${'award:'+a.payload.caNoticeId},${a.endpoint},${a.hash},${JSON.stringify(a.payload)}::jsonb)`;
   }
   const run='00000000-0000-4000-8000-000000009998';
   await q`insert into app.collection_control(id,paused,maintenance,revision) values(1,true,true,7)`;
   await q`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
     values(${run}::uuid,'2026-10-11','full',7,'{}','100','identity-repair','{"backup":{"completedAt":"ok"},"backup-verified":{"completedAt":"ok"},"normalize":{"completedAt":"ok"}}')`;
   await q`update app.collection_control set maintenance=false`;
   await expect(discoverAndApproveContractIdentities(q,run)).rejects.toThrow('maintenance');
   await q`update app.collection_control set maintenance=true`;
   await q`delete from raw.raw_documents where id=4`;
   expect(await discoverAndApproveContractIdentities(q,run)).toMatchObject({approvedGroups:0,excludedGroups:1,excludedPublications:2});
   expect(await q`select id from core.contracts c where ${canonicalContract(q)}`).toHaveLength(0);
   expect(await q`select id from core.contracts`).toHaveLength(2);
   await runCoverage(q);
   expect((await q`select observation from marts.data_coverage where dataset='contracts'`)[0]!.observation)
     .toMatchObject({temporarily_excluded_groups:'1',temporarily_excluded_publications:'2',included:'0'});
   expect(await assertContractExclusionsQuality(q)).toMatchObject({valid:true,excludedPublications:2});
   const [count]=await q`select count(*)::int n from marts.contract_identity_revisions`;
   await discoverAndApproveContractIdentities(q,run);
   expect((await q`select count(*)::int n from marts.contract_identity_revisions`)[0]!.n).toBe(count!.n);
   // A changed member cannot silently leave its pending group and reenter totals.
   await q`update core.contracts set contract_no='unrelated' where id=2`;
   expect(await discoverAndApproveContractIdentities(q,run)).toMatchObject({approvedGroups:0,excludedGroups:1,excludedPublications:2});
   expect(await q`select id from core.contracts c where ${canonicalContract(q)}`).toHaveLength(0);
   expect(await assertContractExclusionsQuality(q)).toMatchObject({valid:true});
   await expect(q.begin(async inner=>{
     const iq=inner as unknown as DbSql;
     await iq`delete from marts.contract_identity_observations where fingerprint=(select evidence->>'previousObservation' from marts.contract_identity_candidates limit 1)`;
     await assertContractExclusionsQuality(iq);
   })).rejects.toThrow('invalid groups');
   const [changed]=await q`select count(*)::int n from marts.contract_identity_revisions`;
   await discoverAndApproveContractIdentities(q,run);
   expect((await q`select count(*)::int n from marts.contract_identity_revisions`)[0]!.n).toBe(changed!.n);
   await q`update core.contracts set contract_no='C/1' where id=2`;
   expect(await q`select * from marts.contract_identity_decisions`).toHaveLength(0);
   const a=archives[3]!;
   // The recovered response exists only in the immutable evidence store.
   // Both first approval and future revalidation must be able to read it.
   await q`insert into marts.contract_identity_archives(archive_key,bundle_sha256,external_id,source,original_raw_id,endpoint,content_hash,payload)
     values('test-recovered',${'a'.repeat(64)},${'award:'+a.payload.caNoticeId},${a.source},${a.rawId},${a.endpoint},${a.hash},${JSON.stringify(a.payload)}::jsonb)`;
   expect(await discoverAndApproveContractIdentities(q,run)).toMatchObject({approvedGroups:1,sourcePublications:2});
   expect(await discoverAndApproveContractIdentities(q,run)).toMatchObject({approvedGroups:0,sourcePublications:0});
   expect((await q`select reason from marts.contract_identity_decisions`)[0]!.reason).toBe(AUTOMATIC_IDENTITY_REASON);
   expect((await readContractIdentityQuality(q)).valid).toBe(true);
   expect(await q`select * from marts.contract_identity_exclusions`).toHaveLength(0);
   expect(await q`select id from core.contracts c where ${canonicalContract(q)}`).toHaveLength(1);
   expect(await q`select * from marts.contract_identity_revisions`).toHaveLength(3);
   // Future nightly revalidation must accept this source-proved origin; it was
   // not one of the 8,045 historical pairs in the October 4 evidence bundle.
   const prepared=await prepareApprovedRevalidation(q,{version:1,groups:[],archives:[],expected:{groups:0,duplicates:0,reductionRon:'0'}},'100');
   expect(prepared.groups).toHaveLength(1);
   throw rollback;
  })).rejects.toBe(rollback);
 });
});
