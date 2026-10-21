import {afterAll,describe,it,expect} from 'vitest';
import {createDb,readContractIdentityMembers} from '@seap/db';
import {applyRegistryRomanianCountries} from './registry-country.js';
import {runNormalize} from './pipeline.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;
afterAll(async()=>{await connection?.sql.end();});
type Q=Parameters<Parameters<NonNullable<typeof connection>['sql']['begin']>[1]>[0];
type Fixture={cui?:string;name:string;country:string|null;foreign?:boolean;foreignId?:string};
async function entity(q:Q,e:Fixture){
 const [row]=await q`insert into core.entities(cui_canonical,cui_valid,name_display,name_normalized,country_code,is_foreign,foreign_id_raw,foreign_id_norm)
  values(${e.cui??null},${e.cui!=null},${e.name},${e.name.toLowerCase()},${e.country},${e.foreign??false},${e.foreignId??null},${e.foreignId??null}) returning id::text id`;
 return String(row!.id);
}
const countryOf=async(q:Q,id:string)=>(await q`select country_code from core.entities where id=${id}`)[0]!.country_code as string|null;
let n=994_000_000;
async function contract(q:Q,winner:string){
 const id=String(++n);
 await q`insert into core.contracts(id,raw_id,ca_notice_contract_id,contract_value,currency,title) values(${id},${id},${id},1000,'RON','Contract')`;
 await q`insert into core.contract_winners(contract_id,entity_id) values(${id},${winner})`;
 return id;
}
/** The keys the web binds monitorings and connections to (readMonitoringBindings):
 * a valid CUI is compared alone (sameMonitoringEntity, connectionIdentity). */
