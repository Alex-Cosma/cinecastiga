import {afterAll,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {applyReviewedSupplierMerges,REVIEWED_SUPPLIER_MERGE_REASON,type ReviewedSupplierMerge} from './reviewed-supplier-merges.js';
import {runNormalize} from './pipeline.js';
import {normalizeName} from './name.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;
afterAll(async()=>{await connection?.sql.end();});
type Q=Parameters<Parameters<NonNullable<typeof connection>['sql']['begin']>[1]>[0];
/** A key-less profile: no valid CUI, RO, optionally the mistyped id as its tier-2b key. */
async function keyless(q:Q,name:string,badId:string|null=null,id?:string){
 const row={...(id?{id}:{}),cui_valid:false,name_display:name,name_normalized:normalizeName(name).normalized,country_code:'RO',
  foreign_id_raw:badId,foreign_id_norm:badId,cui_raw_variants:badId?[badId]:null,first_seen:'2020-09-03',last_seen:'2022-06-03'};
 const [created]=await q`insert into core.entities ${q(row)} returning id::text id`;
 return String(created!.id);
}
async function firm(q:Q,name:string,cui:string,id?:string){
 const row={...(id?{id}:{}),cui_canonical:cui,cui_valid:true,name_display:name,name_normalized:normalizeName(name).normalized,country_code:'RO',
  county:'Bucuresti',cui_raw_variants:[cui],first_seen:'2021-01-01',last_seen:'2025-01-01'};
 const [created]=await q`insert into core.entities ${q(row)} returning id::text id`;
 return String(created!.id);
}
let n=994_000_000;
async function contract(q:Q,...winners:string[]){
 const id=++n;
 await q`insert into core.contracts(id,raw_id,ca_notice_contract_id,contract_value,currency,title) values(${id},${id},${id},1000,'RON','Contract')`;
 for(const w of winners)await q`insert into core.contract_winners(contract_id,entity_id) values(${id},${w})`;
 return String(id);
}
async function tedLot(q:Q,winner:string){
 const [notice]=await q`insert into core.ted_notices(raw_id,publication_number) values(${++n},${'F28-'+n}) returning id`;
 const [lot]=await q`insert into core.ted_lot_results(ted_notice_id,lot_id) values(${notice!.id},'LOT-1') returning id::text id`;
 await q`insert into core.ted_lot_winners(lot_result_id,entity_id) values(${lot!.id},${winner})`;
 return String(lot!.id);
}
const winners=async(q:Q,contractId:string)=>(await q`select entity_id::text e from core.contract_winners where contract_id=${contractId} order by 1`).map(r=>String(r.e));
/** The identity the web binds a receipt or a monitoring to (readMonitoringBindings). */
async function binding(q:Q,id:string){
 const [row]=await q`select e.id::text id,case when e.cui_valid then e.cui_canonical else null end cui,
  case when e.foreign_id_norm is not null and e.country_code is not null then e.country_code||':'||e.foreign_id_norm else null end "foreign",
  coalesce((select jsonb_agg(s.namespace||':'||s.sicap_id::text order by s.namespace,s.sicap_id) from core.entity_sicap_ids s where s.entity_id=e.id),'[]'::jsonb) sicap,
  md5(concat_ws('|',e.name_normalized,e.country_code,e.county)) fallback from core.entities e where e.id=${id}`;
 return {...row};
}
const rule=(sourceId:string,targetId:string,sourceName:string,targetCui:string):ReviewedSupplierMerge=>({sourceId,targetId,sourceName,targetCui,evidence:`fixture ${targetCui}`});
// Data audit F28 (production, 21 October): TELECOMUNICATII CFR won 3 contracts as the key-less
// 2277024 (id RO15034059) and 1 as 2276441 (no id), next to 2123842 (CUI 15034095); EXCO
// TRANSPORT SYSTEMS appears twice in one consortium as 2276194 and 2280420 (contract 539480).
describe.skipIf(!connection)('reviewed key-less supplier merges',()=>{
 it('moves the wins, lots, DAs and SICAP ids to the valid-CUI firm and records a verified redirect, once',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.sql.begin(async q=>{
   const cfr=await firm(q,'TELECOMUNICATII CFR S.A.','15034095');
   const typo=await keyless(q,'TELECOMUNICATII CFR SA','RO15034059'), bare=await keyless(q,'TELECOMUNICATII CFR SA');
   const exco=await firm(q,'EXCO TRANSPORT SYSTEMS S.R.L.','2626508');
   const exco1=await keyless(q,'SC EXCO TRANSPORT SYSTEMS SRL'), exco2=await keyless(q,'SC EXCO TRANSPORT SYSTEMS SRL');
   const typoContracts=[await contract(q,typo),await contract(q,typo)], bareContract=await contract(q,bare), own=await contract(q,cfr);
   const consortium=await contract(q,exco1,exco2);
   const lot=await tedLot(q,typo);
   await q`insert into core.direct_acquisitions(sicap_da_id,supplier_entity_id,closing_value,state) values(${++n},${bare},12,'Oferta acceptata')`;
   const da=String(n);
   await q`insert into core.entity_sicap_ids(entity_id,namespace,sicap_id) values(${typo},'winner',994000001)`;
   const cfrBefore=await binding(q,cfr), typoBefore=await binding(q,typo);
   const rules=[rule(typo,cfr,'telecomunicatii cfr','15034095'),rule(bare,cfr,'telecomunicatii cfr','15034095'),
    rule(exco1,exco,'exco transport systems','2626508'),rule(exco2,exco,'exco transport systems','2626508')];

   const first=await applyReviewedSupplierMerges(q,rules);
   expect(first).toEqual({redirected:[typo,bare,exco1,exco2].map(BigInt),skipped:[]});
   for(const c of [...typoContracts,bareContract,own])expect(await winners(q,c)).toEqual([cfr]);
   // The same firm twice in one consortium is one winner.
   expect(await winners(q,consortium)).toEqual([exco]);
   const [lotRow]=await q`select entity_id::text e from core.ted_lot_winners where lot_result_id=${lot}`;
   expect(lotRow!.e).toBe(cfr);
   const [daRow]=await q`select supplier_entity_id::text e from core.direct_acquisitions where sicap_da_id=${da}`;
   expect(daRow!.e).toBe(cfr);
   const [sicap]=await q`select entity_id::text e from core.entity_sicap_ids where namespace='winner' and sicap_id=994000001`;
   expect(sicap!.e).toBe(cfr);
   const left=await q`select count(*)::int n from core.contract_winners where entity_id=any(${[typo,bare,exco1,exco2]}::bigint[])`;
   expect(left[0]!.n).toBe(0);
   // The firm keeps its CUI key, so bindings and approved identities on it hold.
   const cfrAfter=await binding(q,cfr);
   expect({cui:cfrAfter.cui,foreign:cfrAfter.foreign,fallback:cfrAfter.fallback}).toEqual({cui:cfrBefore.cui,foreign:cfrBefore.foreign,fallback:cfrBefore.fallback});
   const [kept]=await q`select cui_raw_variants v,first_seen::date::text f from core.entities where id=${cfr}`;
   expect([...kept!.v].sort()).toEqual(['15034095','RO15034059']);
   expect(kept!.f).toBe('2020-09-03');
   const redirects=await q`select old_id::text old,canonical_id::text canonical,reason,evidence from core.entity_redirects order by old_id`;
   expect(redirects.map(r=>[r.old,r.canonical,r.reason])).toEqual([[typo,cfr],[bare,cfr],[exco1,exco],[exco2,exco]].map(([o,c])=>[o,c,REVIEWED_SUPPLIER_MERGE_REASON]));
   expect(redirects[0]!.evidence).toMatchObject({sourceName:'telecomunicatii cfr',targetCui:'15034095',note:'fixture 15034095',previousIdentity:typoBefore,canonicalIdentity:cfrAfter});
   const [rows]=await q`select count(*)::int n from core.entities where id=any(${[typo,bare,exco1,exco2]}::bigint[])`;
   expect(rows!.n).toBe(4);

   expect(await applyReviewedSupplierMerges(q,rules)).toEqual({redirected:[],skipped:[]});
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('skips and reports a row whose recorded facts no longer hold or whose merge would touch an approved identity',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.sql.begin(async q=>{
   const target=await firm(q,'IASICON S.A.','1957821');
   const valid=await firm(q,'IASICON CONSTRUCT','40000003');
   const renamed=await keyless(q,'IASICON INVEST SRL');
   const wrongCui=await keyless(q,'IASICON S.A.');
   const buyer=await keyless(q,'IASICON S.A.');
   await q`insert into core.direct_acquisitions(sicap_da_id,authority_entity_id,closing_value,state) values(${++n},${buyer},1,'Oferta acceptata')`;
   const approved=await keyless(q,'IASICON S.A.');
   const approvedContract=await contract(q,approved);
   await q`insert into marts.contract_identity_candidates(id,fingerprint,status,evidence) values('f28-fixture','f28-fp','source_verified','{}')`;
   await q`insert into marts.contract_identity_observations(fingerprint,candidate_id,evidence) values('f28-fp','f28-fixture','{}')`;
   await q`insert into marts.contract_identity_decisions(candidate_id,fingerprint,canonical_contract_id,reason) values('f28-fixture','f28-fp',${approvedContract},'fixture')`;
   await q`insert into marts.contract_identity_members(contract_id,candidate_id,snapshot_hash) values(${approvedContract},'f28-fixture','h')`;
   const elsewhere=await keyless(q,'IASICON S.A.'), other=await firm(q,'ALTA FIRMA','40000011');
   await q`insert into core.entity_redirects(old_id,canonical_id,reason,evidence) values(${elsewhere},${other},'fixture','{}')`;
   const hub=await keyless(q,'IASICON S.A.'), spoke=await keyless(q,'IASICON SA');
   await q`insert into core.entity_redirects(old_id,canonical_id,reason,evidence) values(${spoke},${hub},'fixture','{}')`;
   const movedTarget=await firm(q,'IASICON VECHI','40000046'), toMoved=await keyless(q,'IASICON S.A.');
   await q`insert into core.entity_redirects(old_id,canonical_id,reason,evidence) values(${movedTarget},${target},'fixture','{}')`;
   const name='iasicon';
   const rules=[
    rule('994999999',target,name,'1957821'),
    rule(valid,target,'iasicon construct','1957821'),
    rule(renamed,target,name,'1957821'),
    rule(wrongCui,target,name,'1957822'),
    rule(wrongCui,'994999998',name,'1957821'),
    rule(buyer,target,name,'1957821'),
    rule(approved,target,name,'1957821'),
    rule(elsewhere,target,name,'1957821'),
    rule(hub,target,name,'1957821'),
    rule(toMoved,movedTarget,name,'40000046'),
   ];
   const result=await applyReviewedSupplierMerges(q,rules);
   expect(result.redirected).toEqual([]);
   expect(result.skipped.map(s=>s.reason)).toEqual(['source_missing','source_has_valid_cui','source_name_changed','target_cui_changed','target_missing',
    'source_is_buyer','approved_contract_identity','source_redirected_elsewhere','source_is_redirect_target','target_is_redirected']);
   expect(await winners(q,approvedContract)).toEqual([approved]);
   const [redirects]=await q`select count(*)::int n from core.entity_redirects where reason=${REVIEWED_SUPPLIER_MERGE_REASON}`;
   expect(redirects!.n).toBe(0);
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('applies the reviewed list in the nightly normalize stage before the marts read winners',async()=>{
  const {db,sql}=connection!;
  const ids=['2277024','2276441','2123842'];
  const [before]=await sql`select count(*)::int n from core.entities where id=any(${ids}::bigint[])`;
  if(before!.n)throw Error('Fixture entities already present in the test database');
  const contracts:string[]=[];
  try{
   await sql.begin(async q=>{
    await firm(q,'TELECOMUNICATII CFR S.A.','15034095','2123842');
    await keyless(q,'TELECOMUNICATII CFR SA','RO15034059','2277024');
    await keyless(q,'TELECOMUNICATII CFR SA',null,'2276441');
    contracts.push(await contract(q,'2277024'),await contract(q,'2276441'));
   });
   const report=await runNormalize(db,sql);
   expect(report.reviewedSupplierMerges).toBe(2);
   for(const c of contracts)expect(await winners(sql as unknown as Q,c)).toEqual(['2123842']);
   expect((await runNormalize(db,sql)).reviewedSupplierMerges).toBe(0);
  }finally{
   await sql`delete from core.entity_redirects where old_id=any(${ids}::bigint[])`;
   await sql`delete from core.contract_winners where contract_id=any(${contracts}::bigint[])`;
   await sql`delete from core.contracts where id=any(${contracts}::bigint[])`;
   await sql`delete from core.entities where id=any(${ids}::bigint[])`;
  }
 });
});
