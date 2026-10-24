import {afterAll,expect,it} from 'vitest';
import {createDb,ensureTransactionMartIndexes,TRANSACTION_MART_INDEXES,type DbSql} from '@seap/db';
// A database migrated from scratch (0084 included); the second test drops
// the indexes only inside a rolled-back transaction.
const url=process.env['TEST_DATABASE_URL'];
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;
afterAll(async()=>{await connection?.sql.end({timeout:5});});
const expected=TRANSACTION_MART_INDEXES.map(({name,definition})=>({name,definition})).sort((a,b)=>a.name<b.name?-1:1);
const actual=async(q:DbSql)=>(await q`select indexname name,indexdef definition from pg_indexes
  where schemaname='marts' and indexname=any(${expected.map(index=>index.name)}::text[]) order by indexname collate "C"`).map(row=>({...row}));

it.skipIf(!connection)('creates the covering county/CPV indexes from migrations, exactly as production has them',async()=>{
 expect(await actual(connection!.sql)).toEqual(expected);
});
it.skipIf(!connection)('recreates lost covering indexes with the same definitions, and only those',async()=>{
 const rollback=Error('rollback fixture');
 await expect(connection!.sql.begin(async q=>{
  for(const index of expected)await q.unsafe(`drop index marts.${index.name}`);
  await q.unsafe('drop index marts.da_tx_authority_idx');
  expect(await ensureTransactionMartIndexes(q,'da_transactions')).toEqual(['da_tx_county_date_idx','da_tx_county_ent_idx','da_tx_cpv_idx','da_tx_cpv_val_idx']);
  expect(await ensureTransactionMartIndexes(q,'contract_transactions')).toEqual(['ctx_county_idx','ctx_county_ent_idx','ctx_cpv_idx','ctx_cpv_val_idx']);
  expect(await actual(q as unknown as DbSql)).toEqual(expected);
  // Present indexes are left alone; Drizzle-declared ones stay with the migrations.
  expect(await ensureTransactionMartIndexes(q,'da_transactions')).toEqual([]);
  expect((await q`select to_regclass('marts.da_tx_authority_idx') is null missing`)[0]!.missing).toBe(true);
  throw rollback;
 })).rejects.toBe(rollback);
});
