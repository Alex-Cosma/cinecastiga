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
  const a=await entity('Furnizor A','Ilfov'),b=await entity('Furnizor B',null),c=await entity('Furnizor C',null);
  await q`insert into core.direct_acquisitions(sicap_da_id,authority_entity_id,supplier_entity_id,closing_value,state,finalization_date,cpv_code) values
   (17008,null,${c},40,'Oferta acceptata','2025-03-22','33600000-6'),
   (17001,${cluj},${a},900.50,'Oferta acceptata','2025-03-20','33600000-6'),
   (17002,${cluj},${a},100,'Oferta acceptata','2025-09-21','33600000-6'),
   (17003,${cluj},${b},2000000,'Oferta acceptata','2024-09-22','45000000-7'),
   (17004,${iasi},${b},2000000.01,'Oferta acceptata','2024-09-23','45000000-7'),
   (17005,${iasi},${a},0,'Oferta acceptata','2024-09-24','45000000-7'),
   (17006,${iasi},${a},70,'Oferta refuzata','2024-09-25','45000000-7'),
   (17007,${iasi},${iasi},30,'Oferta acceptata','2024-09-26',null)`;
  const first=await buildTransactionMarts(q);
  expect(first.buildIndexes).toEqual(['da_tx_supplier_cover_idx','da_tx_authority_cover_idx','da_tx_cpv_cover_idx']);
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
  // The month grain of the same rows (F2, the trend's same months); the years above are grouped from it.
  expect(own(await q`select role,eid::text,y,m,v::text,n::int from marts.agg_entity_month order by role,eid::bigint,y,m`,'eid')).toEqual([
   {role:'authority',eid:cluj,y:'2024',m:'09',v:'2000000',n:1},
   {role:'authority',eid:cluj,y:'2025',m:'03',v:'900.50',n:1},
   {role:'authority',eid:cluj,y:'2025',m:'09',v:'100',n:1},
   {role:'authority',eid:iasi,y:'2024',m:'09',v:'30',n:1},
   {role:'supplier',eid:a,y:'2025',m:'03',v:'900.50',n:1},
   {role:'supplier',eid:a,y:'2025',m:'09',v:'100',n:1},
   {role:'supplier',eid:b,y:'2024',m:'09',v:'2000000',n:1},
  ]);
  expect(first.rollups.agg_entity_month).toBeGreaterThanOrEqual(first.rollups.agg_entity_year);
  // The first and last day of each group (F2, a trend group's source drawer), equal to the live min/max of its rows.
  expect(own(await q`select role,eid::text,y,d0,d1 from marts.agg_entity_year order by role,eid::bigint,y`,'eid')).toEqual([
   {role:'authority',eid:cluj,y:'2024',d0:'2024-09-22',d1:'2024-09-22'},
   {role:'authority',eid:cluj,y:'2025',d0:'2025-03-20',d1:'2025-09-21'},
   {role:'authority',eid:iasi,y:'2024',d0:'2024-09-26',d1:'2024-09-26'},
   {role:'supplier',eid:a,y:'2025',d0:'2025-03-20',d1:'2025-09-21'},
   {role:'supplier',eid:b,y:'2024',d0:'2024-09-22',d1:'2024-09-22'},
  ]);
  const [days]=await q`select count(*)::int differ from (
    select r.role, r.eid, left(d.finalization_date,4) y, d.src, min(left(d.finalization_date,10)) d0, max(left(d.finalization_date,10)) d1
    from (select authority_id, supplier_id, finalization_date, 'da'::text src from marts.da_transactions where closing_value > 0 and closing_value <= 2000000
          union all select authority_id, supplier_id, finalization_date, 'contracts' from marts.contract_transactions where closing_value > 0) d
    cross join lateral (values ('authority'::text, d.authority_id), ('supplier'::text, d.supplier_id)) r(role, eid)
    where r.eid is not null group by 1, 2, 3, 4) live
    full join (select role, eid, y, src, min(d0) d0, max(d1) d1 from marts.agg_entity_year group by 1, 2, 3, 4) rolled using (role, eid, y, src)
    where live.d0 is distinct from rolled.d0 or live.d1 is distinct from rolled.d1`;
  expect(days!.differ).toBe(0);
  expect((await q`select left(min(d0),7) m0, left(max(d1),7) m1 from marts.agg_entity_month where eid=${cluj}::bigint and role='authority' and y='2025'`).map(r=>({...r}))).toEqual([{m0:'2025-03',m1:'2025-09'}]);
  expect(own(await q`select authority_id::text,supplier_id::text,y,d0,d1 from marts.agg_pair_year order by authority_id::bigint,supplier_id::bigint nulls last,y`,'authority_id')).toEqual([
   {authority_id:cluj,supplier_id:a,y:'2025',d0:'2025-03-20',d1:'2025-09-21'},
   {authority_id:cluj,supplier_id:b,y:'2024',d0:'2024-09-22',d1:'2024-09-22'},
   {authority_id:iasi,supplier_id:null,y:'2024',d0:'2024-09-26',d1:'2024-09-26'},
  ]);
  expect(own(await q`select authority_id::text,supplier_id::text,y,v::text,n::int from marts.agg_pair_year order by authority_id::bigint,supplier_id::bigint nulls last,y`,'authority_id')).toEqual([
   {authority_id:cluj,supplier_id:a,y:'2025',v:'1000.50',n:2},
   {authority_id:cluj,supplier_id:b,y:'2024',v:'2000000',n:1},
   {authority_id:iasi,supplier_id:null,y:'2024',v:'30',n:1},
  ]);
  // The county-month grain (F2 review: the county trend on the same months) = the live grouping of every row,
  // with its first and last day; 17007, whose supplier is its own authority, counts in Iasi, and 17008, without
  // an authority (so in no entity month, and without a county), counts too.
  const [countyMonths]=await q`select count(*)::int differ from (
    select d.src, left(d.finalization_date,4) y, substr(d.finalization_date,6,2) m, d.county, sum(d.closing_value) v, count(*)::bigint n,
           min(left(d.finalization_date,10)) d0, max(left(d.finalization_date,10)) d1
    from (select county, finalization_date, closing_value, 'da'::text src from marts.da_transactions where closing_value > 0 and closing_value <= 2000000
          union all select county, finalization_date, closing_value, 'contracts' from marts.contract_transactions where closing_value > 0) d
    group by 1, 2, 3, 4) live
    full join marts.agg_county_month rolled on live.src = rolled.src and live.y is not distinct from rolled.y
      and live.m is not distinct from rolled.m and live.county is not distinct from rolled.county
    where (live.v, live.n, live.d0, live.d1) is distinct from (rolled.v, rolled.n, rolled.d0, rolled.d1)`;
  expect(countyMonths!.differ).toBe(0);
  expect((await q`select src,y,m,county,v::text,n::int from marts.agg_county_month where county in ('Cluj','Iasi') order by y,m,county`).map(r=>({...r}))).toEqual([
   {src:'da',y:'2024',m:'09',county:'Cluj',v:'2000000',n:1},
   {src:'da',y:'2024',m:'09',county:'Iasi',v:'30',n:1},
   {src:'da',y:'2025',m:'03',county:'Cluj',v:'900.50',n:1},
   {src:'da',y:'2025',m:'09',county:'Cluj',v:'100',n:1},
  ]);
  expect((await q`select src,y,m,v::text,n::int,d0,d1 from marts.agg_county_month where county is null`).map(r=>({...r})))
   .toEqual([{src:'da',y:'2025',m:'03',v:'40',n:1,d0:'2025-03-22',d1:'2025-03-22'}]);
  // The first and last key of each year's direct acquisitions (S5 PRE-trend), over every row: the table's two ends, every
  // code of SEAP's form; 17008 without an authority and 17004 above the ceiling are inside their years.
  const keys=(await q`select y,k0::text,k1::text,n::int,odd_codes::int from marts.agg_da_year_keys order by y`).map(r=>({...r}));
  expect(keys).toEqual((await q`select substr(finalization_date,1,4) y,min(sicap_da_id)::text k0,max(sicap_da_id)::text k1,count(*)::int n,
    count(*) filter (where da_code is null or da_code !~ '^DA[0-9]+$')::int odd_codes from marts.da_transactions group by 1 order by 1`).map(r=>({...r})));
  const ends:Record<string,[number,number]>={'2024':[17003,17007],'2025':[17001,17008]};
  expect(keys.filter(k=>String(k['y']) in ends).map(k=>[k['y'],Number(k['k0'])<=ends[String(k['y'])]![0],Number(k['k1'])>=ends[String(k['y'])]![1]]))
   .toEqual([['2024',true,true],['2025',true,true]]);
  expect(first.rollups.agg_da_year_keys).toBe(keys.length);
  expect(first.buildIndexesMs).toBeGreaterThanOrEqual(0);
  expect(first.yearKeysMs).toBeGreaterThanOrEqual(0);
  const [cpv]=await q`select coalesce(sum(v),0)::text v, coalesce(sum(n),0)::int n from marts.agg_cpv_year`;
  const [national]=await q`select coalesce(sum(v_plaf),0)::text v, coalesce(sum(n_plaf),0)::int n from marts.agg_national`;
  expect(cpv).toEqual(national);
  // The first and last date of each group (the source drawer's period); 17003 at the ceiling counts.
  expect((await q`select src,y,county,cpv_code,left(d0,10) d0,left(d1,10) d1 from marts.agg_cpv_year where county in ('Cluj','Iasi') order by y,county,cpv_code`).map(r=>({...r}))).toEqual([
   {src:'da',y:'2024',county:'Cluj',cpv_code:'45000000-7',d0:'2024-09-22',d1:'2024-09-22'},
   {src:'da',y:'2024',county:'Iasi',cpv_code:null,d0:'2024-09-26',d1:'2024-09-26'},
   {src:'da',y:'2025',county:'Cluj',cpv_code:'33600000-6',d0:'2025-03-20',d1:'2025-09-21'},
  ]);
  // The county card: per scope, channel and county the total, the largest buyer and the largest
  // record, as a live grouping of the same rows gives them (only the ceiling scope sees 17004 cut).
  const card=async(scope:string,channel:string,county:string)=>{
   const [row]=await q`select v::text,n::int,top_buyer_id::text,top_buyer_name,top_buyer_v::text,top_record_src,top_record_id::text,top_record_v::text
     from marts.agg_map_county_top where scope=${scope} and channel=${channel} and county=${county}`;
   return row?{...row}:null;
  };
  expect(await card('plaf','all','Cluj')).toEqual({v:'2001000.50',n:3,top_buyer_id:cluj,top_buyer_name:'Spital Cluj',top_buyer_v:'2001000.50',top_record_src:'da',top_record_id:'17003',top_record_v:'2000000'});
  expect(await card('plaf','all','Iasi')).toEqual({v:'30',n:1,top_buyer_id:iasi,top_buyer_name:'Primaria Iasi',top_buyer_v:'30',top_record_src:'da',top_record_id:'17007',top_record_v:'30'});
  expect(await card('all','all','Iasi')).toEqual({v:'2000030.01',n:2,top_buyer_id:iasi,top_buyer_name:'Primaria Iasi',top_buyer_v:'2000030.01',top_record_src:'da',top_record_id:'17004',top_record_v:'2000000.01'});
  expect(await card('plaf','contracts','Cluj')).toBeNull();
  const [mapTotals]=await q`select count(*)::int differ from marts.agg_map_county_top t join marts.agg_map_county m using (county)
    where t.channel='all' and ((t.scope='plaf' and (t.v,t.n) is distinct from (m.v_plaf,m.n_plaf)) or (t.scope='all' and (t.v,t.n) is distinct from (m.v_all,m.n_all)))`;
  expect(mapTotals!.differ).toBe(0);
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
