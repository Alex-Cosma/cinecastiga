import {afterAll,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {applyForeignCountrySpellings,FOREIGN_COUNTRY_SPELLING_REASON} from './foreign-country-spelling.js';
import {runNormalize} from './pipeline.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;
afterAll(async()=>{await connection?.sql.end();});
type Q=Parameters<Parameters<NonNullable<typeof connection>['sql']['begin']>[1]>[0];
async function entity(q:Q,name:string,country:string|null,id:string){
 const [row]=await q`insert into core.entities(cui_valid,name_display,name_normalized,country_code,is_foreign,foreign_id_raw,foreign_id_norm,cui_raw_variants,first_seen,last_seen)
  values(false,${name},${name.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()},${country},${country!=null&&country!=='RO'},${id},${id},array[${id}::text],'2024-01-01','2024-01-01') returning id::text id`;
 return String(row!.id);
}
let n=993_000_000;
async function contract(q:Q,winner:string){
 const id=++n;
 await q`insert into core.contracts(id,raw_id,ca_notice_contract_id,contract_value,currency,title) values(${id},${id},${id},1000,'RON','Contract')`;
 await q`insert into core.contract_winners(contract_id,entity_id) values(${id},${winner})`;
 return String(id);
}
async function tedLot(q:Q,winner:string,buyer:string|null=null){
 const [notice]=await q`insert into core.ted_notices(raw_id,publication_number,buyer_entity_id) values(${++n},${'F26-'+n},${buyer}) returning id`;
 const [lot]=await q`insert into core.ted_lot_results(ted_notice_id,lot_id) values(${notice!.id},'LOT-1') returning id::text id`;
 await q`insert into core.ted_lot_winners(lot_result_id,entity_id) values(${lot!.id},${winner})`;
 return String(lot!.id);
}
const winnersOf=async(q:Q,table:'contract_winners'|'ted_lot_winners',ids:string[])=>
 (await q`select ${q(table==='contract_winners'?'contract_id':'lot_result_id')}::text k,entity_id::text e from ${q('core.'+table)}
  where ${q(table==='contract_winners'?'contract_id':'lot_result_id')}=any(${ids}::bigint[]) order by 1`).map(r=>[r.k,r.e]);
/** The identity the web binds a receipt or a monitoring to (readMonitoringBindings). */
async function binding(q:Q,id:string){
 const [row]=await q`select e.id::text id,case when e.cui_valid then e.cui_canonical else null end cui,
  case when e.foreign_id_norm is not null and e.country_code is not null then e.country_code||':'||e.foreign_id_norm else null end "foreign",
  coalesce((select jsonb_agg(s.namespace||':'||s.sicap_id::text order by s.namespace,s.sicap_id) from core.entity_sicap_ids s where s.entity_id=e.id),'[]'::jsonb) sicap,
  md5(concat_ws('|',e.name_normalized,e.country_code,e.county)) fallback from core.entities e where e.id=${id}`;
 return {...row};
}
// Data audit F26 (local snapshot of 1 October): SHIELD FIRE won its SEAP contracts as
// 2270278 (UK, SICAP winner 100223606) and its TED lots as 2275019 (GB); Sinopharm
// 2270474 (HK) / 2274980 (HKG). 'ITALY', Candu (CA / RO) and consortium-member pairs
// share an id but are not one firm under two spellings.
describe.skipIf(!connection)('foreign firms split by the spelling of their country code',()=>{
 it('redirects the other spelling to the entity holding the SEAP contracts, moving its wins, once',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.sql.begin(async q=>{
   const uk=await entity(q,'SHIELD FIRE, SAFETY AND SECURITY LIMITED','UK','05089679');
   const gb=await entity(q,'SHIELD FIRE, SAFETY AND SECURITY LIMITED','GB','05089679');
   const hk=await entity(q,'SINOPHARM INTERNATIONAL HONGKONG LIMITED','HK','16435849');
   const hkg=await entity(q,'SINOPHARM INTERNATIONAL HONGKONG LIMITED','HKG','16435849');
   await q`insert into core.entity_sicap_ids(entity_id,namespace,sicap_id) values(${uk},'winner',100223606),(${hk},'winner',100182526)`;
   const ukContracts=[await contract(q,uk),await contract(q,uk)], hkContract=await contract(q,hk);
   const gbLots=[await tedLot(q,gb),await tedLot(q,gb)], hkgLot=await tedLot(q,hkg), hkLot=await tedLot(q,hk);
   // A lot both spellings won stays one win.
   await q`insert into core.ted_lot_winners(lot_result_id,entity_id) values(${hkLot},${hkg})`;
   await q`insert into core.direct_acquisitions(sicap_da_id,supplier_entity_id,closing_value,state) values(${++n},${gb},12,'Oferta acceptata')`;
   const da=String(n);
   // Not the same firm under two spellings: left as they are.
   const leonardo=await entity(q,'Leonardo S.p.A.','IT','ITALY'), cravattificio=await entity(q,'Cravattificio Alba','RO','ITALY');
   const canduCa=await entity(q,'CANDU ENERGY INC.','CA','7895097'), canduRo=await entity(q,'Candu Energy Inc.','RO','7895097');
   const unknown1=await entity(q,'Firma','XYZ','12345678'), unknown2=await entity(q,'Firma','XY','12345678');
   const untouched=[leonardo,cravattificio,canduCa,canduRo,unknown1,unknown2];
   const ukBefore=await binding(q,uk), gbBefore=await binding(q,gb);

   const first=await applyForeignCountrySpellings(q);
   expect(first.redirected.map(String).sort()).toEqual([gb,hkg].sort());
   expect(first.skipped).toEqual([]);
   expect(await winnersOf(q,'ted_lot_winners',gbLots)).toEqual(gbLots.map(l=>[l,uk]));
   expect(await winnersOf(q,'ted_lot_winners',[hkgLot,hkLot])).toEqual([[hkgLot,hk],[hkLot,hk]].sort());
   // The SEAP contract wins do not move, so approved contract identities keep their hash.
   expect(await winnersOf(q,'contract_winners',[...ukContracts,hkContract])).toEqual([...ukContracts.map(c=>[c,uk]),[hkContract,hk]]);
   const [daRow]=await q`select supplier_entity_id::text id from core.direct_acquisitions where sicap_da_id=${da}`;
   expect(daRow!.id).toBe(uk);
   // The canonical entity keeps its stored code, key and binding.
   expect(await binding(q,uk)).toEqual(ukBefore);
   const redirects=await q`select old_id::text old,canonical_id::text canonical,reason,evidence from core.entity_redirects order by old_id`;
   expect(redirects.map(r=>[r.old,r.canonical,r.reason])).toEqual([[gb,uk],[hkg,hk]].sort().map(([o,c])=>[o,c,FOREIGN_COUNTRY_SPELLING_REASON]));
   const proof=redirects.find(r=>r.old===gb)!.evidence as Record<string,unknown>;
   expect(proof).toMatchObject({country:'GB',foreignId:'05089679',countryCodes:{previous:'GB',canonical:'UK'},previousIdentity:gbBefore,canonicalIdentity:ukBefore});
   const [kept]=await q`select count(*)::int n from core.entities where id=any(${[gb,hkg]}::bigint[])`;
   expect(kept!.n).toBe(2);
   const left=await q`select count(*)::int n from core.entity_redirects where old_id=any(${untouched}::bigint[]) or canonical_id=any(${untouched}::bigint[])`;
   expect(left[0]!.n).toBe(0);

   expect(await applyForeignCountrySpellings(q)).toEqual({redirected:[],skipped:[]});
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('leaves a group for review when merging would touch an approved contract identity, a buyer or another name',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.sql.begin(async q=>{
   // Both spellings won SEAP contracts and the GB one sits in an approved group.
   const uk=await entity(q,'Mott MacDonald Limited','UK','1243967'), gb=await entity(q,'Mott MacDonald Limited','GB','1243967');
   await contract(q,uk);const approved=await contract(q,gb);
   await q`insert into marts.contract_identity_candidates(id,fingerprint,status,evidence) values('f26-fixture','f26-fp','source_verified','{}')`;
   await q`insert into marts.contract_identity_observations(fingerprint,candidate_id,evidence) values('f26-fp','f26-fixture','{}')`;
   await q`insert into marts.contract_identity_decisions(candidate_id,fingerprint,canonical_contract_id,reason) values('f26-fixture','f26-fp',${approved},'fixture')`;
   await q`insert into marts.contract_identity_members(contract_id,candidate_id,snapshot_hash) values(${approved},'f26-fixture','h')`;
   // The second spelling buys as a TED contracting body.
   const kz=await entity(q,'NAC Kazatomprom JSC','KZ','970240000816'), kaz=await entity(q,'NAC Kazatomprom JSC','KAZ','970240000816');
   await q`insert into core.entity_sicap_ids(entity_id,namespace,sicap_id) values(${kz},'winner',100134597)`;
   await tedLot(q,kaz,kaz);
   // A consortium keyed by its leader's id is not the leader.
   const leader=await entity(q,'Euro-Asfalt','BA','20038799007'), consortium=await entity(q,'Asocierea Euro-Asfalt si Partener','BIH','20038799007');
   const result=await applyForeignCountrySpellings(q);
   expect(result.redirected).toEqual([]);
   expect(result.skipped.map(s=>[s.reason,s.ids.sort()]).sort()).toEqual([
    ['approved_contract_identity',[uk,gb].sort()],['different_names',[leader,consortium].sort()],['member_is_buyer',[kz,kaz].sort()]].sort());
   expect(await winnersOf(q,'contract_winners',[approved])).toEqual([[approved,gb]]);
   const [redirects]=await q`select count(*)::int n from core.entity_redirects`;
   expect(redirects!.n).toBe(0);
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('is applied by the nightly normalize stage before the marts read winners',async()=>{
  const {db,sql}=connection!;
  const [before]=await sql`select count(*)::int n from core.entities where foreign_id_norm='60629541340'`;
  if(before!.n)throw Error('Fixture firm already present in the test database');
  const ids:string[]=[];const lots:string[]=[];
  try{
   await sql.begin(async q=>{
    ids.push(await entity(q,'NAFFCO AUSTRALIA PTY LTD','AU','60629541340'),await entity(q,'NAFFCO AUSTRALIA PTY LTD','AUS','60629541340'));
    lots.push(await tedLot(q,ids[1]!));
   });
   const report=await runNormalize(db,sql);
   expect(report.foreignCountrySpelling).toBe(1);
   expect(await winnersOf(sql as unknown as Q,'ted_lot_winners',lots)).toEqual([[lots[0],ids[0]]]);
   expect((await runNormalize(db,sql)).foreignCountrySpelling).toBe(0);
  }finally{
   await sql`delete from core.entity_redirects where old_id=any(${ids}::bigint[])`;
   await sql`delete from core.ted_notices where id in (select ted_notice_id from core.ted_lot_results where id=any(${lots}::bigint[]))`;
   await sql`delete from core.entities where id=any(${ids}::bigint[])`;
  }
 });
});
