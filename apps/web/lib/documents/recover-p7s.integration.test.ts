import {afterAll,beforeEach,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {recoverArchivedP7s} from './recover-p7s';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_/.test(new URL(url).pathname.slice(1)))throw Error('Isolated DB required');
const db=url?createDb(url):null;
afterAll(async()=>{await db?.sql.end();});
describe.skipIf(!db)('archived P7S recovery, no source HTTP',()=>{
 beforeEach(async()=>{
  const q=db!.sql;await q`truncate app.document_requests,app.document_jobs,app.document_pages,app.procurement_documents,app.document_notices,app.document_blobs cascade`;
  await q`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url) values('recovery','1',17,'SCN1','Fixture','https://example.test')`;
  for(let i=1;i<=3;i++){
   await q`insert into app.document_blobs(hash,bytes,mime) values(${String(i)},${Buffer.from(String(i))},'application/octet-stream')`;
   const [d]=await q`insert into app.procurement_documents(notice_key,source_id,code,filename,original_hash) values('recovery',${String(i)},${String(i)},'file.p7s',${String(i)}) returning id`;
   await q`insert into app.document_jobs(notice_key,document_id,kind,dedup_key,requested_by,automatic,status,stage,error,attempts) values('recovery',${d!.id},'file',${'recovery-'+i},'fixture',true,'failed','failed','Procesarea cu openssl nu a reușit. Originalul rămâne disponibil.',3)`;
  }
 });
 const inspect=async(bytes:Buffer)=>bytes.toString()==='1'?{signature:'fixture warning',pages:1}:{error:'Formatul nu conține un PDF compatibil. Originalul rămâne disponibil.'};
 it('defaults to read only, requeues only readable PDFs and preserves originals and historical failures in audit',async()=>{
  const q=db!.sql,before=await q`select * from app.document_jobs order by id`,originals=await q`select original_hash from app.procurement_documents order by id`;
  const preview=await recoverArchivedP7s(q,{inspect});expect(preview).toMatchObject({candidates:3,ready:1,unsupported:2,changed:0});expect(await q`select * from app.document_jobs order by id`).toEqual(before);
  expect(await recoverArchivedP7s(q,{apply:true,inspect})).toMatchObject({ready:1,changed:3});
  expect((await q`select status,stage,attempts from app.document_jobs where dedup_key='recovery-1'`)[0]).toEqual({status:'queued',stage:'process_queued',attempts:0});
  expect((await q`select count(*)::int n from app.document_jobs where status='failed'`)[0]!.n).toBe(2);
  expect(await q`select original_hash from app.procurement_documents order by id`).toEqual(originals);expect(await q`select id from app.document_requests`).toHaveLength(0);
  const [audit]=await q`select before from app.collection_audit where action='documents-p7s-recovery' order by id desc limit 1`;expect(audit!.before).toHaveLength(3);
  expect(await recoverArchivedP7s(q,{apply:true,inspect})).toMatchObject({candidates:0,changed:0});
 });
 it('does not overwrite a concurrently resumed job or retry an unreadable container',async()=>{
  const q=db!.sql;
  const result=await recoverArchivedP7s(q,{apply:true,inspect:async bytes=>{
   if(bytes.toString()==='1'){await q`update app.document_jobs set status='queued' where dedup_key='recovery-1'`;return {signature:'fixture',pages:1};}
   throw Error('fixture extraction unavailable');
  }});
  expect(result).toMatchObject({changed:0,unresolved:2});expect(await q`select id from app.document_requests`).toHaveLength(0);
 });
});
