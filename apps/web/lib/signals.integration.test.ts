import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createDb,validateSignalLookup,type DbSql} from '@seap/db';
import {readFile} from 'node:fs/promises';
import {parseSignalState,readSignalOverview,readSignalPage,readSignalRiskGroup,readSignalTypeCounts,readRiskCriteriaDistribution,readEntitySignalCounts} from './signals';
const url=process.env.TEST_SIGNAL_DATABASE_URL;
if(url && !/^\/seap_test_(signals|audit_[a-z0-9_]+)$/.test(new URL(url).pathname)) throw Error('Dedicated seap_test_signals (or fresh seap_test_audit_*) database required');
const sql=url?createDb(url).sql:null;
const precisionMigration=await readFile(new URL('../../../packages/db/migrations/0044_signal_sort_precision.sql',import.meta.url),'utf8');
const recordedValueMigration=await readFile(new URL('../../../packages/db/migrations/0076_signal_lookup_recorded_value.sql',import.meta.url),'utf8');
const selfSupplierMigration=await readFile(new URL('../../../packages/db/migrations/0078_signal_lookup_self_supplier.sql',import.meta.url),'utf8');
const lookupMigration=await readFile(new URL('../../../packages/db/migrations/0043_complete_signal_lookup.sql',import.meta.url),'utf8');
const migration=await readFile(new URL('../../../packages/db/migrations/0042_signal_lookup_indexes.sql',import.meta.url),'utf8');
afterAll(async()=>{await sql?.end()});
describe.skipIf(!sql)('complete signal queries on PostgreSQL',()=>{
 beforeAll(async()=>{
  await sql!.unsafe(`drop schema if exists core cascade; drop schema if exists marts cascade;
   create schema core; create schema marts; create extension if not exists unaccent;
   create table core.entities(id bigint primary key,name_display text,county text);
   create table core.flags(id bigint primary key,flag_code text,subject_type text,subject_id bigint,partner_id bigint,triggered boolean,severity real,evidence jsonb,period text,methodology_version text);
   create table core.direct_acquisitions(id bigint primary key,sicap_da_id bigint,authority_entity_id bigint,supplier_entity_id bigint,closing_value numeric);
   create table core.awards(id bigint primary key,ca_notice_id bigint,authority_entity_id bigint,ron_contract_value numeric);
   create table core.contracts(id bigint primary key,ca_notice_id bigint);
   create table core.contract_winners(contract_id bigint,entity_id bigint,primary key(contract_id,entity_id));
   create table marts.entity_flags(entity_id bigint,role text,name_display text,county text,cri numeric,n_flags int,n_das int,total_ron numeric,flags jsonb);
   insert into core.entities values(1,'Autoritate Cluj','Cluj'),(2,'Autoritate Buzău','Buzău'),(11,'Furnizor Cluj','Cluj'),(12,'Furnizor Buzău','Buzau');
   insert into core.direct_acquisitions select i,100000+i,case when i=625 then null else 1 end,case when i=624 then null when i=623 then 12 else 11 end,i*100 from generate_series(1,625) i;
   insert into core.flags select i,'da_rapid','da',i,null,true,0.5,jsonb_build_object('minutes',5,'closing',i*100),'2025','test' from generate_series(1,625) i;
   insert into core.flags values(1000,'da_round','da',1,null,true,0.99,'{"closing":270119.999999,"ceiling":270120}','2025','test'),
    (1001,'da_rapid','da',1,null,false,1,'{}','2025','test'),(1002,'da_rapid','da',9999,null,true,1,'{}','2025','test'),
    (1003,'da_split','pair',1,12,true,0.5,'{"total":100000}','2025','test'),(1004,'da_split','pair',1,null,true,0.5,'{"total":200000}','2025','test'),
    (1005,'fin_public_reliance','supplier',12,null,true,0.9,'{"public_total":1000000}','all','test');
   insert into core.awards values(10,10010,1,1000000),(11,10011,2,2000000),(12,10012,null,3000000),(13,10013,1,4000000);
   insert into core.contracts values(101,10010),(102,10010),(103,10011),(104,10012);
   insert into core.contract_winners values(101,11),(101,12),(102,11),(103,11),(104,12);
   insert into core.flags select 2000+id,'award_single_bid','award',id,null,true,0.5,'{}','2025','test' from core.awards;
   insert into marts.entity_flags values (1,'authority','Autoritate Cluj','Cluj',0.6,3,100,100000,'["da_split","da_round","da_year_end"]'),(2,'authority','Autoritate Buzău','Buzău',0.2,1,100,100000,'["da_split"]'),(11,'supplier','Furnizor Cluj','Cluj',0.25,1,100,100000,'["da_rapid"]');`);
  for(const statement of migration.split('--> statement-breakpoint')) await sql!.unsafe(statement);
  for(const statement of lookupMigration.split('--> statement-breakpoint')) await sql!.unsafe(statement);
  for(const statement of precisionMigration.split('--> statement-breakpoint')) await sql!.unsafe(statement);
  for(const statement of recordedValueMigration.split('--> statement-breakpoint')) await sql!.unsafe(statement);
  for(const statement of selfSupplierMigration.split('--> statement-breakpoint')) await sql!.unsafe(statement);
 });
 it('accepts identical prebuilt indexes and rejects a different index with the same name',async()=>{
  for(const statement of migration.split('--> statement-breakpoint')) await sql!.unsafe(statement);
  await expect(sql!.begin(async tx=>{
   await tx`drop index core.flags_signal_subject_idx`;
   await tx`create index flags_signal_subject_idx on core.flags(id)`;
   for(const statement of migration.split('--> statement-breakpoint')) await tx.unsafe(statement);
  })).rejects.toThrow('Unexpected or invalid index');
 });
 it('counts every occurrence beyond 500, preserving missing endpoints, untriggered exclusions and orphan exclusion',async()=>{
  const authority=await readSignalOverview(sql!,parseSignalState({}));
  expect(authority.counts).toEqual({da_rapid:624,da_round:1,da_split:2,award_single_bid:3});
  const supplier=await readSignalOverview(sql!,parseSignalState({rol:'supplier'}));
  expect(supplier.counts).toEqual({da_rapid:624,da_round:1,da_split:1,award_single_bid:3,fin_public_reliance:1});
 });
 it('scopes counties to the correct endpoint and counts a consortium once per notice',async()=>{
  const buyer=await readSignalOverview(sql!,parseSignalState({jud:'Buzau'}));
  expect(buyer.counts).toEqual({award_single_bid:1});
  const seller=await readSignalOverview(sql!,parseSignalState({rol:'supplier',jud:'Buzău'}));
  expect(seller.counts).toEqual({da_rapid:1,da_split:1,award_single_bid:2,fin_public_reliance:1});
  expect((await readSignalOverview(sql!,parseSignalState({jud:'Inexistent'}))).counts).toEqual({});
 });
 it('keeps stable complete pagination and enriches the selected rows with evidence',async()=>{
  const first=await readSignalPage(sql!,parseSignalState({tip:'da_rapid'}));
  expect(first.total).toBe(624);expect(first.rows).toHaveLength(10);expect(first.rows[0]?.id).toBe('624');
  expect(first.rows[0]).toMatchObject({period:'2025',methodology:'test',evidence:{minutes:5},sourceId:'100624'});
  const last=await readSignalPage(sql!,parseSignalState({tip:'da_rapid',p:'9999'}));
  expect(last.page).toBe(62);expect(last.rows).toHaveLength(4);expect(last.rows.at(-1)?.id).toBe('1');
  const exact=await readSignalPage(sql!,parseSignalState({tip:'da_round'}));
  expect(exact.rows[0]?.evidence?.closing).toBe('270119.999999');
 });
 it('returns all distinct winners without duplicating a signal or losing unknown-authority membership',async()=>{
  const p=await readSignalPage(sql!,parseSignalState({tip:'award_single_bid',rol:'supplier',jud:'Buzau'}));
  expect(p.total).toBe(2);expect(p.rows.map(r=>r.id)).toEqual(['2012','2010']);
  expect(p.rows[0]?.entityId).toBeNull();
  expect(p.rows[1]?.winners.map(w=>w.entityId)).toEqual(['11','12']);
  const empty=await readSignalPage(sql!,parseSignalState({tip:'da_round',jud:'Inexistent',p:'100'}));
  expect(empty).toMatchObject({total:0,page:0,rows:[]});
 });
 it('refreshes source values atomically without recalculating retained flags',async()=>{
  const before=await sql!`select * from core.flags order by id`;
  const rollback=Error('rollback refresh fixture');
  await expect(sql!.begin(async tx=>{
   await tx`update core.direct_acquisitions set closing_value=123456.789 where id=1`;
   expect((await validateSignalLookup(tx as unknown as DbSql)).mismatches).toBe('2');
   await tx`refresh materialized view marts.signal_lookup`;
   expect((await validateSignalLookup(tx as unknown as DbSql)).mismatches).toBe('0');
   expect((await tx`select total_ron::text value from marts.signal_lookup where id=1`)[0]?.value).toBe('123456.789');
   expect(await tx`select * from core.flags order by id`).toEqual(before);
   throw rollback;
  })).rejects.toBe(rollback);
  expect((await sql!`select total_ron::text value from marts.signal_lookup where id=1`)[0]?.value).toBe('100');
 });
 it('sorts and shows an award signal by its recorded value, falling back to the notice value',async()=>{
  // Audit F23: a 0 notice value is unknown; the signal records the cited contracts' sum instead.
  const rollback=Error('rollback recorded value fixture');
  await expect(sql!.begin(async tx=>{
   await tx`update core.awards set ron_contract_value=0 where id=10`;
   await tx`update core.flags set evidence='{"value":5000000,"value_scope":"confirmed_contracts"}' where id=2010`;
   await tx`refresh materialized view marts.signal_lookup`;
   expect((await validateSignalLookup(tx as unknown as DbSql)).mismatches).toBe('0');
   const rows=await tx`select id::text, total_ron::text value from marts.signal_lookup where subject_type='award' order by total_ron desc, id`;
   expect(rows.map(r=>[r.id,r.value])).toEqual([['2010','5000000'],['2013','4000000'],['2012','3000000'],['2011','2000000']]);
   throw rollback;
  })).rejects.toBe(rollback);
 });
 it('keeps CRI cohort boundaries and county filters',async()=>{
  const group=await readSignalRiskGroup(sql!,parseSignalState({criMin:'0.5',criMax:'0.6',jud:'Cluj'}));
  expect(group.total).toBe(1);expect(group.rows[0]?.entityId).toBe('1');
 });
 it('keeps the new counts-only path identical to the complete overview',async()=>{
  const state=parseSignalState({rol:'supplier',jud:'Buzau'});
  expect(await readSignalTypeCounts(sql!,state)).toEqual((await readSignalOverview(sql!,state)).counts);
 });
 it('counts one entity exactly as /semnale lists it, per role, including award notices it won (audit F24)',async()=>{
  expect(await readEntitySignalCounts(sql!,'11','supplier')).toEqual({da_rapid:623,da_round:1,award_single_bid:2});
  expect(await readEntitySignalCounts(sql!,'12','supplier')).toEqual({da_rapid:1,da_split:1,fin_public_reliance:1,award_single_bid:2});
  expect(await readEntitySignalCounts(sql!,'1','authority')).toEqual({da_rapid:624,da_round:1,da_split:2,award_single_bid:2});
  expect(await readEntitySignalCounts(sql!,'2','authority')).toEqual({award_single_bid:1});
  expect(await readEntitySignalCounts(sql!,'999','supplier')).toEqual({});
  for(const [ent,rol] of [['12','supplier'],['1','authority']] as const){
   const counts=await readEntitySignalCounts(sql!,ent,rol);
   expect(await readSignalTypeCounts(sql!,parseSignalState({rol,ent}))).toEqual(counts);
   for(const [tip,n] of Object.entries(counts)) expect((await readSignalPage(sql!,parseSignalState({tip,rol,ent}))).total).toBe(n);
  }
  const won=await readSignalPage(sql!,parseSignalState({tip:'award_single_bid',rol:'supplier',ent:'11'}));
  expect(won.rows.map(r=>r.id)).toEqual(['2011','2010']);
  expect(won.rows[1]?.winners.map(w=>w.entityId)).toEqual(['11','12']);
  const fin=await readSignalPage(sql!,parseSignalState({tip:'fin_public_reliance',ent:'12'}));
  expect(fin).toMatchObject({total:1});expect(fin.rows[0]).toMatchObject({id:'1005',entityId:'12'});
 });
 it('matches criterion distribution to the exact CRI cohort and preserves the all view',async()=>{
  const state=parseSignalState({view:'cri'});
  expect(await readRiskCriteriaDistribution(sql!,state)).toEqual([{criteria:1,n:1},{criteria:3,n:1}]);
  const all=await readSignalRiskGroup(sql!,state);expect(all.total).toBe(2);
  const selected=await readSignalRiskGroup(sql!,{...state,criteria:3});expect(selected.total).toBe(1);expect(selected.rows[0]?.entityId).toBe('1');
  const empty=await readSignalRiskGroup(sql!,{...state,criteria:0});expect(empty.total).toBe(0);
 });
 it('preserves every decimal of the displayed value outside JS number precision',async()=>{
  const rollback=Error('rollback precise fixture');
  await expect(sql!.begin(async tx=>{
   await tx`update core.direct_acquisitions set closing_value=9007199254740993.123456 where id=1`;
   await tx`refresh materialized view marts.signal_lookup`;
   const q=Object.assign((...args: unknown[]) => (tx as any)(...args), {begin: async (_options: string, run: (db: DbSql) => unknown) => run(tx as unknown as DbSql)}) as unknown as DbSql;
   const page=await readSignalPage(q,parseSignalState({tip:'da_round'}));
   expect(page.rows[0]?.totalExact).toBe('9007199254740993.123456');
   throw rollback;
  })).rejects.toBe(rollback);
 });

 it('never lists an authority as the supplier or winner of its own records (audit F12)',async()=>{
  const rollback=Error('rollback self-supplier fixture');
  await expect(sql!.begin(async tx=>{
   // DA 626: authority 1 recorded as its own supplier. Notice 10014: authority 1 beside supplier 11.
   // Notice 10015: authority 2 (Buzău) recorded as the only winner of its own notice.
   await tx`insert into core.direct_acquisitions values(626,100626,1,1,62600)`;
   await tx`insert into core.flags values(626,'da_rapid','da',626,null,true,0.5,'{}','2025','test')`;
   await tx`insert into core.awards values(14,10014,1,5000000),(15,10015,2,6000000)`;
   await tx`insert into core.contracts values(105,10014),(106,10015)`;
   await tx`insert into core.contract_winners values(105,1),(105,11),(106,2)`;
   await tx`insert into core.flags values(2014,'award_single_bid','award',14,null,true,0.5,'{}','2025','test'),(2015,'award_single_bid','award',15,null,true,0.5,'{}','2025','test')`;
   await tx`refresh materialized view marts.signal_lookup`;
   expect((await validateSignalLookup(tx as unknown as DbSql)).mismatches).toBe('0');
   expect((await tx`select entity_id::text, partner_id from marts.signal_lookup where id=626`)[0]).toEqual({entity_id:'1',partner_id:null});
   const q=Object.assign((...args: unknown[]) => (tx as any)(...args), {begin: async (_options: string, run: (db: DbSql) => unknown) => run(tx as unknown as DbSql)}) as unknown as DbSql;
   // The authority's own DA still counts on its authority side.
   expect((await readEntitySignalCounts(q,'1','authority')).da_rapid).toBe(625);
   expect(await readEntitySignalCounts(q,'1','supplier')).toEqual({});
   expect(await readEntitySignalCounts(q,'2','supplier')).toEqual({});
   expect((await readSignalOverview(q,parseSignalState({rol:'supplier'}))).counts).toMatchObject({da_rapid:624,award_single_bid:4});
   const won=await readSignalPage(q,parseSignalState({tip:'award_single_bid',rol:'supplier'}));
   expect(won.rows.map(r=>r.id)).toEqual(['2014','2012','2011','2010']);
   expect(won.rows[0]?.winners.map(w=>w.entityId)).toEqual(['11']);
   expect((await readSignalPage(q,parseSignalState({tip:'award_single_bid',rol:'supplier',jud:'Buzău'}))).total).toBe(2);
   throw rollback;
  })).rejects.toBe(rollback);
 });

});
