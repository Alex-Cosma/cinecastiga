import {afterAll,beforeAll,describe,it,expect} from 'vitest';
import {createDb,type DbSql} from '@seap/db';import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {runTool} from './process';import {prepareDocument,fileKind} from './prepare';
import {SIGNATURE_VERIFIED} from './shared';import {storeFile} from './blob-store';import {runDocumentJob} from './worker';import {runAutomaticJob} from './collection';
const enabled=process.env.DOCUMENT_TOOLS_TEST==='true',url=process.env.TEST_DATABASE_URL;
if(url&&!new URL(url).pathname.startsWith('/seap_test_'))throw Error('Isolated database required');
const db=enabled&&url?createDb(url,{max:1}):null;let dir:string;
beforeAll(async()=>{if(!enabled)return;dir=await mkdtemp(join(tmpdir(),'formats-test-'));
 await runTool('python3',['-c',`from reportlab.pdfgen import canvas
import zipfile,sys,openpyxl
p=sys.argv[1]
c=canvas.Canvas(p+'/long.pdf')
for i in range(165):
 c.drawString(30,700,'Public source fixture page '+str(i+1)+' with enough native text to avoid OCR.');c.showPage()
c.save()
for filename,title in [('planse.pdf','Planse tehnice'),('CS.pdf','CAIET DE SARCINI')]:
 c=canvas.Canvas(p+'/'+filename)
 for i in range(30):
  c.drawString(30,700,title+' fixture native text page '+str(i+1)+' with enough text to avoid OCR.');c.showPage()
 c.save()
with zipfile.ZipFile(p+'/priority.zip','w') as z:
 z.write(p+'/planse.pdf','planse.pdf');z.write(p+'/CS.pdf','CS.pdf')
with zipfile.ZipFile(p+'/word.docx','w') as z:z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Garanție publică verificabilă</w:t></w:r></w:p></w:document>')
b=openpyxl.Workbook();b.active.append(['Valoare',150000,'=B1*2']);b.save(p+'/sheet.xlsx')
with zipfile.ZipFile(p+'/mixed.zip','w') as z:
 z.write(p+'/word.docx','word.docx');z.write(p+'/sheet.xlsx','sheet.xlsx');z.writestr('unknown.dwg','unsupported');z.writestr('../escape.txt','must not extract')
`,dir],AbortSignal.timeout(30000));});
afterAll(async()=>{await db?.sql.end();if(dir)await rm(dir,{recursive:true,force:true});});
describe.skipIf(!enabled)('offline document converters',()=>{
 it('merges a PDF that opens without a password while preserving its original bytes',async()=>{
  const signal=AbortSignal.timeout(60000),locked=join(dir,'restricted.pdf'),archive=join(dir,'restricted.zip');
  await runTool('qpdf',['--encrypt','','fixture-owner','256','--',join(dir,'long.pdf'),locked],signal);
  const before=await readFile(locked);
  await runTool('python3',['-c',"import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w'); z.write(sys.argv[2],'restricted.pdf'); z.write(sys.argv[3],'plain.pdf'); z.close()",archive,locked,join(dir,'long.pdf')],signal);
  const result=await prepareDocument(archive,'restricted.zip',join(dir,'restricted-out'),signal);
  expect(result.pages).toBe(330);expect(result.contents.every(p=>!p.error)).toBe(true);
  expect(await readFile(locked)).toEqual(before);
  expect(await runTool('pdfinfo',[result.pdf],signal)).toMatch(/Encrypted:\s+no/);
 },60000);
 it('prepares an attached P7M PDF while preserving signed original bytes and the inner filename',async()=>{
  const signal=AbortSignal.timeout(60000),source=join(dir,'CS.pdf.p7m'),key=join(dir,'p7m-key'),cert=join(dir,'p7m-cert');
  await runTool('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-subj','/CN=Fixture','-days','1'],signal);
  await runTool('openssl',['cms','-sign','-binary','-nodetach','-in',join(dir,'CS.pdf'),'-signer',cert,'-inkey',key,'-outform','DER','-out',source],signal);
  const original=await readFile(source);expect(await fileKind(source,'CS.pdf.p7m')).toBe('p7s');
  const result=await prepareDocument(source,'CS.pdf.p7m',join(dir,'p7m-out'),signal);
  expect(result.pages).toBe(30);expect(result.signature).toBe(SIGNATURE_VERIFIED);expect(result.contents[0]?.name).toBe('CS.pdf');
  expect(await readFile(source)).toEqual(original);expect(await runTool('pdftotext',[result.pdf,'-'],signal)).toContain('CAIET DE SARCINI');
 },60000);
 it('renders Word and Excel inside an archive with explicit omitted-file provenance',async()=>{
  const result=await prepareDocument(join(dir,'mixed.zip'),'mixed.zip',join(dir,'converted'),AbortSignal.timeout(60000));
  expect(result.pages).toBeGreaterThanOrEqual(2);expect(result.contents.filter(p=>p.rendition==='text')).toHaveLength(2);expect(result.contents.filter(p=>p.error)).toHaveLength(2);
  const text=await runTool('pdftotext',[result.pdf,'-'],AbortSignal.timeout(10000));expect(text).toContain('verificabilă');expect(text).toContain('150000');expect(text).toContain('=B1*2');
 },60000);
 it.skipIf(!db)('resumes a 165-page document across seven bounded jobs without source calls',async()=>{
  const q=db!.sql,key='formats-fixture';let hash:string|undefined,id:string|undefined;
  await q`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url) values(${key},'123',17,'SCN_TEST','Fixture','https://example.test')`;
  try{
   hash=await q.begin(tx=>storeFile(tx as unknown as DbSql,join(dir,'long.pdf'),'application/pdf')) as string;
   const [d]=await q`insert into app.procurement_documents(notice_key,source_id,code,filename,original_hash) values(${key},'123','SCN_TEST/1','long.pdf',${hash}) returning id`;id=d!.id;
   const [j]=await q`insert into app.document_jobs(notice_key,document_id,kind,dedup_key,requested_by,automatic) values(${key},${id!},'file',${'file:'+id},'fixture',true) returning id`;
   for(let batch=0;batch<7;batch++){
    const [job]=await q`update app.document_jobs set status='running' where id=${j!.id} returning *`;
    await runAutomaticJob(q,job!,'process',AbortSignal.timeout(90000));
    const [state]=await q`select j.status,j.error,d.processed_at,d.original_hash,(select count(*)::int from app.document_pages where document_id=d.id) pages from app.document_jobs j join app.procurement_documents d on d.id=j.document_id where j.id=${j!.id}`;
    expect(state!.error).toBeNull();expect(state!.original_hash).toBe(hash);expect(state!.pages).toBe(Math.min((batch+1)*25,165));expect(state!.status).toBe(batch<6?'queued':'complete');if(batch<6)expect(state!.processed_at).toBeNull();
   }
   expect(await q`select id from app.document_requests where job_id=${j!.id}`).toHaveLength(0);
  }finally{if(id){await q`delete from app.document_jobs where document_id=${id}`;await q`delete from app.document_pages where document_id=${id}`;await q`delete from app.procurement_documents where id=${id}`;}await q`delete from app.document_notices where key=${key}`;if(hash)await q`delete from app.document_blobs where hash=${hash}`;}
 },180000);
 it.skipIf(!db)('OCR visits specification pages in an archive first without changing page numbers or the original',async()=>{
  const q=db!.sql,key='priority-formats-fixture';let id:string|undefined;
  await q`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url) values(${key},'124',17,'SCN_PRIORITY','Fixture','https://example.test')`;
  try{
   const hash=await q.begin(tx=>storeFile(tx as unknown as DbSql,join(dir,'priority.zip'),'application/zip')) as string;
   const [d]=await q`insert into app.procurement_documents(notice_key,source_id,code,filename,original_hash) values(${key},'124','SCN_PRIORITY/1','priority.zip',${hash}) returning id`;id=d!.id;
   const [j]=await q`insert into app.document_jobs(notice_key,document_id,kind,dedup_key,requested_by,automatic) values(${key},${id!},'file',${'file:'+id},'fixture',true) returning id`;
   const [job]=await q`update app.document_jobs set status='running' where id=${j!.id} returning *`;
   await runAutomaticJob(q,job!,'process',AbortSignal.timeout(90000));
   const [state]=await q`select * from app.procurement_documents where id=${id!}`;
   expect(state).toMatchObject({original_hash:hash,processed_at:null,priority:0});
   expect(state!.preparation.contents).toMatchObject([{name:'priority.zip / planse.pdf',firstPage:1,pages:30},{name:'priority.zip / CS.pdf',firstPage:31,pages:30}]);
   const pages=await q`select page,text from app.document_pages where document_id=${id!} order by page`;
   expect(pages.map(p=>p.page)).toEqual(Array.from({length:25},(_,i)=>i+31));expect(pages.every(p=>p.text.includes('CAIET DE SARCINI'))).toBe(true);
   expect((await q`select status,error from app.document_jobs where id=${j!.id}`)[0]).toMatchObject({status:'queued',error:null});
   expect(await q`select id from app.document_requests where job_id=${j!.id}`).toHaveLength(0);
  }finally{if(id){await q`delete from app.document_jobs where document_id=${id}`;await q`delete from app.document_pages where document_id=${id}`;await q`delete from app.procurement_documents where id=${id}`;}await q`delete from app.document_notices where key=${key}`;}
 },180000);
});
