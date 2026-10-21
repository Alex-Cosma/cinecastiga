import {afterAll,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {applyNutsCounties} from './nuts-county.js';
import {applyRegistryCounties} from './registry-county.js';
import {runNormalize} from './pipeline.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;
afterAll(async()=>{await connection?.sql.end();});
type Q=Parameters<Parameters<NonNullable<typeof connection>['sql']['begin']>[1]>[0];
type Fixture={cui?:string;name:string;county?:string|null;nuts?:string|null;country?:string|null;foreign?:boolean};
async function entity(q:Q,e:Fixture){
 const [row]=await q`insert into core.entities(cui_canonical,cui_valid,name_display,name_normalized,county,nuts_code,country_code,is_foreign)
  values(${e.cui??null},${e.cui!=null},${e.name},${e.name.toLowerCase()},${e.county??null},${e.nuts??null},${e.country===undefined?null:e.country},${e.foreign??false}) returning id`;
 return BigInt(row!.id);
}
let daId=990000000;
/** A DA of `supplier` (null: only the authority buys); the DA list carries no address. */
async function da(q:Q,authority:bigint,supplier:bigint|null){
 daId+=1;
 await q`insert into core.direct_acquisitions(sicap_da_id,authority_entity_id,supplier_entity_id) values(${daId},${authority.toString()},${supplier?.toString()??null})`;
}
async function countyOf(q:Q,id:bigint){
 const [row]=await q`select county from core.entities where id=${id.toString()}`;
 return row!.county as string|null;
}
// Owner decision F13 (21 October 2026). Shapes from the 1 Oct snapshot: DA suppliers
// with no address but an ONRC seat (URBI-SERV 2205771, Arad), Comuna Țibucani
// 2205736 -> 124803 (Neamț), DAUI Sector 5 2161661 -> -5, and the five Vânători
// communes that share one name across five counties (audit F15).
describe.skipIf(!connection)('county from the ONRC registered office and strict UAT links',()=>{
 it('fills only where every source agrees and the entity has no county, once',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.sql.begin(async q=>{
   const buyer=await entity(q,{name:'Autoritate cumparatoare',county:'Arad',country:'RO'});
   // Suppliers and the ONRC registered office.
   const supplier=await entity(q,{cui:'990000101',name:'URBI-SERV'});
   const accents=await entity(q,{cui:'990000102',name:'Firma din Bistrita',country:'RO'});
   const moved=await entity(q,{cui:'990000103',name:'Firma mutata'});
   const nutsConflict=await entity(q,{cui:'990000104',name:'Firma cu NUTS din alt judet',nuts:'RO213',country:'RO'});
   const abroad=await entity(q,{cui:'990000105',name:'Firma cu adresa in Bulgaria',nuts:'BG411'});
   const foreign=await entity(q,{cui:'990000106',name:'Lockheed Martin Global Inc.',country:'US'});
   const known=await entity(q,{cui:'990000107',name:'Firma cu judet din sursa',county:'Cluj'});
   const authorityOnly=await entity(q,{cui:'990000108',name:'Regie autonoma care doar cumpara'});
   const noCui=await entity(q,{name:'Firma fara CUI'});
   for(const id of [supplier,accents,moved,nutsConflict,abroad,foreign,known,noCui])await da(q,buyer,id);
   await da(q,authorityOnly,null);
   await q`insert into reference.onrc_firm(j_number,cui,name,county,snapshot_date) values
    ('J2/1/2020','990000101','URBI-SERV SRL','Arad','2026-07-08'),
    ('J6/1/2020','990000102','FIRMA DIN BISTRITA SRL','Bistriţa-Năsăud','2026-07-08'),
    ('J6/2/2020','990000102','FIRMA DIN BISTRITA SRL','Bistriţa-Năsăud','2026-07-08'),
    ('J12/1/2010','990000103','FIRMA MUTATA SRL','Cluj','2026-07-08'),
    ('J40/1/2020','990000103','FIRMA MUTATA SRL','Bucureşti','2026-07-08'),
    ('J33/1/2020','990000104','FIRMA SRL','Suceava','2026-07-08'),
    ('J40/2/2020','990000105','FIRMA SRL','Bucureşti','2026-07-08'),
    ('J40/3/2020','990000106','LOCKHEED MARTIN GLOBAL INC. SUCURSALA BUCURESTI','Bucureşti','2026-07-08'),
    ('J2/2/2020','990000107','FIRMA SRL','Arad','2026-07-08'),
    ('J4/1/2020','990000108','REGIE SRL','Bacău','2026-07-08')`;
   // Authorities and strict UAT links.
   const tibucani=await entity(q,{cui:'990000201',name:'Comuna Tibucani'});
   const tibucaniOld=await entity(q,{name:'Comuna Tibucani (Primaria Comunei Tibucani)'});
   const racova=await entity(q,{name:'COMUNA RACOVA(CONSILIUL LOCAL)'});
   const legacySpelling=await entity(q,{name:'COMUNA SINMIHAIU ROMAN'});
   const vanatori=await entity(q,{cui:'990000202',name:'COMUNA VANATORI'});
   const school=await entity(q,{cui:'990000203',name:'Scoala Gimnaziala Tibucani'});
   const corabia=await entity(q,{cui:'990000204',name:'Comuna Corabia (Primaria Cobia)'});
   const sector=await entity(q,{cui:'990000205',name:'DIRECȚIA DE ADMINISTRARE A UNITĂȚILOR DE ÎNVĂȚĂMÂNT SECTOR 5'});
   const otherSector=await entity(q,{cui:'990000206',name:'Administratia Pietelor Sector 1'});
   const uatConflict=await entity(q,{cui:'990000207',name:'COMUNA CIMPURI'});
   const uatNuts=await entity(q,{name:'UAT COMUNA CIMPINEANCA',nuts:'RO411'});
   // Scânteia (Iași) 2141946 is pinned by the F15 repair on the Ialomița code 94429. Its
   // name passes the strict check against that unit; only the pin keeps it out.
   await q`insert into core.entities(id,cui_canonical,cui_valid,name_display,name_normalized) values
    (2141946,'4540313',true,'COMUNA SCANTEIA','comuna scanteia')`;
   const both=await entity(q,{cui:'990000208',name:'CENTRUL DE INOVARE SI PROIECTARE URBANA SECTOR 6 SRL'});
   await da(q,both,null);await da(q,buyer,both);
   await q`insert into reference.onrc_firm(j_number,cui,name,county,snapshot_date) values
    ('J39/1/2020','990000207','COMUNA CIMPURI','Bacău','2026-07-08'),
    ('J40/4/2020','990000208','CENTRUL DE INOVARE SI PROIECTARE URBANA SECTOR 6 SRL','Bucureşti','2026-07-08')`;
   await q`insert into reference.uat(siruta,name,county,tip,population) values
    (124803,'ŢIBUCANI','neamt','3',4919),(24711,'RACOVA','bacau','3',3104),(158699,'SÎNMIHAIU ROMÂN','timis','3',5000),
    (113849,'VÂNATORI','mehedinti','3',1964),(75150,'VÎNATORI','galati','3',4864),
    (125542,'ORAŞ CORABIA','olt','2',16441),(94429,'SCÎNTEIA','ialomita','3',3858),(175670,'CÎMPURI','vrancea','3',3700),(174780,'CÎMPINEANCA','vrancea','3',3500)`;
   await q`insert into reference.authority_uat values
    (${tibucani.toString()},124803,4919),(${tibucaniOld.toString()},124803,4919),(${racova.toString()},24711,3104),
    (${legacySpelling.toString()},158699,5000),(${vanatori.toString()},113849,1964),(${school.toString()},124803,4919),
    (${corabia.toString()},125542,16441),(${sector.toString()},-5,257900),(${otherSector.toString()},-5,257900),
    (${uatConflict.toString()},175670,3700),(${uatNuts.toString()},174780,3500),(2141946,94429,3858),
    (${both.toString()},-6,351551)`;

   // Other test files share the database: look only at this fixture's entities.
   const fixture=new Set([supplier,accents,moved,nutsConflict,abroad,foreign,known,authorityOnly,noCui,tibucani,tibucaniOld,racova,
    legacySpelling,vanatori,school,corabia,sector,otherSector,uatConflict,uatNuts,both,2141946n]);
   const mine=(ids:bigint[])=>ids.filter(id=>fixture.has(id)).sort();
   expect(mine(await applyNutsCounties(q))).toEqual([]);
   const filled=await applyRegistryCounties(q);
   expect(mine(filled.onrc)).toEqual([supplier,accents,both].sort());
   expect(mine(filled.authorityUat)).toEqual([tibucani,tibucaniOld,racova,legacySpelling,sector].sort());
   expect(await countyOf(q,supplier)).toBe('Arad');
   expect(await countyOf(q,accents)).toBe('Bistrita-Nasaud');
   expect(await countyOf(q,both)).toBe('Bucuresti');
   expect(await countyOf(q,tibucani)).toBe('Neamt');
   expect(await countyOf(q,tibucaniOld)).toBe('Neamt');
   expect(await countyOf(q,racova)).toBe('Bacau');
   expect(await countyOf(q,legacySpelling)).toBe('Timis');
   expect(await countyOf(q,sector)).toBe('Bucuresti');
   for(const id of [moved,nutsConflict,abroad,foreign,authorityOnly,noCui,vanatori,school,corabia,otherSector,uatConflict,uatNuts,2141946n])
    expect(await countyOf(q,id),String(id)).toBeNull();
   expect(await countyOf(q,known)).toBe('Cluj');
   const again=await applyRegistryCounties(q);
   expect([...mine(again.onrc),...mine(again.authorityUat)]).toEqual([]);
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('is applied by the nightly normalize stage after the NUTS-3 step',async()=>{
  const {db,sql}=connection!;
  const [before]=await sql`select count(*)::int n from core.entities where cui_canonical='990000111'`;
  if(before!.n)throw Error('Fixture CUI already present in the test database');
  const ids:bigint[]=[];
  try{
   await sql.begin(async q=>{
    const buyer=await entity(q,{name:'Autoritate cumparatoare F13',county:'Arad',country:'RO'});
    const supplier=await entity(q,{cui:'990000111',name:'Furnizor DA F13'});
    ids.push(buyer,supplier);
    await da(q,buyer,supplier);
    await q`insert into reference.onrc_firm(j_number,cui,name,county,snapshot_date) values('J35/1/2020','990000111','FURNIZOR DA F13 SRL','Timiş','2026-07-08')`;
   });
   // A normalize run of another test file may fill it first; either way the stage did.
   const report=await runNormalize(db,sql);
   expect(report.onrcCounties).toBeTypeOf('number');
   expect(report.authorityUatCounties).toBeTypeOf('number');
   expect(await countyOf(sql as unknown as Q,ids[1]!)).toBe('Timis');
  }finally{
   await sql`delete from reference.onrc_firm where cui='990000111'`;
   await sql`delete from core.direct_acquisitions where supplier_entity_id = any(${ids.map(String)}::bigint[])`;
   await sql`delete from core.entities where id = any(${ids.map(String)}::bigint[])`;
  }
 });
});
