import {afterAll,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {applyReviewedForeignTwinMerges,REVIEWED_FOREIGN_TWIN_MERGE_REASON,type ReviewedForeignTwinMerge} from './reviewed-foreign-twin-merges.js';
import {runNormalize} from './pipeline.js';
import {normalizeName} from './name.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;
afterAll(async()=>{await connection?.sql.end();});
type Q=Parameters<Parameters<NonNullable<typeof connection>['sql']['begin']>[1]>[0];
/** A foreign-marked firm without a valid CUI, keyed by (country, foreign id). */
async function foreign(q:Q,name:string,country:string,foreignId:string,id?:string){
 const row={...(id?{id}:{}),cui_valid:false,is_foreign:true,name_display:name,name_normalized:normalizeName(name).normalized,country_code:country,
  county:country==='RO'?'Constanta':null,foreign_id_raw:foreignId,foreign_id_norm:foreignId,cui_raw_variants:[foreignId],
  first_seen:country==='RO'?'2019-02-01':'2021-05-01',last_seen:'2024-03-01'};
 const [created]=await q`insert into core.entities ${q(row)} returning id::text id`;
 return String(created!.id);
}
let n=995_000_000;
async function contract(q:Q,...winners:string[]){
 const id=++n;
 await q`insert into core.contracts(id,raw_id,ca_notice_contract_id,contract_value,currency,title) values(${id},${id},${id},1000,'RON','Contract')`;
 for(const w of winners)await q`insert into core.contract_winners(contract_id,entity_id) values(${id},${w})`;
 return String(id);
}
async function tedLot(q:Q,...winners:string[]){
 const [notice]=await q`insert into core.ted_notices(raw_id,publication_number) values(${++n},${'F26T-'+n}) returning id`;
 const [lot]=await q`insert into core.ted_lot_results(ted_notice_id,lot_id) values(${notice!.id},'LOT-1') returning id::text id`;
 for(const w of winners)await q`insert into core.ted_lot_winners(lot_result_id,entity_id) values(${lot!.id},${w})`;
 return String(lot!.id);
}
const winners=async(q:Q,contractId:string)=>(await q`select entity_id::text e from core.contract_winners where contract_id=${contractId} order by 1`).map(r=>String(r.e));
const lotWinners=async(q:Q,lotId:string)=>(await q`select entity_id::text e from core.ted_lot_winners where lot_result_id=${lotId} order by 1`).map(r=>String(r.e));
/** The identity the web binds a receipt or a monitoring to (readMonitoringBindings). */
async function binding(q:Q,id:string){
 const [row]=await q`select e.id::text id,case when e.cui_valid then e.cui_canonical else null end cui,
  case when e.foreign_id_norm is not null and e.country_code is not null then e.country_code||':'||e.foreign_id_norm else null end "foreign",
  coalesce((select jsonb_agg(s.namespace||':'||s.sicap_id::text order by s.namespace,s.sicap_id) from core.entity_sicap_ids s where s.entity_id=e.id),'[]'::jsonb) sicap,
  md5(concat_ws('|',e.name_normalized,e.country_code,e.county)) fallback from core.entities e where e.id=${id}`;
 return {...row};
}
const rule=(sourceId:string,targetId:string,foreignId:string,sourceName:string,targetName:string,targetCountry:string):ReviewedForeignTwinMerge=>
 ({sourceId,targetId,foreignId,sourceName,targetName,targetCountry,evidence:`fixture ${foreignId}`});
// Data audit F26 C(i): Candu Energy won its SEAP contracts as 2270125 (country RO, id 7895097)
// and its TED lots as 2270102 (CA, same id, name "CANDU ENERGY INC.(CEI)").
describe.skipIf(!connection)('reviewed foreign twin merges',()=>{
 it('moves the wins, lots, DAs and SICAP ids to the foreign twin and records a verified redirect, once',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.sql.begin(async q=>{
   const twin=await foreign(q,'CANDU ENERGY INC.(CEI)','CA','7895097');
   const ro=await foreign(q,'Candu Energy Inc.','RO','7895097');
   const roContracts=[await contract(q,ro),await contract(q,ro)], shared=await contract(q,ro,twin);
   const roLot=await tedLot(q,ro), twinLot=await tedLot(q,twin), sharedLot=await tedLot(q,ro,twin);
   await q`insert into core.direct_acquisitions(sicap_da_id,supplier_entity_id,closing_value,state) values(${++n},${ro},12,'Oferta acceptata')`;
   const da=String(n);
   await q`insert into core.entity_sicap_ids(entity_id,namespace,sicap_id) values(${ro},'winner',995000001)`;
   const twinBefore=await binding(q,twin), roBefore=await binding(q,ro);
   const rules=[rule(ro,twin,'7895097','candu energy inc','candu energy inc cei','CA')];

   const first=await applyReviewedForeignTwinMerges(q,rules);
   expect(first).toEqual({redirected:[BigInt(ro)],skipped:[]});
   for(const c of [...roContracts,shared])expect(await winners(q,c)).toEqual([twin]);
   for(const l of [roLot,twinLot,sharedLot])expect(await lotWinners(q,l)).toEqual([twin]);
   const [daRow]=await q`select supplier_entity_id::text e from core.direct_acquisitions where sicap_da_id=${da}`;
   expect(daRow!.e).toBe(twin);
   const [sicap]=await q`select entity_id::text e from core.entity_sicap_ids where namespace='winner' and sicap_id=995000001`;
   expect(sicap!.e).toBe(twin);
   // The twin keeps its foreign key, so bindings on it hold; the source row stays.
   const twinAfter=await binding(q,twin);
   expect({cui:twinAfter.cui,foreign:twinAfter.foreign,fallback:twinAfter.fallback}).toEqual({cui:twinBefore.cui,foreign:twinBefore.foreign,fallback:twinBefore.fallback});
   expect(twinAfter.foreign).toBe('CA:7895097');
   const [kept]=await q`select country_code,first_seen::date::text f from core.entities where id=${twin}`;
   expect(kept).toMatchObject({country_code:'CA',f:'2019-02-01'});
   const [source]=await q`select country_code,foreign_id_norm from core.entities where id=${ro}`;
   expect(source).toMatchObject({country_code:'RO',foreign_id_norm:'7895097'});
   const redirects=await q`select old_id::text old,canonical_id::text canonical,reason,evidence from core.entity_redirects`;
   expect(redirects.map(r=>[r.old,r.canonical,r.reason])).toEqual([[ro,twin,REVIEWED_FOREIGN_TWIN_MERGE_REASON]]);
   expect(redirects[0]!.evidence).toMatchObject({foreignId:'7895097',countryCodes:{previous:'RO',canonical:'CA'},
    sourceName:'candu energy inc',targetName:'candu energy inc cei',note:'fixture 7895097',previousIdentity:roBefore,canonicalIdentity:twinAfter});

   expect(await applyReviewedForeignTwinMerges(q,rules)).toEqual({redirected:[],skipped:[]});
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('skips and reports a row whose recorded facts no longer hold or whose merge would touch a guarded contract identity',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.sql.begin(async q=>{
   // The (country, foreign id) key is unique, so each case has its own id.
   const name='tirrena scavi spa', display='Tirrena Scavi Spa';
   let k=0;
   const key=()=>`TS${String(++k).padStart(4,'0')}`;
   /** A reviewed pair: the RO source and its IT twin, both under one foreign id. */
   const pair=async(o:{source?:[string,string];target?:[string,string]}={})=>{
    const id=key();
    const source=await foreign(q,o.source?.[0]??display,o.source?.[1]??'RO',id);
    const target=await foreign(q,o.target?.[0]??display,o.target?.[1]??'IT',id);
    return {id,source,target};
   };
   const r=(p:{id:string;source:string;target:string},o:Partial<ReviewedForeignTwinMerge>={})=>({...rule(p.source,p.target,p.id,name,name,'IT'),...o});
   const missingSource=await pair(), missingTarget=await pair();
   const validCui=await pair();
   await q`update core.entities set cui_valid=true,cui_canonical='40000003' where id=${validCui.source}`;
   const otherCountry=await pair({source:[display,'FR']});
   const otherId=await pair();
   const renamed=await pair({source:['Tirrena Scavi Holding','RO']});
   const twinValid=await pair();
   await q`update core.entities set cui_valid=true,cui_canonical='40000011' where id=${twinValid.target}`;
   const twinMoved=await pair({target:[display,'GR']});
   const twinRenamed=await pair({target:['Tirrena Scavi Holding','IT']});
   const elsewhere=await pair(), other=await foreign(q,'Altra Ditta','IT','99999999');
   await q`insert into core.entity_redirects(old_id,canonical_id,reason,evidence) values(${elsewhere.source},${other},'fixture','{}')`;
   const hub=await pair(), spoke=await foreign(q,display,'RO',key());
   await q`insert into core.entity_redirects(old_id,canonical_id,reason,evidence) values(${spoke},${hub.source},'fixture','{}')`;
   const movedTarget=await pair(), newer=await foreign(q,display,'IT',key());
   await q`insert into core.entity_redirects(old_id,canonical_id,reason,evidence) values(${movedTarget.target},${newer},'fixture','{}')`;
   const buyer=await pair();
   await q`insert into core.direct_acquisitions(sicap_da_id,authority_entity_id,closing_value,state) values(${++n},${buyer.source},1,'Oferta acceptata')`;
   const approved=await pair(), approvedContract=await contract(q,approved.source);
   await q`insert into marts.contract_identity_candidates(id,fingerprint,status,evidence) values('f26t-approved','f26t-fp1','source_verified','{}')`;
   await q`insert into marts.contract_identity_observations(fingerprint,candidate_id,evidence) values('f26t-fp1','f26t-approved','{}')`;
   await q`insert into marts.contract_identity_decisions(candidate_id,fingerprint,canonical_contract_id,reason) values('f26t-approved','f26t-fp1',${approvedContract},'fixture')`;
   await q`insert into marts.contract_identity_members(contract_id,candidate_id,snapshot_hash) values(${approvedContract},'f26t-approved','h')`;
   const excluded=await pair(), excludedContract=await contract(q,excluded.source);
   await q`insert into marts.contract_identity_candidates(id,fingerprint,status,evidence) values('f26t-excluded','f26t-fp2','needs_evidence','{}')`;
   await q`insert into marts.contract_identity_observations(fingerprint,candidate_id,evidence) values('f26t-fp2','f26t-excluded','{}')`;
   await q`insert into marts.contract_identity_exclusions(contract_id,candidate_id,fingerprint,snapshot_hash,processing_run_id)
     values(${excludedContract},'f26t-excluded','f26t-fp2','h','00000000-0000-0000-0000-000000000026')`;
   const rules=[
    r(missingSource,{sourceId:'995999999'}),
    r(missingTarget,{targetId:'995999998'}),
    r(validCui),
    r(otherCountry),
    r(otherId,{foreignId:'TS9999'}),
    r(renamed),
    r(twinValid),
    r(twinMoved),
    r(twinRenamed),
    r(elsewhere),
    r(hub),
    r(movedTarget),
    r(buyer),
    r(approved),
    r(excluded),
   ];
   const result=await applyReviewedForeignTwinMerges(q,rules);
   expect(result.redirected).toEqual([]);
   expect(result.skipped.map(s=>s.reason)).toEqual(['source_missing','target_missing','source_has_valid_cui','source_key_changed','source_key_changed',
    'source_name_changed','target_has_valid_cui','target_key_changed','target_name_changed','source_redirected_elsewhere','source_is_redirect_target',
    'target_is_redirected','source_is_buyer','approved_contract_identity','temporary_identity_exclusion']);
   expect(await winners(q,approvedContract)).toEqual([approved.source]);
   expect(await winners(q,excludedContract)).toEqual([excluded.source]);
   const [redirects]=await q`select count(*)::int n from core.entity_redirects where reason=${REVIEWED_FOREIGN_TWIN_MERGE_REASON}`;
   expect(redirects!.n).toBe(0);
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('applies the reviewed list in the nightly normalize stage before the marts read winners',async()=>{
  const {db,sql}=connection!;
  const ids=['2270125','2270102'];
  const [before]=await sql`select count(*)::int n from core.entities where id=any(${ids}::bigint[])`;
  if(before!.n)throw Error('Fixture entities already present in the test database');
  const contracts:string[]=[];const lots:string[]=[];
  try{
   await sql.begin(async q=>{
    await foreign(q,'CANDU ENERGY INC.(CEI)','CA','7895097','2270102');
    await foreign(q,'Candu Energy Inc.','RO','7895097','2270125');
    contracts.push(await contract(q,'2270125'));
    lots.push(await tedLot(q,'2270125'));
   });
   const report=await runNormalize(db,sql);
   expect(report.reviewedForeignTwinMerges).toBe(1);
   expect(await winners(sql as unknown as Q,contracts[0]!)).toEqual(['2270102']);
   expect(await lotWinners(sql as unknown as Q,lots[0]!)).toEqual(['2270102']);
   expect((await runNormalize(db,sql)).reviewedForeignTwinMerges).toBe(0);
  }finally{
   await sql`delete from core.entity_redirects where old_id=any(${ids}::bigint[])`;
   await sql`delete from core.contract_winners where contract_id=any(${contracts}::bigint[])`;
   await sql`delete from core.contracts where id=any(${contracts}::bigint[])`;
   const notices=(await sql`select ted_notice_id::text id from core.ted_lot_results where id=any(${lots}::bigint[])`).map(r=>String(r.id));
   await sql`delete from core.ted_lot_winners where lot_result_id=any(${lots}::bigint[])`;
   await sql`delete from core.ted_lot_results where id=any(${lots}::bigint[])`;
   await sql`delete from core.ted_notices where id=any(${notices}::bigint[])`;
   await sql`delete from core.entities where id=any(${ids}::bigint[])`;
  }
 });
});
