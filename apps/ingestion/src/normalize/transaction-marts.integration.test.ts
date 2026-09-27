import {afterAll,expect,it} from 'vitest';
import {createDb} from '@seap/db';
import {buildTransactionMarts} from './transaction-marts.js';
const url=process.env['TEST_DATABASE_URL'];
if(url&&new URL(url).pathname!='/seap_test_processing')throw Error('Dedicated processing test database required');
const connection=url?createDb(url):null;
afterAll(async()=>{await connection?.sql.end({timeout:5});});
it.skipIf(!connection)('includes new daily purchases in lists and national totals without altering the saved risk snapshot',async()=>{
 const rollback=Error('rollback fixture');
 await expect(connection!.sql.begin(async q=>{
  const [a]=await q`insert into core.entities(name_display,name_normalized,county) values('Autoritate exemplu','autoritate exemplu','BZ') returning id`;
  const [s]=await q`insert into core.entities(name_display,name_normalized) values('Furnizor exemplu','furnizor exemplu') returning id`;
  const [old]=await q`insert into core.direct_acquisitions(sicap_da_id,authority_entity_id,supplier_entity_id,closing_value,state,finalization_date)
    values(991,${a!.id},${s!.id},100,'Oferta acceptata','2026-09-20') returning id`;
  await q`insert into core.direct_acquisitions(sicap_da_id,authority_entity_id,supplier_entity_id,closing_value,state,finalization_date)
    values(992,${a!.id},${s!.id},250,'Oferta acceptata','2026-09-28'),(993,${a!.id},${s!.id},999,'Refuzata','2026-09-28')`;
  const [flag]=await q`insert into core.flags(subject_type,subject_id,flag_code,triggered,evidence,methodology_version)
    values('da',${old!.id},'da_round',true,'{"closing":100}','test') returning id`;
  await q`insert into marts.flag_instances(id,flag_code,subject_type,evidence) values(${flag!.id},'da_round','da','{"closing":100}')`;
  const beforeFlags=await q`select * from core.flags`,beforeInstances=await q`select * from marts.flag_instances`;
  expect((await buildTransactionMarts(q)).daTransactions).toBe(2);
  const rows=await q`select sicap_da_id::text,da_flags from marts.da_transactions order by sicap_da_id`;
  expect(rows.map(r=>r.sicap_da_id)).toEqual(['991','992']);expect(rows[0]!.da_flags).toEqual(['da_round']);expect(rows[1]!.da_flags).toBeNull();
  expect((await q`select v_plaf::text from marts.agg_national where src='da'`)[0]!.v_plaf).toBe('350');
  expect(await q`select * from core.flags`).toEqual(beforeFlags);expect(await q`select * from marts.flag_instances`).toEqual(beforeInstances);
  throw rollback;
 })).rejects.toBe(rollback);
});
