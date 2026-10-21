import {afterAll,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {applyDaSupplierVatIdentities,DA_SUPPLIER_VAT_REASON} from './da-supplier-vat.js';
import {PARSERS} from './parsers.js';
import {runNormalize} from './pipeline.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;
afterAll(async()=>{await connection?.sql.end();});
type Q=Parameters<Parameters<NonNullable<typeof connection>['sql']['begin']>[1]>[0];
const SHIMADZU='ATU 18379608 Shimadzu Handelsgesellschaft mbH', ECOLAB='ATU14260100 ECOLAB GMBH';
async function entity(q:Q,name:string,key?:{country:string;id:string}){
 const [row]=await q`insert into core.entities(cui_valid,name_display,name_normalized,country_code,is_foreign,foreign_id_raw,foreign_id_norm,first_seen,last_seen)
  values(false,${name},${name.toLowerCase()},${key?.country??null},${key!=null},${key?.id??null},${key?.id??null},'2025-04-08','2025-04-08') returning id::text id`;
 return String(row!.id);
}
let daId=990_000_000;
async function da(q:Q,supplier:string,value:number,authority:string|null=null){
 await q`insert into core.direct_acquisitions(sicap_da_id,supplier_entity_id,authority_entity_id,closing_value,state)
  values(${++daId},${supplier},${authority},${value},'Oferta acceptata')`;
}
async function supplierOf(q:Q,ids:string[]){
 const rows=await q`select distinct supplier_entity_id::text id from core.direct_acquisitions where sicap_da_id=any(${ids.map(Number)}::bigint[])`;
 return rows.map(r=>String(r.id));
}
/** The identity the web binds a receipt or a monitoring to (readMonitoringBindings). */
async function binding(q:Q,id:string){
 const [row]=await q`select e.id::text id,case when e.cui_valid then e.cui_canonical else null end cui,
  case when e.foreign_id_norm is not null and e.country_code is not null then e.country_code||':'||e.foreign_id_norm else null end "foreign",
  coalesce((select jsonb_agg(s.namespace||':'||s.sicap_id::text order by s.namespace,s.sicap_id) from core.entity_sicap_ids s where s.entity_id=e.id),'[]'::jsonb) sicap,
  md5(concat_ws('|',e.name_normalized,e.country_code,e.county)) fallback from core.entities e where e.id=${id}`;
 return {...row};
}
// Data audit F18 (local snapshot of 1 October): 'ATU14260100 ECOLAB GMBH' had 1,524
// entities, Shimadzu 1,220 next to its TED entity 2270137 (AT, ATU18379608). Only the
// first fragment, 2216188, carried the supplier SICAP id 100198784.
describe.skipIf(!connection)('DA suppliers listed with a foreign VAT number',()=>{
 it('the DA list resolves them by country and VAT number, onto the entity TED already holds',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.db.transaction(async tx=>{
   const ted=await tx.execute(`insert into core.entities(cui_valid,name_display,name_normalized,country_code,is_foreign,foreign_id_raw,foreign_id_norm)
    values(false,'Shimadzu Handelsgesellschaft mbH','shimadzu handelsgesellschaft mbh','AT',true,'ATU 18379608','ATU18379608') returning id::text id`);
   const tedId=String((ted as unknown as {id:string}[])[0]!.id);
   const ctx={tx,cpvCatalog:new Set<string>(),cpvByPrefix:new Map<string,string>(),units:new Map()};
   const list=(id:number,supplier:string)=>PARSERS['da-list:v1']!.load(ctx,1n,{directAcquisitionId:id,supplier,closingValue:1000,
    contractingAuthority:'13708611 INSTITUTUL DE MEDICINA LEGALA CLUJ NAPOCA',sysDirectAcquisitionState:{text:'Oferta acceptata'}});
   await list(990100001,ECOLAB);await list(990100002,ECOLAB);await list(990100003,SHIMADZU);await list(990100004,'Ex Libris (Deutschland) GmbH');
   const rows=await tx.execute(`select d.sicap_da_id::text da,e.id::text id,e.name_display,e.country_code,e.is_foreign,e.foreign_id_norm
    from core.direct_acquisitions d join core.entities e on e.id=d.supplier_entity_id where d.sicap_da_id between 990100001 and 990100004 order by 1`) as unknown as Record<string,unknown>[];
   expect(rows[0]!.id).toBe(rows[1]!.id);
   expect(rows[0]).toMatchObject({name_display:'ECOLAB GMBH',country_code:'AT',is_foreign:true,foreign_id_norm:'ATU14260100'});
   expect(rows[2]!.id).toBe(tedId);
   // A name alone is still not a key.
   expect(rows[3]).toMatchObject({name_display:'Ex Libris (Deutschland) GmbH',country_code:null,foreign_id_norm:null});
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('moves the fragments created before the fix to that entity, with a verified redirect, once',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.sql.begin(async q=>{
   const ted=await entity(q,'Shimadzu Handelsgesellschaft mbH',{country:'AT',id:'ATU18379608'});
   const s1=await entity(q,SHIMADZU), s2=await entity(q,SHIMADZU), e1=await entity(q,ECOLAB), e2=await entity(q,'ATU 14260100 ECOLAB GMBH');
   await q`insert into core.entity_sicap_ids(entity_id,namespace,sicap_id) values(${s1},'supplier',100198784)`;
   const named1=await entity(q,'Bozankaya Rayli Sistemler A.Ş.'), named2=await entity(q,'Bozankaya Rayli Sistemler A.Ş.');
   const buyer=await entity(q,'DE811121471 Georg Fischer GmbH'), authority=await entity(q,'Spital');
   const first=daId+1;
   await da(q,ted,500);await da(q,s1,1296);await da(q,s2,2104);await da(q,e1,8008);await da(q,e2,12);
   await da(q,named1,1);await da(q,named2,2);await da(q,buyer,3);await da(q,authority,4,buyer);
   const before=await binding(q,s1);
   const [total]=await q`select count(*)::int n,sum(closing_value)::text v from core.direct_acquisitions where sicap_da_id>=${first}`;

   expect((await applyDaSupplierVatIdentities(q)).map(String).sort()).toEqual([s1,s2,e1,e2].sort());
   const das=(n:number)=>[String(first+n)];
   for(const n of [0,1,2])expect(await supplierOf(q,das(n))).toEqual([ted]);
   const [ecolab]=await supplierOf(q,das(3));
   expect(await supplierOf(q,das(4))).toEqual([ecolab]);
   const [created]=await q`select name_display,name_normalized,country_code,is_foreign,foreign_id_norm,cui_valid,cui_raw_variants from core.entities where id=${ecolab!}`;
   expect({...created,cui_raw_variants:[...created!.cui_raw_variants].sort()}).toEqual({name_display:'ECOLAB GMBH',name_normalized:'ecolab gmbh',
    country_code:'AT',is_foreign:true,foreign_id_norm:'ATU14260100',cui_valid:false,cui_raw_variants:['ATU 14260100','ATU14260100']});
   const [sicap]=await q`select entity_id::text id from core.entity_sicap_ids where namespace='supplier' and sicap_id=100198784`;
   expect(sicap!.id).toBe(ted);
   // Names without a VAT number, and a fragment that is also a buyer, are left as they were.
   for(const [n,id] of [[5,named1],[6,named2],[7,buyer],[8,authority]] as const)expect(await supplierOf(q,das(n))).toEqual([id]);
   const [after]=await q`select count(*)::int n,sum(closing_value)::text v from core.direct_acquisitions where sicap_da_id>=${first}`;
   expect(after).toEqual(total);

   const redirects=await q`select old_id::text old,canonical_id::text canonical,reason,evidence from core.entity_redirects order by old_id`;
   expect(redirects.map(r=>[r.old,r.canonical,r.reason])).toEqual(
    [[s1,ted],[s2,ted],[e1,ecolab],[e2,ecolab]].map(([o,c])=>[o,c,DA_SUPPLIER_VAT_REASON]));
   const proof=redirects[0]!.evidence as {previousIdentity:unknown;canonicalIdentity:unknown;country:string;vatNumber:string};
   expect(proof.previousIdentity).toEqual(before);
   expect(before.sicap).toEqual(['supplier:100198784']);
   expect(proof.canonicalIdentity).toEqual(await binding(q,ted));
   expect([proof.country,proof.vatNumber]).toEqual(['AT','ATU18379608']);
   const [canonical]=await q`select core.canonical_entity_id(${e2}::bigint)::text id`;
   expect(canonical!.id).toBe(ecolab);
   // The fragment rows stay, for receipts that name them.
   const [kept]=await q`select count(*)::int n from core.entities where id=any(${[s1,s2,e1,e2]}::bigint[])`;
   expect(kept!.n).toBe(4);

   expect(await applyDaSupplierVatIdentities(q)).toEqual([]);
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('is applied by the nightly normalize stage before the marts read suppliers',async()=>{
  const {db,sql}=connection!;
  const [before]=await sql`select count(*)::int n from core.entities where foreign_id_norm='ATU14260100' or name_display=${ECOLAB}`;
  if(before!.n)throw Error('Fixture firm already present in the test database');
  const ids:string[]=[];
  try{
   const first=daId+1;
   await sql.begin(async q=>{for(const v of [1,2]){const id=await entity(q,ECOLAB);ids.push(id);await da(q,id,v);}});
   const report=await runNormalize(db,sql);
   expect(report.daSupplierVat).toBe(2);
   const suppliers=await supplierOf(sql as unknown as Q,[String(first),String(first+1)]);
   expect(suppliers).toHaveLength(1);
   ids.push(suppliers[0]!);
   expect((await runNormalize(db,sql)).daSupplierVat).toBe(0);
  }finally{
   await sql`delete from core.entity_redirects where old_id=any(${ids}::bigint[])`;
   await sql`delete from core.direct_acquisitions where supplier_entity_id=any(${ids}::bigint[])`;
   await sql`delete from core.entities where id=any(${ids}::bigint[])`;
  }
 });
});
