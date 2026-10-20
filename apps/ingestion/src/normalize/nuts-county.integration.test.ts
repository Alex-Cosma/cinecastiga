import {afterAll,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {applyNutsCounties} from './nuts-county.js';
import {runNormalize} from './pipeline.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;
afterAll(async()=>{await connection?.sql.end();});
type Q=Parameters<Parameters<NonNullable<typeof connection>['sql']['begin']>[1]>[0];
async function entity(q:Q,e:{cui?:string;name:string;county?:string|null;nuts?:string|null;country?:string|null;foreign?:boolean}){
 const [row]=await q`insert into core.entities(cui_canonical,cui_valid,name_display,name_normalized,county,nuts_code,country_code,is_foreign)
  values(${e.cui??null},${e.cui!=null},${e.name},${e.name.toLowerCase()},${e.county??null},${e.nuts??null},${e.country===undefined?'RO':e.country},${e.foreign??false}) returning id`;
 return BigInt(row!.id);
}
async function countyOf(q:Q,id:bigint){
 const [row]=await q`select county from core.entities where id=${id.toString()}`;
 return row!.county as string|null;
}
// Data audit F13: CNIR 2161607 (RO321), Electrocentrale Craiova 2161549 (RO411),
// Constanta South Container Terminal 2161587 (RO223), ADI Ialomița Vest 2165912 (RO315).
describe.skipIf(!connection)('county from the NUTS-3 code',()=>{
 it('fills only Romanian entities without a county, unless ONRC contradicts it, once',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.sql.begin(async q=>{
   await q`create table if not exists reference.onrc_firm(j_number text primary key,cui text,name text not null,legal_form text,county text,locality text,snapshot_date date not null)`;
   const cnir=await entity(q,{cui:'990000001',name:'COMPANIA NATIONALA DE INVESTITII RUTIERE S.A.',nuts:'RO321'});
   const craiova=await entity(q,{cui:'990000002',name:'Societatea Electrocentrale Craiova SA',nuts:'RO411 Dolj'});
   const agrees=await entity(q,{cui:'990000003',name:'Constanta South Container Terminal SRL',nuts:'RO223'});
   const contradicted=await entity(q,{cui:'990000004',name:'Firma cu sediul ONRC in alt judet',nuts:'RO213'});
   const known=await entity(q,{cui:'990000005',name:'Autoritate cu judet din adresa SICAP',county:'Bucuresti',nuts:'RO411'});
   const region=await entity(q,{name:'Autoritate cu cod NUTS-2',nuts:'RO32 Bucureşti-Ilfov'});
   const foreign=await entity(q,{name:'Foreign supplier',nuts:'RO321',country:'MD',foreign:true});
   const unknownCountry=await entity(q,{name:'Tara necunoscuta',nuts:'RO321',country:null});
   const noNuts=await entity(q,{cui:'990000006',name:'ADI fara cod NUTS'});
   await q`insert into reference.onrc_firm(j_number,cui,name,county,snapshot_date) values
    ('J13/1/2001','990000003','CONSTANTA SOUTH CONTAINER TERMINAL SRL','Constanţa','2026-07-08'),
    ('J22/1/2001','990000004','FIRMA','Suceava','2026-07-08')`;
   const filled=await applyNutsCounties(q);
   expect([...filled].sort()).toEqual([cnir,craiova,agrees].sort());
   expect(await countyOf(q,cnir)).toBe('Bucuresti');
   expect(await countyOf(q,craiova)).toBe('Dolj');
   expect(await countyOf(q,agrees)).toBe('Constanta');
   for(const id of [contradicted,region,foreign,unknownCountry,noNuts])expect(await countyOf(q,id)).toBeNull();
   expect(await countyOf(q,known)).toBe('Bucuresti');
   expect(await applyNutsCounties(q)).toEqual([]);
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('is applied by the nightly normalize stage before the marts copy counties',async()=>{
  const {db,sql}=connection!;
  const [before]=await sql`select count(*)::int n from core.entities where cui_canonical='990000011'`;
  if(before!.n)throw Error('Fixture CUI already present in the test database');
  let id:bigint|null=null;
  try{
   id=await sql.begin(q=>entity(q,{cui:'990000011',name:'ADI Ialomita Vest',nuts:'RO315'}));
   const report=await runNormalize(db,sql);
   expect(report.nutsCounties).toBeGreaterThanOrEqual(1);
   expect(await countyOf(sql as unknown as Q,id)).toBe('Ialomita');
   expect((await runNormalize(db,sql)).nutsCounties).toBe(0);
  }finally{
   if(id!=null)await sql`delete from core.entities where id=${id.toString()}`;
  }
 });
});
