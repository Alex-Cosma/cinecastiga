import {afterAll,beforeEach,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {runNormalize} from './pipeline.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;afterAll(async()=>{await connection?.sql.end();});
describe.skipIf(!connection)('durable normalization quarantine',()=>{
 beforeEach(async()=>{
  await connection!.sql`truncate core.quarantine,core.normalize_watermarks,raw.raw_documents restart identity cascade`;
 });
 it('retries failures below the cursor, respects boundary and retains resolved history',async()=>{
  const {sql:q,db}=connection!;
  await q`insert into raw.raw_documents(source,external_id,endpoint_version,content_hash,payload)
   values('fixture','fixture:1','award-contracts:v1','fixture:1','{}')`;
  const first=await runNormalize(db,q,{only:'award-contracts:v1'});expect(first.quarantined).toBe(1);
  const retry=await runNormalize(db,q,{only:'award-contracts:v1'});expect(retry.quarantined).toBe(1);
  expect((await q`select count(*)::int n from core.quarantine where resolved_at is null`)[0]!.n).toBe(2);
  // Replace the invalid fixture only; production raw sources are never rewritten.
  await q`update raw.raw_documents set payload='{"items":[]}'`;
  expect((await runNormalize(db,q,{only:'award-contracts:v1',maxRawId:0n})).processed).toBe(0);
  expect((await runNormalize(db,q,{only:'award-contracts:v1',maxRawId:1n})).processed).toBe(1);
  expect((await q`select count(*)::int n from core.quarantine where resolved_at is not null`)[0]!.n).toBe(2);
  expect((await runNormalize(db,q,{only:'award-contracts:v1'})).processed).toBe(0);
  expect((await q`select last_raw_id::text n from core.normalize_watermarks`)[0]!.n).toBe('1');
 });
 it('ignores historical non-pending quarantine and resolves a retry above a cursor after a crash',async()=>{
  const {sql:q,db}=connection!;
  await q`insert into raw.raw_documents(source,external_id,endpoint_version,content_hash,payload)
   values('fixture','fixture:1','award-contracts:v1','fixture:1','{"items":[]}')`;
  await q`insert into core.quarantine(raw_id,endpoint_version,zod_error,retry_required) values(1,'award-contracts:v1','prior failure',true),(1,'award-contracts:v1','history',false)`;
  expect((await runNormalize(db,q,{only:'award-contracts:v1'})).processed).toBe(1);
  expect((await q`select retry_required,resolved_at is not null resolved from core.quarantine order by id`)).toEqual([{retry_required:true,resolved:true},{retry_required:false,resolved:false}]);
 });
});
