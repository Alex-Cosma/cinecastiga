import {afterAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createDb} from '@seap/db';
vi.mock('./repair.js',()=>({repairFinancials:vi.fn(),repairOnrc:vi.fn()}));
import {repairFinancials,repairOnrc} from './repair.js';
import {runScheduledReferenceRepair,verifyReferenceBundle} from './scheduled-repair.js';
const url=process.env.DATABASE_URL;
const isolated=url&&['localhost','127.0.0.1'].includes(new URL(url).hostname)&&new URL(url).pathname==='/seap_test_references_guards';
const {sql:q}=createDb(url);
const dir=mkdtempSync(join(tmpdir(),'seap-reference-once-'));
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const source={year:2025,category:'UU',vintage:2025,sha256:hash('data'),specSha256:hash('spec'),rows:1,code:'I18'};
const file='2025-WEB_UU_AN2025.txt';
const bundle={version:1,snapshot:'2026-07-08',onrc:{file:'onrc.csv',sha256:hash('onrc')},financials:[{file,...source}]};
const manifest=JSON.stringify(bundle);
const id='00000000-0000-4000-8000-000000009999';
afterAll(async()=>{await q.end();rmSync(dir,{recursive:true,force:true});});
describe.skipIf(!isolated)('reference publication gate (isolated database; repair mechanics tested separately)',()=>{
 beforeEach(async()=>{
  vi.resetAllMocks();mkdirSync(join(dir,'financials'),{recursive:true});
  writeFileSync(join(dir,'manifest.json'),manifest);writeFileSync(join(dir,'onrc.csv'),'onrc');
  writeFileSync(join(dir,'financials',file),'data');writeFileSync(join(dir,'financials',file+'.spec.csv'),'spec');
  await q`truncate app.data_repairs,app.processing_runs`;
  await q`insert into app.collection_control(id,maintenance,paused,revision) values(1,true,true,1)
    on conflict(id) do update set maintenance=true,paused=true,revision=1`;
  await q`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
    values(${id}::uuid,'2026-10-04','full',1,'{}','100','backup-verified','{"backup":{"completedAt":"2026-10-04T02:00:00Z"}}')`;
  await q`insert into app.data_repairs(id,scheduled_day,report) values('reference-import-v1','2026-10-04',
    ${JSON.stringify({configuration:{directory:dir,manifestSha256:hash(manifest)}})}::jsonb)`;
  vi.mocked(repairFinancials).mockResolvedValue({changed:1,impact:[],manifest:[source],skipped:[]});
  vi.mocked(repairOnrc).mockResolvedValue({snapshot:bundle.snapshot,sha256:bundle.onrc.sha256,formats:{},changed:1,before:{},after:{}});
 });
 it('pins file contents and refuses changed evidence',async()=>{
  await expect(verifyReferenceBundle(dir,hash(manifest))).resolves.toBeTruthy();
  writeFileSync(join(dir,'onrc.csv'),'changed');
  await expect(runScheduledReferenceRepair(q,id)).rejects.toThrow('checksum');
  expect(repairFinancials).not.toHaveBeenCalled();
  expect((await q`select status from app.data_repairs`)[0]!.status).toBe('failed');
 });
 it('requires full scope, backup, date and maintenance',async()=>{
  for(const bad of ['scope','backup','day','maintenance']){
   await q`update app.data_repairs set status='scheduled',scheduled_day=${bad==='day'?'2026-10-03':'2026-10-04'}::date`;
   await q`update app.processing_runs set scope=${bad==='scope'?'daily':'full'},stage='backup-verified',
     stages=${JSON.stringify(bad==='backup'?{}:{backup:{completedAt:'2026-10-04T02:00:00Z'}})}::jsonb`;
   await q`update app.collection_control set maintenance=${bad!=='maintenance'}`;
   await expect(runScheduledReferenceRepair(q,id)).rejects.toThrow();
  }
  expect(repairFinancials).not.toHaveBeenCalled();
 });
 it('runs once and leaves completion to the verified publication',async()=>{
  await runScheduledReferenceRepair(q,id);
  expect((await q`select status from app.data_repairs`)[0]!.status).toBe('applied');
  await expect(runScheduledReferenceRepair(q,id)).rejects.toThrow('operator recovery');
  await q`update app.data_repairs set status='completed'`;
  expect(await runScheduledReferenceRepair(q,id)).toBeNull();expect(repairFinancials).toHaveBeenCalledTimes(1);
 });
 it('rolls back financial changes if ONRC fails',async()=>{
  await q`delete from reference.company_financials where cui='99999999999'`;
  vi.mocked(repairFinancials).mockImplementation(async sql=>{
   await sql`insert into reference.company_financials(cui,year,category,source_vintage) values('99999999999',2025,'UU',2025)`;
   return {changed:1,impact:[],manifest:[source],skipped:[]};
  });
  vi.mocked(repairOnrc).mockRejectedValue(Error('Source mismatch'));
  await expect(runScheduledReferenceRepair(q,id)).rejects.toThrow('Source mismatch');
  expect((await q`select count(*)::int n from reference.company_financials where cui='99999999999'`)[0]!.n).toBe(0);
  expect((await q`select status from app.data_repairs`)[0]!.status).toBe('failed');
  expect((await q`select maintenance from app.collection_control`)[0]!.maintenance).toBe(true);
 });
});
