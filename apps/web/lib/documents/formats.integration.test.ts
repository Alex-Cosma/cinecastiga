import {afterAll,beforeAll,describe,it,expect} from 'vitest';
import {createDb,type DbSql} from '@seap/db';import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {runTool} from './process';import {prepareDocument} from './prepare';import {storeFile} from './blob-store';import {runDocumentJob} from './worker';import {runAutomaticJob} from './collection';
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
with zipfile.ZipFile(p+'/word.docx','w') as z:z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Garanție publică verificabilă</w:t></w:r></w:p></w:document>')
b=openpyxl.Workbook();b.active.append(['Valoare',150000,'=B1*2']);b.save(p+'/sheet.xlsx')
with zipfile.ZipFile(p+'/mixed.zip','w') as z:
 z.write(p+'/word.docx','word.docx');z.write(p+'/sheet.xlsx','sheet.xlsx');z.writestr('unknown.dwg','unsupported');z.writestr('../escape.txt','must not extract')
`,dir],AbortSignal.timeout(30000));});
afterAll(async()=>{await db?.sql.end();if(dir)await rm(dir,{recursive:true,force:true});});
describe.skipIf(!enabled)('offline document converters',()=>{
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
});
