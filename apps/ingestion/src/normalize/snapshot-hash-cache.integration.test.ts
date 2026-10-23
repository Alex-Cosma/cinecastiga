import {afterAll,describe,expect,it} from 'vitest';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {assertContractExclusionsQuality,assertContractIdentityQuality,createDb,createSnapshotHashCache,currentSnapshotHashes,
 readContractIdentityMembers,readContractIdentityQuality,snapshotHashSourceToken,verifyContractIdentityQuality,type DbSql,type SnapshotHashCache} from '@seap/db';
import {seedVerifiedIdentity} from '../test/contract-identity-fixture.js';
import type {ArchivedAward,IdentityContract} from './contract-identity.js';
import {revalidateApprovedContractIdentities} from './revalidate-contract-identities.js';
import {discoverAndApproveContractIdentities} from './discover-contract-identities.js';

// The memo is never used by a transaction that has itself written a source
// relation, so these fixtures must COMMIT. They run only on a dedicated,
// migrated (0083) seap_test_ident_* database and empty its identity tables.
const url=process.env['TEST_DATABASE_URL'];
const dedicated=!!url&&/^\/seap_test_ident_[a-z0-9_]+$/.test(new URL(url).pathname);
const run='00000000-0000-4000-8000-000000009983';
/** Rows without clock values: decisions and exclusions embedded in revisions carry their write times. */
const rows=(list:readonly object[])=>JSON.parse(JSON.stringify(list,(key,value)=>/_at$/.test(key)?undefined:value)) as object[];

