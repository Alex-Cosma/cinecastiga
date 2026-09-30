import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {readFile} from 'node:fs/promises';
import {parseTopicScope} from './shared';
const url=process.env.TEST_TOPIC_DATABASE_URL;
if(url&&!/^seap_test_/.test(new URL(url).pathname.slice(1)))throw Error('Only isolated seap_test_* databases are allowed.');
const suite=url?describe:describe.skip;
suite('public subject search against PostgreSQL',()=>{
 let q:ReturnType<typeof createDb>['sql'];let search:typeof import('./server')['searchTopics'];
 beforeAll(async()=>{
  process.env.DATABASE_URL=url!;q=createDb(url).sql;
  await q.unsafe(`create extension if not exists unaccent;create schema core;create schema marts;create schema app;create schema reference;create schema raw;
  create table core.entities(id bigint primary key,name_display text,name_normalized text,cui_canonical text,county text);
  create table marts.entity_profile(entity_id bigint,role text,total_ron_full numeric);
  create table reference.uat(siruta int,name text,county text,population int,tip text);
  create table reference.authority_uat(entity_id bigint,uat_siruta int);
  create table raw.raw_documents(id bigint primary key,payload jsonb);
  create table core.direct_acquisitions(id bigint,sicap_da_id bigint,raw_id bigint,da_code text);
  create table marts.da_transactions(sicap_da_id bigint,authority_id bigint,supplier_id bigint,county text,finalization_date text,closing_value numeric);
  create table core.contracts(id bigint,ca_notice_contract_id bigint,title text,contract_no text,ca_notice_id bigint);
  create table core.awards(ca_notice_id bigint,raw_id bigint);
  create table marts.contract_transactions(contract_id bigint,authority_id bigint,supplier_id bigint,county text,finalization_date text,contract_value_full numeric);
  create table core.notices(c_notice_id bigint,sys_notice_type_id int,authority_entity_id bigint,raw_id bigint);
  create table app.document_notices(key text,notice_id text,notice_type int,notice_no text,title text,url text);
  create table app.procurement_documents(id uuid,filename text,notice_key text,processed_at timestamptz,pdf_hash text);
  create table app.document_pages(document_id uuid,page int,text text,method text);
  `);
  await q.unsafe((await readFile('../../packages/db/migrations/0039_ancient_gressill.sql','utf8')).replaceAll('--> statement-breakpoint',''));
  await q.unsafe(await readFile('../../packages/db/migrations/0040_nosy_maginty.sql','utf8'));

  await q.unsafe(`insert into core.entities values(1,'MUNICIPIUL BUZĂU','municipiul buzau','123','buzau'),(2,'Firma A','firma a','200','cluj'),(3,'Firma B','firma b','300','buzau'),(4,'COMUNA TEST','comuna test','400','buzau');
   insert into marts.entity_profile values(1,'authority',300),(2,'supplier',200),(3,'supplier',100),(4,'authority',100);
   insert into reference.uat values(44818,'MUNICIPIUL BUZĂU','buzau',103481,'1'),(999,'COMUNA TEST','buzau',1000,'3');
   insert into reference.authority_uat values(1,44818),(4,999);
   insert into raw.raw_documents values(1,'{"directAcquisitionName":"Locuri de joacă accesibile"}'),(2,'{"directAcquisitionName":"Locuri de odihnă și joacă"}'),(3,'{"procedureId":123}'),(4,'{"procedureId":123}');
   insert into core.direct_acquisitions values(11,101,1,'DA101'),(12,102,2,'DA102'),(13,103,null,'DA103');
   insert into marts.da_transactions values(101,1,2,'Buzău','2022-12-31',123456789012345.6789),(102,4,3,'Buzau','2024-01-01',10),(103,4,3,'Buzau','2023-01-01',20);
   insert into core.contracts values(30,500,'Iluminat public','C30',70);
   insert into core.awards values(70,3);
   insert into marts.contract_transactions values(30,1,2,'Buzău','2024-12-31',100.123456),(30,1,3,'Buzau','2024-12-31',100.123456);
   insert into core.notices values(80,17,1,4);
   insert into app.document_notices values('17:80','80',17,'SCN80','Procedură iluminat','https://www.e-licitatie.ro/pub/notices/simplified-notice/v2/view/80');
   insert into app.procurement_documents values('00000000-0000-4000-8000-000000000001','Caiet.pdf','17:80',now(),'hash'),('00000000-0000-4000-8000-000000000002','Nepregătit.pdf','17:80',null,null);
   insert into app.document_pages values('00000000-0000-4000-8000-000000000001',1,'Locuri de joacă, accesibile.','pdf'),('00000000-0000-4000-8000-000000000001',2,'Locuri de joacă și spații verzi.','ocr');`);
  await q.unsafe(`insert into core.entities values
   (10,'Municipiul Cluj-Napoca','municipiul cluj napoca','4305857','Cluj'),
   (11,'COMUNA EXEMPLU JUDETUL CLUJ','comuna exemplu judetul cluj','1100','Cluj'),
   (12,'Municipiul Cluj-Napoca','municipiul cluj napoca','1200','Cluj'),
   (13,'Firma A Construct','firma a construct','1300','Cluj');
   insert into marts.entity_profile values(10,'authority',100),(11,'authority',999999999),(12,'authority',50),(13,'supplier',999999999);`);
  const {indexTopics}=await import('../../../ingestion/src/search/index-topics');await indexTopics(q);
  search=(await import('./server')).searchTopics;
 },30000);
 afterAll(async()=>{await (globalThis as unknown as {topicSql?:typeof q}).topicSql?.end();await q?.end();});
 const run=(p:string)=>search(parseTopicScope(new URLSearchParams(p)));
 it('counts an entire consortium once and preserves decimal precision',async()=>{const r=await run('q=iluminat');expect(r.acquisitions.total).toBe(1);expect(r.acquisitions.hits[0]).toMatchObject({value:'100.123456',href:'/contracte/500',suppliers:['Firma A','Firma B'],sourceUrl:'https://e-licitatie.ro/pub/notices/ca-notices/view-c/70'});});
 it('separates matching documents from acquisitions and maps exact pages',async()=>{const r=await run('q=locuri+de+joaca');expect(r.acquisitions.total).toBe(2);expect(r.documents.total).toBe(1);expect(r.documents.hits[0]).toMatchObject({pages:[1,2],contractId:'500'});expect(r.coverage).toEqual({known:2,ready:1,pages:2});});
 it('matches accentless words and distinguishes ordered phrases',async()=>{const r=await run('q=locuri+de+joaca&match=phrase');expect(r.acquisitions.total).toBe(1);expect(r.acquisitions.hits[0]?.value).toBe('123456789012345.6789');});
 it('includes both year boundaries and applies all filters to documents',async()=>{expect((await run('q=locuri&from=2022&to=2024')).acquisitions.total).toBe(2);const r=await run('q=locuri&from=2022&to=2022');expect(r.acquisitions.total).toBe(1);expect(r.documents.total).toBe(0);expect(r.coverage.known).toBe(0);});
 it('uses a specific UAT instead of all authorities in the county',async()=>{expect((await run('q=locuri&place=county:buzau')).acquisitions.total).toBe(2);expect((await run('q=locuri&place=uat:44818')).acquisitions.total).toBe(1);expect((await run('q=locuri&place=uat:999')).documents.total).toBe(0);});
 it('applies buyer location and period to suppliers’ activity',async()=>{expect((await run('q=firma&place=uat:44818&from=2022&to=2022')).entities.hits.map(x=>x.id)).toEqual(['2']);});
 it('honors phrase order for entity names as well',async()=>{expect((await run('q=buzau+municipiul')).entities.total).toBe(1);expect((await run('q=buzau+municipiul&match=phrase')).entities.total).toBe(0);});
 it('retains colloquial city-hall aliases and CUI lookup',async()=>{expect((await run('q=primaria+buzau')).entities.hits[0]?.id).toBe('1');expect((await run('q=200')).entities.hits[0]?.id).toBe('2');});
 it('does not turn punctuation into a wildcard or expose unprocessed files',async()=>{const r=await run('q=%25%27');expect(r.acquisitions.total+r.documents.total+r.entities.total).toBe(0);expect((await run('q=locuri&type=da')).documents.total).toBe(0);});
 it('retains records without raw titles in activity filters and reports title coverage',async()=>{const r=await run('q=firma&place=uat:999&from=2023&to=2023');expect(r.entities.hits.map(x=>x.id)).toEqual(['3']);expect(r.titleCoverage).toEqual({total:4,searchable:3});});
 it('keeps the preceding index and indexes if a rebuild fails',async()=>{
  const [before]=await q`select built_at from marts.topic_search_state where id=1`;
  await q`alter table marts.topic_acquisitions add constraint test_rebuild_failure check (false) not valid`;
  const {indexTopics}=await import('../../../ingestion/src/search/index-topics');
  await expect(indexTopics(q)).rejects.toThrow();
  expect((await q`select count(*)::int n from marts.topic_acquisitions`)[0]?.n).toBe(4);
  expect((await q`select built_at from marts.topic_search_state where id=1`)[0]?.built_at).toEqual(before?.built_at);
  expect((await q`select count(*)::int n from pg_indexes where schemaname='marts' and tablename='topic_acquisitions'`)[0]?.n).toBe(7);
  await q`alter table marts.topic_acquisitions drop constraint test_rebuild_failure`;
 });
 it('promotes administrative name matches ahead of larger unrelated buyers without changing title search',async()=>{
  const r=await run('q=Primăria+Cluj');
  expect(r.entities.total).toBe(3);
  expect(r.entities.hits.map(e=>e.id)).toEqual(['10','12','11']);
  expect(r.entities.suggestions?.map(e=>e.id)).toEqual(['10','12']);
  expect(r.acquisitions.total).toBe(0);
 });
 it('keeps same-name identities separate and honors explicit category and filters',async()=>{
  expect((await run('q=Primăria+Cluj&tab=acquisitions')).entities.suggestions).toEqual([]);
  expect((await run('q=Primăria+Cluj&place=uat:44818')).entities.suggestions).toEqual([]);
  expect((await run('q=Primăria+Cluj&rol=furnizor')).entities.total).toBe(0);
 });
 it('prioritizes an exact company name and CUI, including the RO prefix',async()=>{
  const name=await run('q=Firma+A');expect(name.entities.hits[0]?.id).toBe('2');
  expect(name.entities.suggestions?.map(e=>e.id)).toEqual(['2']);
  expect((await run('q=RO4305857')).entities.suggestions?.map(e=>e.id)).toEqual(['10']);
  expect((await run('q=4305857')).entities.suggestions?.map(e=>e.id)).toEqual(['10']);
 });
 it('does not infer an institution from a topic, a bare place or a partial CUI',async()=>{
  for(const term of ['iluminat','Cluj','4305'])expect((await run(`q=${term}`)).entities.suggestions).toEqual([]);
 });
 it('rejects a geographic identifier not found in the catalog',async()=>{await expect(run('q=locuri&place=uat:1234567')).rejects.toThrow('catalog');});
});
