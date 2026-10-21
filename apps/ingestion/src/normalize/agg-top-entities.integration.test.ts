import {afterAll,expect,it} from 'vitest';
import {createDb} from '@seap/db';
import {buildTransactionMarts} from './transaction-marts.js';
const url=process.env['TEST_DATABASE_URL'];
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;
afterAll(async()=>{await connection?.sql.end({timeout:5});});
// Data audit F16: the unfiltered supplier ranking showed max() over the buyers'
// counties (Alliance Healthcare 2128212 'Vrancea', Constructii Erbasu 2124463
// 'Tulcea') instead of the supplier's own county shown by every filtered question.
it.skipIf(!connection)('gives each ranked entity its own county, never a buyer county',async()=>{
 const rollback=Error('rollback fixture');
 await expect(connection!.sql.begin(async q=>{
  const entity=async(name:string,county:string|null)=>{
   const [row]=await q`insert into core.entities(name_display,name_normalized,county) values(${name},${name.toLowerCase()},${county}) returning id`;
   return String(row!.id);
  };
  const capital=await entity('Autoritate Bucuresti','Bucuresti'),vrancea=await entity('Autoritate Vrancea','Vrancea');
  const supplier=await entity('Furnizor Ilfov','Ilfov'),unknown=await entity('Furnizor fara judet',null);
  await q`insert into core.direct_acquisitions(sicap_da_id,authority_entity_id,supplier_entity_id,closing_value,state,finalization_date) values
   (16001,${capital},${supplier},900,'Oferta acceptata','2026-09-20'),
   (16002,${vrancea},${supplier},100,'Oferta acceptata','2026-09-21'),
   (16003,${vrancea},${unknown},50,'Oferta acceptata','2026-09-22')`;
  // The ranking reads the same entity_profile county as the live Ask table.
  await q`insert into marts.entity_profile(entity_id,role,county) values
   (${capital},'authority','Bucuresti'),(${vrancea},'authority','Vrancea'),
   (${supplier},'supplier','Ilfov'),(${unknown},'supplier',null)`;
  await buildTransactionMarts(q);
  const rows=await q`select role,eid::text,county,v_plaf::text from marts.agg_top_entities order by role,eid`;
  expect(rows.map(r=>({...r}))).toEqual([
   {role:'authority',eid:capital,county:'Bucuresti',v_plaf:'900'},
   {role:'authority',eid:vrancea,county:'Vrancea',v_plaf:'150'},
   {role:'supplier',eid:supplier,county:'Ilfov',v_plaf:'1000'},
   {role:'supplier',eid:unknown,county:null,v_plaf:'50'},
  ]);
  throw rollback;
 })).rejects.toBe(rollback);
});
