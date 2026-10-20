import {afterAll,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {applyReviewedEntityNames} from './reviewed-entity-names.js';
import {runNormalize} from './pipeline.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;
afterAll(async()=>{await connection?.sql.end();});
type Q=Parameters<Parameters<NonNullable<typeof connection>['sql']['begin']>[1]>[0];
async function entity(q:Q,cui:string,name:string,normalized:string,ids:[string,number][]){
 const [row]=await q`insert into core.entities(cui_canonical,cui_valid,name_display,name_normalized,legal_form,county)
  values(${cui},true,${name},${normalized},'srl','Dolj') returning id`;
 for(const [namespace,sicapId] of ids)await q`insert into core.entity_sicap_ids(entity_id,namespace,sicap_id) values(${row!.id},${namespace},${sicapId})`;
 return BigInt(row!.id);
}
async function nameOf(q:Q,id:bigint){
 const [row]=await q`select name_display,name_normalized,legal_form from core.entities where id=${id.toString()}`;
 return row;
}
// Data audit F04: entity 2032782 (CUI 14491102) and 1968696 (CUI 3552050) in production.
describe.skipIf(!connection)('reviewed authority names',()=>{
 it('renames only the exact registrations, once, and leaves the private firm alone',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.sql.begin(async q=>{
   const oltenia=await entity(q,'14491102','SC TONIDRAG INSTAL SRL-D','tonidrag instal d',[['authority',1417],['supplier',179348]]);
   const tonidrag=await entity(q,'35637856','TONIDRAG INSTAL SRL-D','tonidrag instal d',[['supplier',183343]]);
   // Same CUI and wrong name, but without the reviewed supplier registration.
   const gagesti=await entity(q,'3552050','ANDREI TEHNOMETAL','andrei tehnometal',[['authority',25355]]);
   expect(await applyReviewedEntityNames(q)).toEqual([oltenia]);
   expect(await nameOf(q,oltenia)).toEqual({name_display:'DISTRIBUTIE ENERGIE OLTENIA S.A.',name_normalized:'distributie energie oltenia',legal_form:'sa'});
   expect((await nameOf(q,tonidrag))?.name_display).toBe('TONIDRAG INSTAL SRL-D');
   expect((await nameOf(q,gagesti))?.name_display).toBe('ANDREI TEHNOMETAL');
   expect(await applyReviewedEntityNames(q)).toEqual([]);
   const [ids]=await q`select count(*)::int n from core.entity_sicap_ids where entity_id=${oltenia.toString()}`;
   expect(ids!.n).toBe(2);
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('is applied by the nightly normalize stage before the marts read names',async()=>{
  const {db,sql}=connection!;
  const [before]=await sql`select count(*)::int n from core.entities where cui_canonical='3552050'`;
  if(before!.n)throw Error('Fixture CUI already present in the test database');
  let id:bigint|null=null;
  try{
   id=await sql.begin(q=>entity(q,'3552050','ANDREI TEHNOMETAL','andrei tehnometal',[['authority',25355],['supplier',100116354]]));
   const report=await runNormalize(db,sql);
   expect(report.reviewedNames).toBe(1);
   expect((await nameOf(sql as unknown as Q,id))?.name_display).toBe('COMUNA GAGESTI (CONSILIUL LOCAL)');
   expect((await runNormalize(db,sql)).reviewedNames).toBe(0);
  }finally{
   if(id!=null)await sql`delete from core.entities where id=${id.toString()}`;
  }
 });
});