const cuiKey=async(q:Q,id:string)=>(await q`select case when cui_valid then cui_canonical end cui from core.entities where id=${id}`)[0]!.cui as string|null;
// Data audit F26, owner decision step 3 (iii). Shapes from the 1 October snapshot:
// Transelectrica 2146462 (CUI 13328043) stored as DE, BRD 2117892 (361579) as FR,
// Nuclearelectrica 2146509 (10874881) as UK; L3Harris 2164400 (813657805, US) has no
// ONRC record; FRESIA 2051780 (1152147, IT) shares its number with an unrelated SNC.
describe.skipIf(!connection)('Romanian country from an ONRC-corroborated CUI',()=>{
 it('sets RO only where ONRC registers the CUI under the firm name, keeps identity keys, once',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.sql.begin(async q=>{
   const transelectrica=await entity(q,{cui:'990001301',name:'COMPANIA NATIONALA DE TRANSPORT AL ENERGIEI ELECTRICE TRANSELECTRICA SA',country:'DE',foreignId:'RO990001301'});
   const brd=await entity(q,{cui:'990001302',name:'BRD GROUPE SOCIETE GENERALE S.A.',country:'FR'});
   const nuclear=await entity(q,{cui:'990001303',name:'Societatea Nationala NUCLEARELECTRICA S.A.',country:'UK'});
   const l3harris=await entity(q,{cui:'990001304',name:'L3HARRIS GLOBAL COMMUNICATIONS, INC.',country:'US'});
   const fresia=await entity(q,{cui:'990001305',name:'FRESIA S.P.A.',country:'IT'});
   // Shares only a legal form and a generic word with its ONRC namesake.
   const generic=await entity(q,{cui:'990001306',name:'Romania Group SRL',country:'AT'});
   // Marked foreign: the conflict stays visible ("țară de verificat").
   const marked=await entity(q,{cui:'990001307',name:'Knorr-Bremse',country:'AT',foreign:true});
   // No valid CUI (Candu Energy 2270125, RO, foreign key RO:7895097): step 3 (i) is not applied here.
   const candu=await entity(q,{name:'Candu Energy Inc.',country:'RO',foreign:true,foreignId:'7895097'});
   const romanian=await entity(q,{cui:'990001308',name:'Firma Romaneasca SRL',country:'RO'});
   await q`insert into reference.onrc_firm(j_number,cui,name,snapshot_date) values
    ('J40/1/2000','990001301','COMPANIA NATIONALA DE TRANSPORT AL ENERGIEI ELECTRICE "TRANSELECTRICA" SA','2026-07-08'),
    ('J40/2/1990','990001302','BRD - GROUPE SOCIETE GENERALE SA','2026-07-08'),
    ('J40/3/1998','990001303','SOCIETATEA NATIONALA "NUCLEARELECTRICA" SA','2026-07-08'),
    ('J6/1/1995','990001305','CAMINSCHI SNC','2026-07-08'),
    ('J40/4/2010','990001306','GRUP ROMANIA SRL','2026-07-08'),
    ('J40/5/2005','990001307','KNORR-BREMSE SRL','2026-07-08'),
    ('J40/6/2005','990001308','FIRMA ROMANEASCA SRL','2026-07-08')`;
   const won=[await contract(q,transelectrica),await contract(q,nuclear)];
   const hashes=async()=>(await readContractIdentityMembers(q,won)).map(r=>r.snapshot_hash);
   const hashesBefore=await hashes();
   const keysBefore=await Promise.all([transelectrica,brd,nuclear].map(id=>cuiKey(q,id)));

   const fixture=new Set([transelectrica,brd,nuclear,l3harris,fresia,generic,marked,candu,romanian]);
   const changed=(await applyRegistryRomanianCountries(q)).filter(c=>fixture.has(String(c.id)));
   expect(changed.map(c=>[String(c.id),c.previous]).sort()).toEqual([[transelectrica,'DE'],[brd,'FR'],[nuclear,'UK']].sort());
   for(const id of [transelectrica,brd,nuclear,romanian])expect(await countryOf(q,id),id).toBe('RO');
   expect(await countryOf(q,l3harris)).toBe('US');
   expect(await countryOf(q,fresia)).toBe('IT');
   expect(await countryOf(q,generic)).toBe('AT');
   expect(await countryOf(q,marked)).toBe('AT');
   expect(await countryOf(q,candu)).toBe('RO');
   // The approved contract-identity hashes and the CUI bindings do not change.
   expect(await hashes()).toEqual(hashesBefore);
   expect(await Promise.all([transelectrica,brd,nuclear].map(id=>cuiKey(q,id)))).toEqual(keysBefore);
   const [flags]=await q`select count(*)::int n from core.entities where id=any(${[...fixture]}::bigint[]) and is_foreign`;
   expect(flags!.n).toBe(2);

   expect((await applyRegistryRomanianCountries(q)).filter(c=>fixture.has(String(c.id)))).toEqual([]);
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('is applied by the nightly normalize stage',async()=>{
  const {db,sql}=connection!;
  const [before]=await sql`select count(*)::int n from core.entities where cui_canonical='990001311'`;
  if(before!.n)throw Error('Fixture CUI already present in the test database');
  const ids:string[]=[];
  try{
   await sql.begin(async q=>{
    ids.push(await entity(q,{cui:'990001311',name:'Societatea Nationala NUCLEARELECTRICA S.A.',country:'UK'}));
    await q`insert into reference.onrc_firm(j_number,cui,name,snapshot_date) values('J40/9/1998','990001311','SOCIETATEA NATIONALA NUCLEARELECTRICA SA','2026-07-08')`;
   });
   const report=await runNormalize(db,sql);
   expect(report.registryCountries).toBeGreaterThanOrEqual(1);
   expect(await countryOf(sql as unknown as Q,ids[0]!)).toBe('RO');
   expect((await runNormalize(db,sql)).registryCountries).toBe(0);
  }finally{
   await sql`delete from reference.onrc_firm where cui='990001311'`;
   await sql`delete from core.entities where id=any(${ids}::bigint[])`;
  }
 });
});
