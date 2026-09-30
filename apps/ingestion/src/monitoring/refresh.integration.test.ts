import {afterAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDb} from '@seap/db';
import {runMonitoringRefresh,MONITORING_METHODOLOGY} from './refresh.js';
import {runFlags} from '../flags/build.js';
import {runFlagMarts} from '../flags/marts.js';
import {runNormalize} from '../normalize/pipeline.js';
import {runTransactionMarts} from '../normalize/transaction-marts.js';
import {validateBatch1Snapshot} from './validate.js';
vi.mock('../normalize/pipeline.js',()=>({runNormalize:vi.fn(async()=>({processed:2,quarantined:0}))}));
vi.mock('../normalize/reconcile.js',()=>({runReconcile:vi.fn(async()=>({links:3}))}));
vi.mock('../normalize/ted-mart.js',()=>({runTedMart:vi.fn(async()=>({}))}));
vi.mock('../normalize/transaction-marts.js',()=>({runTransactionMarts:vi.fn(async()=>({daTransactions:2}))}));
vi.mock('../normalize/marts.js',()=>({runMarts:vi.fn(async()=>({}))}));
vi.mock('../flags/build.js',()=>({runFlags:vi.fn(async()=>({flags:10}))}));
vi.mock('../flags/marts.js',()=>({runFlagMarts:vi.fn(async()=>({instances:10}))}));
vi.mock('../flags/radiografie.js',()=>({runRadiografieMarts:vi.fn(async()=>({}))}));
vi.mock('../normalize/coverage.js',()=>({runCoverage:vi.fn(async()=>({}))}));
vi.mock('./coverage.js',()=>({monitoringSourceCoverage:vi.fn(async()=>({complete:false})),validateCoverageCounts:vi.fn(async()=>({check:'coverage',passed:true}))}));
vi.mock('./validate.js',()=>({validateBatch1Snapshot:vi.fn(async()=>[{check:'annual_signal_source_membership',passed:true}])}));
const url=process.env['TEST_DATABASE_URL'];
if(url&&new URL(url).pathname!='/seap_test_processing')throw Error('Dedicated processing test database required');
describe.skipIf(!url)('daily risk provenance with real publication gate and stubbed expensive builders',()=>{
 const {db,sql}=createDb(url);
 beforeEach(async()=>{vi.clearAllMocks();await sql`truncate app.monitoring_refreshes cascade`;});
 afterAll(async()=>{await sql.end({timeout:5});});
 async function baseline(){
  const [row]=await sql`insert into app.monitoring_refreshes(kind,status,completed_at,methodology,validation)
    values('coordinated','ready','2026-09-27T15:00:00Z',${JSON.stringify(MONITORING_METHODOLOGY)}::jsonb,
      '{"stages":{"flags":{"n":10},"flag-marts":{"n":10}}}') returning id`;
  return String(row!.id);
 }
 it('daily preserves the weekly risk date and checkpoint across successive days',async()=>{
  const source=await baseline();
  for(let i=0;i<2;i++){
   const checkpoint=await runMonitoringRefresh(db,sql,{mode:'coordinated',scope:'daily',maxRawId:123n});
   expect(checkpoint.status).toBe('ready');
   expect(checkpoint.validation['risk']).toEqual({checkpointId:source,calculatedAt:'2026-09-27T15:00:00.000Z',recalculated:false});
   expect(checkpoint.validation['rawBoundary']).toBe('123');
  }
  expect(runFlags).not.toHaveBeenCalled();expect(runFlagMarts).not.toHaveBeenCalled();
  expect(runTransactionMarts).toHaveBeenCalledTimes(2);
  expect(runNormalize).toHaveBeenCalledWith(db,sql,expect.objectContaining({maxRawId:123n}));
  expect(validateBatch1Snapshot).toHaveBeenCalledWith(expect.anything(),{fullProfiles:true,allAnnual:true},expect.any(Function));
 });
 it('requires a full baseline before any daily mutation',async()=>{
  await expect(runMonitoringRefresh(db,sql,{mode:'coordinated',scope:'daily'})).rejects.toThrow('baseline');
  expect(runNormalize).not.toHaveBeenCalled();
  expect((await sql`select status from app.monitoring_refreshes order by version desc limit 1`)[0]!.status).toBe('failed');
 });
 it('does not reuse risk after an intervening manual write',async()=>{
  await baseline();await sql`insert into app.monitoring_refreshes(kind,status,completed_at) values('manual','failed',now())`;
  await expect(runMonitoringRefresh(db,sql,{mode:'coordinated',scope:'daily'})).rejects.toThrow('baseline');
  expect(runNormalize).not.toHaveBeenCalled();
 });
 it('rejects the old UTC-period risk baseline before any daily data mutation',async()=>{
  await baseline();
  await sql`update app.monitoring_refreshes set methodology=jsonb_set(methodology,'{flags}','"rf-2026.5"')`;
  await expect(runMonitoringRefresh(db,sql,{mode:'coordinated',scope:'daily'})).rejects.toThrow('baseline');
  expect(runNormalize).not.toHaveBeenCalled();expect(runFlags).not.toHaveBeenCalled();
 });
 it('full refresh recalculates risk and stores a fresh calculation date',async()=>{
  await baseline();const start=Date.now();
  const cp=await runMonitoringRefresh(db,sql,{mode:'coordinated',scope:'full'});
  expect(runFlags).toHaveBeenCalledOnce();expect(runFlagMarts).toHaveBeenCalledOnce();
  expect(runTransactionMarts).toHaveBeenCalledOnce();
  expect(vi.mocked(runFlagMarts).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(runTransactionMarts).mock.invocationCallOrder[0]!);
  expect(vi.mocked(runTransactionMarts).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(validateBatch1Snapshot).mock.invocationCallOrder[0]!);
  const risk=cp.validation['risk'] as {calculatedAt:string;recalculated:boolean};
  expect(risk.recalculated).toBe(true);expect(new Date(risk.calculatedAt).getTime()).toBeGreaterThanOrEqual(start);
 });
 it('refuses publication when the complete signal lookup differs from its sources',async()=>{
  await baseline();
  vi.mocked(validateBatch1Snapshot).mockResolvedValueOnce([{check:'complete_signal_lookup',passed:false,scope:'all signals',details:{mismatches:'1'}}]);
  await expect(runMonitoringRefresh(db,sql,{mode:'coordinated',scope:'daily'})).rejects.toThrow('complete_signal_lookup');
  expect((await sql`select status from app.monitoring_refreshes order by version desc limit 1`)[0]!.status).toBe('failed');
 });
});
