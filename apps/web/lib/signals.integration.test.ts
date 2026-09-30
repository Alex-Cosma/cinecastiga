import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createDb,validateSignalLookup,type DbSql} from '@seap/db';
import {readFile} from 'node:fs/promises';
import {parseSignalState,readSignalOverview,readSignalPage,readSignalRiskGroup} from './signals';
const url=process.env.TEST_SIGNAL_DATABASE_URL;
if(url && new URL(url).pathname!=='/seap_test_signals') throw Error('Dedicated seap_test_signals database required');
const sql=url?createDb(url).sql:null;
const precisionMigration=await readFile(new URL('../../../packages/db/migrations/0044_signal_sort_precision.sql',import.meta.url),'utf8');
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
  expect(first.total).toBe(624);expect(first.rows).toHaveLength(50);expect(first.rows[0]?.id).toBe('624');
  expect(first.rows[0]).toMatchObject({period:'2025',methodology:'test',evidence:{minutes:5},sourceId:'100624'});
  const last=await readSignalPage(sql!,parseSignalState({tip:'da_rapid',p:'9999'}));
  expect(last.page).toBe(12);expect(last.rows).toHaveLength(24);expect(last.rows.at(-1)?.id).toBe('1');
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
 it('keeps CRI cohort boundaries and county filters',async()=>{
  const group=await readSignalRiskGroup(sql!,parseSignalState({criMin:'0.5',criMax:'0.6',jud:'Cluj'}));
  expect(group.total).toBe(1);expect(group.rows[0]?.entityId).toBe('1');
 });
});
