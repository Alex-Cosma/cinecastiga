import {afterAll,expect,it} from 'vitest';
import {createDb,TRANSACTION_MART_BUILD_INDEXES} from '@seap/db';
import {buildTransactionMarts} from './transaction-marts.js';
const url=process.env['TEST_DATABASE_URL'];
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;
afterAll(async()=>{await connection?.sql.end({timeout:5});});
// Ask rollups (plan D2) and the covering twins are part of the daily DA build:
// the same accepted population as the ask engine, rebuilt on every run.
it.skipIf(!connection)('builds the Ask rollups and the covering indexes with every DA build',async()=>{
 const rollback=Error('rollback fixture');
 await expect(connection!.sql.begin(async q=>{
  const entity=async(name:string,county:string|null)=>{
   const [row]=await q`insert into core.entities(name_display,name_normalized,county) values(${name},${name.toLowerCase()},${county}) returning id`;
   return String(row!.id);
  };
  await q`insert into core.cpv_codes(code,name_ro,revision,division) values
   ('33600000-6','Produse farmaceutice','2008','33'),('45000000-7','Lucrari de constructii','2008','45') on conflict (code) do nothing`;
  const cluj=await entity('Spital Cluj','Cluj'),iasi=await entity('Primaria Iasi','Iasi');
  const a=await entity('Furnizor A','Ilfov'),b=await entity('Furnizor B',null);
  await q`insert into core.direct_acquisitions(sicap_da_id,authority_entity_id,supplier_entity_id,closing_value,state,finalization_date,cpv_code) values
   (17001,${cluj},${a},900.50,'Oferta acceptata','2025-03-20','33600000-6'),
   (17002,${cluj},${a},100,'Oferta acceptata','2025-09-21','33600000-6'),
   (17003,${cluj},${b},2000000,'Oferta acceptata','2024-09-22','45000000-7'),
   (17004,${iasi},${b},2000000.01,'Oferta acceptata','2024-09-23','45000000-7'),
   (17005,${iasi},${a},0,'Oferta acceptata','2024-09-24','45000000-7'),
   (17006,${iasi},${a},70,'Oferta refuzata','2024-09-25','45000000-7'),
   (17007,${iasi},${iasi},30,'Oferta acceptata','2024-09-26',null)`;
  const first=await buildTransactionMarts(q);
  expect(first.buildIndexes).toEqual(['da_tx_supplier_cover_idx','da_tx_authority_cover_idx']);
  const ids=new Set([cluj,iasi,a,b]);
  const own=<T extends Record<string,unknown>>(rows:T[],key:keyof T)=>rows.filter(r=>ids.has(String(r[key]))).map(r=>({...r}));
  // Only accepted, positive DAs up to the 2M ceiling; the authority as its own supplier has no supplier.
  expect(own(await q`select role,eid::text,y,src,county,nm,v::text,n::int from marts.agg_entity_year order by role,eid::bigint,y`,'eid')).toEqual([
   {role:'authority',eid:cluj,y:'2024',src:'da',county:'Cluj',nm:'Spital Cluj',v:'2000000',n:1},
   {role:'authority',eid:cluj,y:'2025',src:'da',county:'Cluj',nm:'Spital Cluj',v:'1000.50',n:2},
   {role:'authority',eid:iasi,y:'2024',src:'da',county:'Iasi',nm:'Primaria Iasi',v:'30',n:1},
   {role:'supplier',eid:a,y:'2025',src:'da',county:'Cluj',nm:'Furnizor A',v:'1000.50',n:2},
   {role:'supplier',eid:b,y:'2024',src:'da',county:'Cluj',nm:'Furnizor B',v:'2000000',n:1},
  ]);
  expect(own(await q`select authority_id::text,supplier_id::text,y,v::text,n::int from marts.agg_pair_year order by authority_id::bigint,supplier_id::bigint nulls last,y`,'authority_id')).toEqual([
   {authority_id:cluj,supplier_id:a,y:'2025',v:'1000.50',n:2},
   {authority_id:cluj,supplier_id:b,y:'2024',v:'2000000',n:1},
   {authority_id:iasi,supplier_id:null,y:'2024',v:'30',n:1},
  ]);
  const [cpv]=await q`select coalesce(sum(v),0)::text v, coalesce(sum(n),0)::int n from marts.agg_cpv_year`;
  const [national]=await q`select coalesce(sum(v_plaf),0)::text v, coalesce(sum(n_plaf),0)::int n from marts.agg_national`;
  expect(cpv).toEqual(national);
  const indexes=async()=>(await q`select indexname name,indexdef definition from pg_indexes where schemaname='marts'
   and indexname=any(${TRANSACTION_MART_BUILD_INDEXES.map(i=>i.name)}::text[]) order by indexname collate "C"`).map(r=>({...r}));
  const expected=TRANSACTION_MART_BUILD_INDEXES.map(({name,definition})=>({name,definition})).sort((x,y)=>x.name<y.name?-1:1);
  expect(await indexes()).toEqual(expected);
  // The next night drops and builds them again, and the rollups with them.
  const second=await buildTransactionMarts(q);
  expect(second.rollups).toEqual(first.rollups);
  expect(await indexes()).toEqual(expected);
  throw rollback;
 })).rejects.toBe(rollback);
});
