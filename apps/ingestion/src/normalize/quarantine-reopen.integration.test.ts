import {afterAll,afterEach,beforeEach,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {runNormalize} from './pipeline.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;afterAll(async()=>{await connection?.sql.end();});
// Exact shape of the July 2026 failures (audit F21, e.g. raw 16872480, MEDI SENSE 33240921).
const backfillError='Failed query: update "core"."entities" set "cui_canonical" = coalesce("core"."entities"."cui_canonical", $1::text), "cui_valid" = "core"."entities"."cui_valid" or ($2::text is not null) where "core"."entities"."id" = $8\nparams: 33240921,33240921 | cause: duplicate key value violates unique constraint "entities_cui_canonical_uq"';
const envelope=(ca:number,contract:number,value:number)=>({caNoticeId:ca,items:[{caNoticeContractId:contract,caNoticeId:ca,contractNo:'1',contractDate:'2019-06-18T21:00:00Z',
 contractValue:value,currency:{text:'RON',localeKey:'RON'},contractTitle:'Consumabile',winner:{entityId:120407,fiscalNumber:'RO33240921',name:'MEDI SENSE SRL'}}]});
const reset=()=>connection!.sql`truncate core.quarantine,core.normalize_watermarks,raw.raw_documents,core.contract_winners,core.contracts,core.entity_sicap_ids,core.entities restart identity cascade`;
describe.skipIf(!connection)('historical quarantine with a since-fixed resolver failure',()=>{
 // Also after: the fixture CUI is real and other suites insert it themselves.
 beforeEach(reset);afterEach(reset);
 it('retries the latest envelope so its contracts reach the CUI owner, leaving placeholder and other history alone',async()=>{
  const {sql:q,db}=connection!;
  const [owner]=await q`insert into core.entities(name_display,name_normalized,cui_canonical,cui_valid) values('MEDI SENSE','medi sense','33240921',true) returning id`;
  const [placeholder]=await q`insert into core.entities(name_display,name_normalized,cui_valid,cui_raw_variants) values('MEDI SENSE SRL','medi sense',false,'{3324092}') returning id`;
  await q`insert into core.entity_sicap_ids(namespace,sicap_id,entity_id) values('supplier',120407,${owner!.id}),('winner',120407,${placeholder!.id})`;
  // 1: only envelope of notice 501 (reopened); 2: superseded by 3 for notice 502; 3: newer, already loaded; 4: other failure.
  await q`insert into raw.raw_documents(source,external_id,endpoint_version,content_hash,payload) values
   ('elicitatie','award:501','award-contracts:v1','h1',${JSON.stringify(envelope(501,9001,1000.5))}::jsonb),
   ('elicitatie','award:502','award-contracts:v1','h2',${JSON.stringify(envelope(502,9002,1))}::jsonb),
   ('elicitatie','award:502','award-contracts:v1','h3',${JSON.stringify(envelope(502,9002,2))}::jsonb),
   ('elicitatie','award:503','award-contracts:v1','h4',${JSON.stringify(envelope(503,9003,3))}::jsonb)`;
  await q`insert into core.contracts(raw_id,ca_notice_contract_id,ca_notice_id,contract_value) values(3,9002,502,2)`;
  await q`insert into core.normalize_watermarks(transform,last_raw_id) values('award-contracts:v1',4)`;
  await q`insert into core.quarantine(raw_id,endpoint_version,zod_error,retry_required) values
   (1,'award-contracts:v1',${backfillError},false),(1,'award-contracts:v1',${backfillError},false),
   (2,'award-contracts:v1',${backfillError},false),
   (4,'award-contracts:v1','Conflicting valid CUI for the same SICAP identity; review required',false)`;

  const report=await runNormalize(db,q,{only:'award-contracts:v1'});
  expect(report).toMatchObject({processed:1,quarantined:0});
  const contracts=await q`select c.raw_id::int raw,c.ca_notice_contract_id::int nid,c.contract_value::text value,w.entity_id::text winner
   from core.contracts c left join core.contract_winners w on w.contract_id=c.id order by nid`;
  expect(contracts).toEqual([{raw:1,nid:9001,value:'1000.5',winner:String(owner!.id)},{raw:3,nid:9002,value:'2',winner:null}]);
  expect((await q`select cui_canonical from core.entities where id=${placeholder!.id}`)[0]!.cui_canonical).toBeNull();
  expect(await q`select raw_id::int raw,retry_required,resolved_at is not null resolved from core.quarantine order by id`).toEqual([
   {raw:1,retry_required:true,resolved:true},{raw:1,retry_required:true,resolved:true},
   {raw:2,retry_required:false,resolved:false},{raw:4,retry_required:false,resolved:false}]);
  // Idempotent: nothing left to reopen or retry.
  expect(await runNormalize(db,q,{only:'award-contracts:v1'})).toMatchObject({processed:0,quarantined:0});
 });
});
