import {afterAll,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {randomUUID} from 'node:crypto';
import {contractNotice,registerNotice,enqueueDocument,saveDocumentQuote,getContractFiles} from './store';
import {runWorkerOnce} from './worker';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;afterAll(async()=>{await connection?.sql.end();});
describe.skipIf(!connection)('document queue, provenance and private evidence',()=>{
 it('a targeted worker leaves an older queued job untouched',async()=>{
  const q=connection!.sql,key='targeted-pilot-'+randomUUID();
  const [control]=await q`select paused,maintenance,blocked_reason,paused_streams from app.collection_control where id=1`;
  await q`update app.collection_control set paused=false,maintenance=false,blocked_reason=null,paused_streams='[]' where id=1`;
  await q`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url) values(${key},'1',17,'FIXTURE','Fixture','https://example.test')`;
  try{
   const [first]=await q`insert into app.document_jobs(notice_key,kind,dedup_key,requested_by,created_at) values(${key},'list',${key+'-first'},'fixture',now()-interval '1 minute') returning id`;
   const [second]=await q`insert into app.document_jobs(notice_key,kind,dedup_key,requested_by) values(${key},'list',${key+'-second'},'fixture') returning id`;
   const processed:string[]=[];
   expect(await runWorkerOnce(q,new AbortController().signal,async(_db,job)=>{processed.push(job.id);},second!.id)).toBe(true);
   expect(processed).toEqual([second!.id]);
   const [untouched]=await q`select status from app.document_jobs where id=${first!.id}`;
   expect(untouched!.status).toBe('queued');
  }finally{
   await q`delete from app.document_jobs where notice_key=${key}`;await q`delete from app.document_notices where key=${key}`;
   if(control)await q`update app.collection_control set paused=${control.paused},maintenance=${control.maintenance},blocked_reason=${control.blocked_reason},paused_streams=${JSON.stringify(control.paused_streams)}::jsonb where id=1`;
  }
 });
 it('deduplicates, serializes competing workers, preserves originals, validates source/page/version and private access',async()=>{
  const q=connection!.sql,seed=randomUUID(),uid='docs-'+seed,viewer=uid+'-viewer',outsider=uid+'-outsider';
  const [entity]=await q`insert into core.entities(name_display,name_normalized) values('Document fixture','document fixture') returning id`;
  const [raw]=await q`insert into raw.raw_documents(source,external_id,endpoint_version,content_hash,payload) values('fixture',${seed},'fixture',${seed},'{"procedureId":998877,"contractTitle":"Fixture"}') returning id`;
  const natural=String(800000000+Math.floor(Math.random()*1000000));
  const [award]=await q`insert into core.awards(raw_id,ca_notice_id,authority_entity_id,procedure_id) values(${raw!.id},${natural},${entity!.id},'998877') returning id`;
  const [notice]=await q`insert into core.notices(raw_id,c_notice_id,notice_no,sys_notice_type_id,authority_entity_id,procedure_id,title) values(${raw!.id},${natural},'SCN_FIXTURE',17,${entity!.id},'998877','Fixture') returning id`;
  const [contract]=await q`insert into core.contracts(raw_id,ca_notice_contract_id,ca_notice_id,title) values(${raw!.id},${natural},${natural},'Fixture') returning id`;
  await q`insert into auth.users(id,name,email) values(${uid},'Document test',${uid+'@example.test'}),(${viewer},'Viewer',${viewer+'@example.test'}),(${outsider},'Outsider',${outsider+'@example.test'})`;
  const [inv]=await q`insert into app.investigations(owner_user_id,title) values(${uid},'Synthetic test') returning id`;
  await q`insert into app.investigation_members(investigation_id,user_id,role) values(${inv!.id},${viewer},'viewer')`;
  await q`update app.collection_control set paused=false,blocked_reason=null,maintenance=false,paused_streams='[]' where id=1`;
  const old=process.env.DOCUMENTS_ENABLED;process.env.DOCUMENTS_ENABLED='true';
  let key:string|undefined;
  try{
   const n=await contractNotice(natural,q);expect(n?.noticeId).toBe(natural);key=n!.key;await registerNotice(n!,q);
   const [file]=await q`insert into app.procurement_documents(notice_key,source_id,code,filename) values(${key},'77','SCN_FIXTURE/01','Fixture.pdf') returning id`;
   const results=await Promise.all([enqueueDocument(natural,uid,file!.id,q),enqueueDocument(natural,outsider,file!.id,q)]);expect(results[0]).toEqual(results[1]);
   const [file2]=await q`insert into app.procurement_documents(notice_key,source_id,code,filename) values(${key},'78','SCN_FIXTURE/02','Second.pdf') returning id`;
   await enqueueDocument(natural,uid,file2!.id,q);
   let active=0,maxActive=0,calls=0;let entered!:()=>void,release!:()=>void;
   const started=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
   const work=async()=>{active++;maxActive=Math.max(maxActive,active);calls++;entered();await gate;active--;};
   const one=runWorkerOnce(q,new AbortController().signal,work);await started;
   expect(await runWorkerOnce(q,new AbortController().signal,work)).toBe(false);release();expect(await one).toBe(true);
   expect(await runWorkerOnce(q,new AbortController().signal,async()=>{calls++;})).toBe(true);expect(calls).toBe(2);expect(maxActive).toBe(1);
   const [counts]=await q`select count(*) n from app.document_requests`;expect(Number(counts!.n)).toBe(0);
   const bytes=Buffer.from('original-'+seed),hash=seed.replaceAll('-','').repeat(2);
   await q`insert into app.document_blobs(hash,bytes,mime) values(${hash},${bytes},'application/pdf')`;
   await q`update app.procurement_documents set original_hash=${hash},pdf_hash=${hash},downloaded_at=now(),processed_at=now(),page_count=2 where id=${file!.id}`;
   await q`insert into app.document_pages(document_id,page,text,method) values(${file!.id},1,'Garanție și experiență similară','ocr'),(${file!.id},2,'','ocr')`;
   expect(await enqueueDocument(natural,uid,file!.id,q)).toEqual({ready:true});
   const data=await getContractFiles(natural,q);expect(data.files.find(f=>f.id===file!.id)?.processedAt).toBeTruthy();
   const input={investigationId:inv!.id,contractId:natural,page:1,quote:'Garanție și experiență',originalHash:hash,note:'Verify source'};
   const clip=await saveDocumentQuote(uid,file!.id,input,q);expect(clip.investigationId).toBe(inv!.id);
   for(const patch of [{quote:'Invented content'},{page:2},{originalHash:'wrong'},{contractId:'123'}])await expect(saveDocumentQuote(uid,file!.id,{...input,...patch},q)).rejects.toMatchObject({status:409});
   await expect(saveDocumentQuote(viewer,file!.id,input,q)).rejects.toMatchObject({status:403});await expect(saveDocumentQuote(outsider,file!.id,input,q)).rejects.toMatchObject({status:403});
   const [saved]=await q`select snapshot from app.clips where id=${clip.id}`;expect(saved!.snapshot.quote).toBe(input.quote);expect(saved!.snapshot.originalHash).toBe(hash);
   await q`delete from app.document_pages where document_id=${file!.id}`;await q`update app.procurement_documents set original_hash=null,pdf_hash=null where id=${file!.id}`;await q`delete from app.document_blobs where hash=${hash}`;
  }finally{
   process.env.DOCUMENTS_ENABLED=old;
   if(key){await q`delete from app.document_requests where job_id in (select id from app.document_jobs where notice_key=${key})`;await q`delete from app.document_jobs where notice_key=${key}`;await q`delete from app.document_pages where document_id in(select id from app.procurement_documents where notice_key=${key})`;await q`delete from app.procurement_documents where notice_key=${key}`;await q`delete from app.document_notices where key=${key}`;}
   await q`delete from auth.users where id in (${uid},${viewer},${outsider})`;await q`delete from core.contracts where id=${contract!.id}`;await q`delete from core.notices where id=${notice!.id}`;await q`delete from core.awards where id=${award!.id}`;await q`delete from raw.raw_documents where id=${raw!.id}`;await q`delete from core.entities where id=${entity!.id}`;
  }
 },30000);
});
