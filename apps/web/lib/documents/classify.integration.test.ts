import {afterAll,beforeEach,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {classifyDocumentBatch,classifyStoredDocument} from './classify';
import {CLASSIFICATION_VERSION} from './classification';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_/.test(new URL(url).pathname.slice(1)))throw Error('Isolated DB required');
const db=url?createDb(url):null;
afterAll(async()=>{await db?.sql.end();});
describe.skipIf(!db)('persisted document classification, no source traffic',()=>{
 beforeEach(async()=>{
  const q=db!.sql;
  await q`truncate app.document_requests,app.document_pages,app.document_jobs,app.procurement_documents,app.document_notices,app.document_batches,app.document_blobs cascade`;
  await q`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url) values('classification-test','1',17,'SCN1','Fixture','https://example.test')`;
 });
 it('classifies names and archived headings, then stops; source bytes and pages remain identical',async()=>{
  const q=db!.sql;
  await q`insert into app.document_blobs(hash,bytes,mime) values('classification-source',${Buffer.from('%PDF-fixture original')},'application/pdf')`;
  const [d]=await q`insert into app.procurement_documents(notice_key,source_id,code,filename,original_hash,pdf_hash,processed_at) values('classification-test','1','1','scan.pdf','classification-source','classification-source',now()) returning *`;
  await q`insert into app.document_pages(document_id,page,text,method) values(${d!.id},1,'MUNICIPIUL EXEMPLU\nCAIET DE SARCINI\nCerințe pentru test','native')`;
  const original=await q`select * from app.document_blobs`,pages=await q`select * from app.document_pages`;
  expect(await classifyDocumentBatch(q)).toEqual({inspected:1,changed:1});
  expect((await q`select priority,classification,classification_version,classification_pdf_hash from app.procurement_documents`)[0]).toMatchObject({priority:0,classification:{categories:['specifications'],method:'text',evidence:[{page:1,value:'CAIET DE SARCINI'}]},classification_version:CLASSIFICATION_VERSION,classification_pdf_hash:'classification-source'});
  expect(await classifyDocumentBatch(q)).toEqual({inspected:0,changed:0});
  expect(await q`select * from app.document_blobs`).toEqual(original);expect(await q`select * from app.document_pages`).toEqual(pages);expect(await q`select id from app.document_jobs`).toHaveLength(0);expect(await q`select id from app.document_requests`).toHaveLength(0);
 });
 it('uses unfinished preparation members before OCR is complete and discovers a CS inside a generic archive',async()=>{
  const q=db!.sql,parts=[{name:'Arhiva.zip / Planse.pdf',firstPage:1,pages:2},{name:'Arhiva.zip / CS lucrari.docx',firstPage:3,pages:1}];
  const [d]=await q`insert into app.procurement_documents(notice_key,source_id,code,filename,contents,preparation) values('classification-test','1','1','Arhiva.zip','[]',${JSON.stringify({contents:parts})}::jsonb) returning *`;
  await classifyStoredDocument(q,d!);
  expect((await q`select priority,classification,processed_at,pdf_hash from app.procurement_documents`)[0]).toMatchObject({priority:0,classification:{categories:['specifications','technical'],method:'contents',parts:[{firstPage:1,categories:['technical']},{firstPage:3,categories:['specifications']}]},processed_at:null,pdf_hash:null});
 });
 it('reclassifies after a derived PDF becomes available, preserves manual corrections',async()=>{
  const q=db!.sql;
  const [d]=await q`insert into app.procurement_documents(notice_key,source_id,code,filename) values('classification-test','1','1','scan.pdf') returning *`;
  await classifyDocumentBatch(q);
  await q`insert into app.document_blobs(hash,bytes,mime) values('classification-pdf',${Buffer.from('%PDF-fixture')},'application/pdf')`;
  await q`update app.procurement_documents set pdf_hash='classification-pdf',processed_at=now() where id=${d!.id}`;
  await q`insert into app.document_pages(document_id,page,text,method) values(${d!.id},1,'CAIET DE SARCINI','ocr')`;
  expect(await classifyDocumentBatch(q)).toEqual({inspected:1,changed:1});
  await q`update app.procurement_documents set classification=${JSON.stringify({version:0,method:'manual',categories:['technical'],evidence:[]})}::jsonb,priority=100,classification_version=0 where id=${d!.id}`;
  expect(await classifyDocumentBatch(q)).toEqual({inspected:0,changed:0});
  expect(await classifyStoredDocument(q,(await q`select * from app.procurement_documents`)[0]!)).toBe(false);
  expect((await q`select priority from app.procurement_documents`)[0]!.priority).toBe(100);
 });
});