describe.skipIf(!dedicated)('snapshot hashes computed once per processing run',()=>{
 const {sql}=createDb(url);
 const other=createDb(url).sql;
 afterAll(async()=>{await sql.end({timeout:5});await other.end({timeout:5});});

 async function reset() {
  await sql.begin(async tx=>{
   await tx`set local client_min_messages=warning`;
   await tx`truncate core.contract_winners,core.contracts,core.awards,core.entities,raw.raw_documents,
    marts.contract_identity_members,marts.contract_identity_decisions,marts.contract_identity_exclusions,marts.contract_identity_revisions,
    marts.contract_identity_observations,marts.contract_identity_candidates,marts.contract_identity_archives,
    app.collection_audit,app.data_repairs,app.processing_runs,app.collection_control restart identity cascade`;
  });
 }
 /** Same archive shape as the shared fixture, for any publication of the test authority and supplier. */
 function archivesFor(c:IdentityContract,stateDate:string,procedureId:number):ArchivedAward[] {
  return [{source:'fixture',rawId:c.noticeId,hash:'notice-'+c.noticeId,endpoint:'award-list:v1',payload:{caNoticeId:Number(c.noticeId),noticeStateDate:stateDate,noticeNo:c.noticeNo,procedureId,
    cpvCodeAndName:'45000000-7 - Lucrari',sysProcedureType:{text:'Licitatie'},sysAcquisitionContractType:{text:'Lucrari'},sysNoticeState:{text:'Publicat'},contractingAuthorityNameAndFN:'4278337 - Autoritate'}},
   {source:'fixture',rawId:c.publicId,hash:'contract-'+c.publicId,endpoint:'award-contracts:v1',payload:{caNoticeId:Number(c.noticeId),items:[{caNoticeId:Number(c.noticeId),noticeNo:c.noticeNo,
    caNoticeContractId:Number(c.publicId),contractNo:c.number,contractDate:'2026-07-06T00:00:00+03:00',contractValue:100,defaultCurrencyContractValue:100,currency:{text:'RON'},
    contractTitle:c.title,lotsCaption:c.lots,winner:{fiscalNumber:'RO15219174'},contractType:1,conditions:{hasCompetitionResumeSection:true}}]}}];
 }
 async function storeRaw(id:number,a:ArchivedAward) {
  await sql`insert into raw.raw_documents(id,source,external_id,endpoint_version,content_hash,payload)
   values(${id},'elicitatie',${'award:'+a.payload.caNoticeId},${a.endpoint},${'raw-'+id},${JSON.stringify(a.payload)}::jsonb)`;
 }
 /** `typed`: the source contract type is already stored (most current rows), so
  * approval writes nothing to core.contracts; otherwise approval stores it. */
 async function publication(award:number,notice:number,noticeNo:string,contract:number,number:string,typed:boolean) {
  await sql`insert into core.awards(id,raw_id,ca_notice_id,notice_no,authority_entity_id,cpv_code,procedure_type,acquisition_type)
   values(${award},${award},${notice},${noticeNo},1,'45000000-7','Licitatie','Lucrari')`;
  await sql`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title,lots_caption,cpv_code,
    source_contract_type,contract_type_raw_id)
   values(${contract},${contract},${notice*10+contract},${notice},${number},'2026-07-06T00:00:00+03:00',100,'RON','Contract lucrari','Lot 1','45000000-7',
    ${typed?1:null},${typed?contract:null})`;
  await sql`insert into core.contract_winners(contract_id,entity_id) values(${contract},10)`;
 }
 /** An approved two-publication identity with a third publication to extend it,
  * a new verifiable repeated notice for discovery, and an unproven one that
  * discovery must keep out of totals. Committed, like a frozen processing run. */
 async function seed(dir:string,typed:boolean) {
  await reset();
  await sql`insert into core.cpv_codes(code,name_ro,revision,division) values('45000000-7','Lucrari de constructii','2008','45') on conflict do nothing`;
  const {assessed,archives}=await seedVerifiedIdentity(sql,{indexes:false});
  const bytes=gzipSync(JSON.stringify({version:1,groups:[assessed],archives,expected:{groups:1,duplicates:1,reductionRon:'100'}}));
  const path=join(dir,'bundle.gz');await writeFile(path,bytes);
  await sql`insert into app.collection_control(id,paused,maintenance,revision) values(1,true,true,3)`;
  await sql`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
   values(${run}::uuid,'2026-10-11','full',3,'{}','100','identity-repair','{"backup":{"completedAt":"2026-10-10T02:10:00Z"},"backup-verified":{"completedAt":"2026-10-10T02:11:00Z"},"normalize":{"completedAt":"2026-10-10T02:12:00Z"}}')`;
  await sql`insert into app.data_repairs(id,scheduled_day,status,report) values('contract-publication-identity-v1','2026-10-04','completed',
   ${JSON.stringify({configuration:{path,sha256:createHash('sha256').update(bytes).digest('hex')}})}::jsonb)`;
  // Third publication of the approved contract (same procedure): revalidation extends the group.
  await sql`insert into core.awards(id,raw_id,ca_notice_id,notice_no,authority_entity_id,cpv_code,procedure_type,acquisition_type)
   select 3,30,300,notice_no,authority_entity_id,cpv_code,procedure_type,acquisition_type from core.awards where id=1`;
  await sql`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title,lots_caption,cpv_code)
   select 3,31,103,300,contract_no,contract_date,contract_value,currency,title,lots_caption,cpv_code from core.contracts where id=1`;
  await sql`insert into core.contract_winners(contract_id,entity_id) values(3,10)`;
  const [third]=await readContractIdentityMembers(sql,['3']);
  for(const [i,a] of archivesFor(third!.identity as IdentityContract,'2026-10-03T10:00:00+03:00',55).entries())await storeRaw(30+i,a);
  // A new repeated notice whose archives prove one contract: discovery approves it.
  await publication(5,500,'CAN-new',5,'C/2',typed);await publication(6,600,'CAN-new',6,'C/2',typed);
  for(const m of await readContractIdentityMembers(sql,['5','6'])){
   const c=m.identity as IdentityContract;
   for(const [i,a] of archivesFor(c,c.noticeId==='500'?'2026-10-05T10:00:00+03:00':'2026-10-06T10:00:00+03:00',77).entries())await storeRaw(Number(c.id)*10+i,a);
  }
  // A repeated notice without archives: excluded from totals until proven.
  await publication(7,700,'CAN-unproven',7,'C/3',typed);await publication(8,800,'CAN-unproven',8,'C/3',typed);
 }
 async function registry() {
  return {
   members:rows(await sql`select contract_id::text,candidate_id,snapshot_hash from marts.contract_identity_members order by contract_id`),
   decisions:rows(await sql`select candidate_id,fingerprint,canonical_contract_id::text,reason from marts.contract_identity_decisions order by candidate_id`),
   candidates:rows(await sql`select id,fingerprint,status,active,evidence from marts.contract_identity_candidates order by id`),
   observations:rows(await sql`select fingerprint,candidate_id,evidence from marts.contract_identity_observations order by fingerprint`),
   exclusions:rows(await sql`select contract_id::text,candidate_id,fingerprint,snapshot_hash,processing_run_id::text from marts.contract_identity_exclusions order by contract_id`),
   revisions:rows(await sql`select id::text,candidate_id,processing_run_id::text,previous_snapshot,next_snapshot from marts.contract_identity_revisions order by id`),
   audit:rows(await sql`select id::text,actor_id,action,before,after from app.collection_audit order by id`),
  };
 }
 const outcome=(work:Promise<unknown>)=>work.then(value=>({value}),(error:Error)=>({error:error.message}));
 /** The identity stages of one processing run, in production order, with two writers between uses. */
 async function processingRun(typed:boolean,cache?:SnapshotHashCache) {
  const dir=await mkdtemp(join(tmpdir(),'seap-identity-hashes-'));
  try {
   await seed(dir,typed);
   const steps:Record<string,unknown>={};
   steps['revalidation']=await outcome(revalidateApprovedContractIdentities(sql,run,()=>{},25,cache));
   steps['discovery']=await outcome(discoverAndApproveContractIdentities(sql,run,()=>{},cache));
   steps['identityQuality']=await outcome((async()=>({identities:await assertContractIdentityQuality(sql,cache),exclusions:await assertContractExclusionsQuality(sql,cache)}))());
   steps['reconcileGate']=await outcome(assertContractIdentityQuality(sql,cache));
   // A writer that rolls back: its own transaction sees the change; afterwards nothing changed.
   const rolledBack=Error('rolled back');
   await expect(sql.begin(async tx=>{
    const t=tx as unknown as DbSql;
    await t`update core.awards set procedure_type='Negociere' where id=5`;
    steps['insideWriter']=await readContractIdentityQuality(t,cache);
    throw rolledBack;
   })).rejects.toBe(rolledBack);
   steps['martsGate']=await outcome((async()=>({identities:await assertContractIdentityQuality(sql,cache),exclusions:await assertContractExclusionsQuality(sql,cache)}))());
   // A committed writer changes an approved member between two uses.
   await other`update core.contracts set title='Contract lucrari si proiectare' where id=6`;
   steps['afterWriter']=await readContractIdentityQuality(sql,cache);
   steps['gateAfterWriter']=await outcome(assertContractIdentityQuality(sql,cache));
   steps['revalidationAfterWriter']=await outcome(revalidateApprovedContractIdentities(sql,run,()=>{},25,cache));
   steps['exclusionsAfterRevocation']=await outcome(assertContractExclusionsQuality(sql,cache));
   steps['discoveryAfterRevocation']=await outcome(discoverAndApproveContractIdentities(sql,run,()=>{},cache));
   const validation=cache?await verifyContractIdentityQuality(sql,cache):await readContractIdentityQuality(sql);
   const {hashCache,...report}=validation as typeof validation&{hashCache?:{compared:number;mismatches:number}};
   steps['validation']=report;
   return {steps,registry:await registry(),hashCache};
  } finally {await rm(dir,{recursive:true,force:true});}
 }

 it.each([[true],[false]])('gives identical revalidation, discovery, approval and quality results with and without the memo (contract types stored: %s)',async typed=>{
  const without=await processingRun(typed);
  const cache=createSnapshotHashCache('equivalence');
  const withMemo=await processingRun(typed,cache);
  // The fixture exercises every branch it is meant to: an extension, a new
  // approval, an exclusion, a stale member, a revocation.
  expect(without.steps['revalidation']).toMatchObject({value:{changedGroups:1,extendedGroups:1}});
  expect(without.steps['discovery']).toMatchObject({value:{approvedGroups:1,excludedPublications:2}});
  expect(without.steps['identityQuality']).toMatchObject({value:{identities:{valid:true,members:5}}});
  expect(without.steps['insideWriter']).toMatchObject({valid:false,staleMembers:1,examples:['5']});
  expect(without.steps['afterWriter']).toMatchObject({valid:false,staleMembers:1,examples:['6']});
  expect(without.steps['gateAfterWriter']).toMatchObject({error:expect.stringContaining('1 source members')});
  expect(without.steps['revalidationAfterWriter']).toMatchObject({value:{revoked:[expect.objectContaining({publications:2})]}});
  expect(without.steps['validation']).toMatchObject({valid:true,members:3});
  expect(withMemo.steps).toEqual(without.steps);
  expect(withMemo.registry).toEqual(without.registry);
  // The memo was really used, invalidated by the committed writer, bypassed
  // inside each writing transaction (the rolled-back writer and, without stored
  // types, discovery's own type update), and agreed with the final fresh pass.
  expect(cache.stats.reused).toBeGreaterThan(cache.stats.computed);
  expect(cache.stats.invalidated).toBeGreaterThanOrEqual(1);
  expect(cache.stats.bypassed).toBe(typed?1:3);
  expect(withMemo.hashCache).toMatchObject({mismatches:0,compared:3});
 });

 it('reuses hashes only while every source relation is unchanged and fails closed otherwise',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'seap-identity-hashes-'));
  try{await seed(dir,false);}finally{await rm(dir,{recursive:true,force:true});}
  const ids=['1','2','3','5','6','7','8','999999'];
  const cache=createSnapshotHashCache('mechanics');
  const fresh=async()=>currentSnapshotHashes(sql,ids);
  expect(await currentSnapshotHashes(sql,ids,3,cache)).toEqual(await fresh());
  expect(cache.stats).toMatchObject({computed:8,reused:0});
  expect(await currentSnapshotHashes(sql,ids,3,cache)).toEqual(await fresh());
  expect(cache.stats).toMatchObject({computed:8,reused:8});
  expect((await fresh()).has('999999')).toBe(false);

  // Every kind of write to every relation the hashes read changes the token,
  // including statements that change no row.
  const writes:[string,()=>Promise<unknown>][]=[
   ['contracts update',()=>other`update core.contracts set title=title where id=1`],
   ['awards no-op update',()=>other`update core.awards set title=title where false`],
   ['winners delete',()=>other`delete from core.contract_winners where contract_id=-1`],
   ['entities insert',()=>other`insert into core.entities(id,name_display,name_normalized) values(77,'Alta','alta')`],
   ['entities delete',()=>other`delete from core.entities where id=77`],
   ['winners truncate (rolled back)',()=>other.begin(async t=>{await t`truncate core.contract_winners`;throw Error('undo');}).catch(()=>null)],
  ];
  for(const [name,write] of writes){
   const before=await snapshotHashSourceToken(sql);
   await write();
   const after=await snapshotHashSourceToken(sql);
   if(name.includes('rolled back'))expect(after,name).toBe(before);else expect(after,name).not.toBe(before);
  }
  // After a committed write the memo is emptied and recomputed: same as fresh.
  await other`update core.contracts set contract_value=150 where id=5`;
  expect(await currentSnapshotHashes(sql,ids,3,cache)).toEqual(await fresh());
  expect(cache.stats).toMatchObject({invalidated:1,computed:16});

  // Inside a transaction that wrote a source relation the memo is bypassed (and
  // its later writes would not change the version); after rollback it is valid again.
  const token=await snapshotHashSourceToken(sql);
  const undo=Error('undo');
  await expect(sql.begin(async tx=>{
   const t=tx as unknown as DbSql;
   await t`update core.contracts set contract_value=200 where id=5`;
   expect(await snapshotHashSourceToken(t)).toBeNull();
   const inside=await currentSnapshotHashes(t,ids,3,cache);
   expect(inside).toEqual(await currentSnapshotHashes(t,ids));
   expect(inside.get('5')).not.toBe((await fresh()).get('5'));
   await t`update core.contracts set contract_value=300 where id=5`;
   expect(await currentSnapshotHashes(t,ids,3,cache)).toEqual(await currentSnapshotHashes(t,ids));
   throw undo;
  })).rejects.toBe(undo);
  expect(await snapshotHashSourceToken(sql)).toBe(token);
  expect(await currentSnapshotHashes(sql,ids,3,cache)).toEqual(await fresh());

  // A write committed while the hashes are being computed: nothing is kept.
  let reads=0;
  const racing=((parts:TemplateStringsArray,...values:unknown[])=>{
   if(Array.isArray(parts)&&parts.join('').includes('with selected as materialized')&&++reads===2)
    return other`update core.contracts set title='Contract lucrari nou' where id=7`.then(()=>sql(parts,...values as never[]));
   return sql(parts,...values as never[]);
  }) as unknown as DbSql;
  const empty=createSnapshotHashCache('race');
  const raced=await currentSnapshotHashes(racing,ids,3,empty);
  expect(raced).toEqual(await fresh());
  expect(empty.token).toBeNull();expect(empty.hashes.size).toBe(0);expect(empty.stats.bypassed).toBe(1);

  // Missing or disabled change tracking, another time zone: never the same token.
  await sql`alter table core.awards disable trigger contract_identity_source_changed`;
  try{expect(await snapshotHashSourceToken(sql)).toBeNull();}
  finally{await sql`alter table core.awards enable trigger contract_identity_source_changed`;}
  expect(await snapshotHashSourceToken(sql)).not.toBeNull();
  await sql.begin(async tx=>{
   const t=tx as unknown as DbSql;
   const before=await snapshotHashSourceToken(t);
   await t`set local time zone 'Pacific/Chatham'`;
   expect(await snapshotHashSourceToken(t)).not.toBe(before);
  });

  // The publication check recomputes every hash; a memo entry that disagrees fails it.
  for(const [id,hash] of await currentSnapshotHashes(sql,['1','2']))
   await sql`update marts.contract_identity_members set snapshot_hash=${hash} where contract_id=${id}::bigint`;
  const members=createSnapshotHashCache('verify');
  await readContractIdentityQuality(sql,members);
  const plain=await readContractIdentityQuality(sql);
  expect(plain).toMatchObject({valid:true,members:2});
  expect(await verifyContractIdentityQuality(sql,members)).toEqual({...plain,hashCache:expect.objectContaining({compared:plain.members,mismatches:0})});
  members.hashes.set('1','0'.repeat(32));
  expect(await verifyContractIdentityQuality(sql,members)).toEqual({...plain,valid:false,hashCache:expect.objectContaining({mismatches:1})});
  await other`update core.contracts set title=title where id=1`;
  expect(await verifyContractIdentityQuality(sql,members)).toEqual({...plain,hashCache:expect.objectContaining({compared:0,mismatches:0})});
 });
});
