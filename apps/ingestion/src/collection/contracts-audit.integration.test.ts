import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {createDb,CollectionSuspendedError} from '@seap/db';
import {ScrapeError} from '@seap/scraper-clients';
import {insertTasks,recoveryStep,recoveryWorker} from './runner.js';
import {task,CONTRACTS_AUDIT_VERSION} from './plan.js';
import {advertiseCollectorCapabilities,auditTask,cancelContractsAudit,collectorCapability,enqueueContractsAudit,CONTRACTS_AUDIT_PRIORITY} from './contracts-audit.js';
import {runNormalize} from '../normalize/pipeline.js';
const url=process.env['TEST_DATABASE_URL'];
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Isolated test DB required');
const connection=url?createDb(url):null;
const TAG='f27-fixture';
// A winner whose SICAP id is mapped to an entity with another valid CUI: as award-contracts:v1 this quarantines.
const conflicting=(noticeId:number)=>({total:1,items:[{caNoticeContractId:noticeId*10,caNoticeId:noticeId,contractNo:'C1',contractValue:100,winners:[{entityId:999992,fiscalNumber:'RO27390673',name:'Fixture SRL'}]}]});
describe.skipIf(!connection)('fetch-only contracts audit (isolated DB, no source traffic)',()=>{
 const q=connection?.sql as NonNullable<typeof connection>['sql'];
 const live=async()=>{await advertiseCollectorCapabilities(q,recoveryWorker);await q`insert into app.collection_workers(id,kind,state) values(${recoveryWorker+':0'},'ingestion','idle') on conflict(id) do update set heartbeat_at=clock_timestamp()`;};
 beforeAll(async()=>{await q`insert into app.collection_control(id) values(1) on conflict do nothing`;});
 beforeEach(async()=>{
  await q`truncate app.collection_tasks,app.collection_batches cascade`;await q`truncate app.collection_requests,app.collection_workers,app.collection_audit`;
  await q`truncate core.quarantine,core.normalize_watermarks,core.contract_winners,core.contracts,core.entity_sicap_ids,core.entities,raw.raw_documents restart identity cascade`;
  await q`delete from app.processing_runs where scheduled_day='2026-10-21'`;
  await q`update app.collection_control set paused=false,maintenance=false,blocked_reason=null,blocked_until=null,paused_streams='[]',daily_limit=null,background_lanes=1`;
  await q`insert into app.collection_batches(id,end_day,next_stream) values('fixture','2026-09-25',0)`;
 });
 afterAll(async()=>{await q?.end();});
 it('refuses to queue unless the live collector advertises the audit planner',async()=>{
  await expect(enqueueContractsAudit(q,{tag:TAG,ids:[1]})).rejects.toThrow('does not advertise contracts-audit:v1');
  // An advertisement without a live lane heartbeat (stopped or replaced collector) is not enough.
  await advertiseCollectorCapabilities(q,recoveryWorker);
  expect(await collectorCapability(q)).toMatchObject({alive:false,ready:false});
  await expect(enqueueContractsAudit(q,{tag:TAG,ids:[1]})).rejects.toThrow('no live collector');
  // A newer collector that does not advertise it (an old image) wins over the earlier advertisement.
  await live();
  await q`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:collector','Colector','collector-capabilities','{}','{"worker":"recovery:1:old","capabilities":[]}')`;
  await q`insert into app.collection_workers(id,kind,state) values('recovery:1:old:0','ingestion','idle')`;
  await expect(enqueueContractsAudit(q,{tag:TAG,ids:[1]})).rejects.toThrow('live collector without the capability');
  await live();
  expect(await collectorCapability(q)).toMatchObject({worker:recoveryWorker,alive:true,ready:true,capabilities:['contracts-audit:v1']});
  expect((await q`select count(*)::int n from app.collection_tasks`)[0]!.n).toBe(0);
 });
 it('queues background tasks idempotently, audited with the list hash, and refuses outside a single collecting batch or during processing',async()=>{
  await live();
  const ids=[2128622,2066275,2128430];
  const first=await enqueueContractsAudit(q,{tag:TAG,ids,actor:'alex'});
  const sha256=createHash('sha256').update([2066275,2128430,2128622].join('\n')).digest('hex');
  expect(first).toEqual({batchId:'fixture',tag:TAG,notices:3,queued:3,alreadyQueued:0,sha256,endpointVersion:CONTRACTS_AUDIT_VERSION,normalized:false,priority:CONTRACTS_AUDIT_PRIORITY});
  const rows=await q`select key,partition,stream,kind,params,priority,status from app.collection_tasks order by key`;
  expect(rows.map(r=>r.key)).toEqual(['awards:contracts:2066275:::audit:f27-fixture:0','awards:contracts:2128430:::audit:f27-fixture:0','awards:contracts:2128622:::audit:f27-fixture:0']);
  expect(rows[0]).toMatchObject({stream:'awards',kind:'contracts',priority:60,status:'pending',params:{noticeId:2066275,page:0,audit:TAG}});
  // Re-running (or overlapping with an ordinary contracts task for the same notice) adds nothing and collides with nothing.
  await insertTasks(q,[task('fixture','awards','contracts',{noticeId:2128622,page:0},1)]);
  expect(await enqueueContractsAudit(q,{tag:TAG,ids:[2128622,2066275,2128430],actor:'alex'})).toMatchObject({queued:0,alreadyQueued:3,sha256});
  expect(await enqueueContractsAudit(q,{tag:'f27-second',ids:[2128622]})).toMatchObject({queued:1});
  expect((await q`select count(*)::int n from app.collection_tasks`)[0]!.n).toBe(5);
  const [audit]=await q`select actor_id,after from app.collection_audit where action='contracts-audit' order by id limit 1`;
  expect(audit!.actor_id).toBe('system:contracts-audit');
  expect(audit!.after).toMatchObject({notices:3,queued:3,sha256,endpointVersion:'award-contracts-audit:v1',normalized:false,actor:'alex'});
  await expect(enqueueContractsAudit(q,{tag:TAG,ids:[1,1]})).rejects.toThrow('distinct');
  await expect(enqueueContractsAudit(q,{tag:'BAD',ids:[1]})).rejects.toThrow('--tag');
  await q`insert into app.processing_runs(scheduled_day,trigger,scope,control_revision,before_control) values('2026-10-21','manual','daily',1,'{}')`;
  await expect(enqueueContractsAudit(q,{tag:TAG,ids:[9]})).rejects.toThrow('processing run');
  await q`delete from app.processing_runs where scheduled_day='2026-10-21'`;
  await q`update app.collection_batches set status='collected'`;
  await expect(enqueueContractsAudit(q,{tag:TAG,ids:[9]})).rejects.toThrow('collecting recovery batch');
  expect((await q`select count(*)::int n from app.collection_tasks`)[0]!.n).toBe(5);
  expect((await q`select count(*)::int n from app.collection_requests`)[0]!.n).toBe(0);
 });
 it('fetches in the background tier and archives a separate, never-deduplicated audit envelope',async()=>{
  // The ordinary archive of the very same response already exists.
  const ordinary=task('fixture','awards','contracts',{noticeId:2128622,page:0},1);
  await insertTasks(q,[ordinary,auditTask('fixture',2128622,TAG)]);
  await q`update app.collection_control set background_lanes=0`;
  const seen:number[]=[];
  expect(await recoveryStep(q,async t=>{seen.push(t.priority);return conflicting(2128622);},'0')).toBe(true);
  expect(await recoveryStep(q,async()=>{throw Error('background lanes are off');},'0')).toBe(false);
  await q`update app.collection_control set background_lanes=1`;
  expect(await recoveryStep(q,async t=>{seen.push(t.priority);expect(t.params.audit).toBe(TAG);return conflicting(2128622);},'0')).toBe(true);
  expect(seen).toEqual([1,60]);
  const raw=await q`select external_id,endpoint_version,payload from raw.raw_documents order by id`;
  expect(raw.map(r=>[r.external_id,r.endpoint_version])).toEqual([['award:2128622','award-contracts:v1'],['award:2128622',CONTRACTS_AUDIT_VERSION]]);
  // The shape the F27 analysis reads: payload caNoticeId, items[].winners[], audit.tag.
  const [shape]=await q`select (payload->>'caNoticeId')::bigint notice,payload#>>'{audit,tag}' tag,jsonb_array_length(payload->'items') items,payload#>>'{items,0,winners,0,fiscalNumber}' fiscal
   from raw.raw_documents where endpoint_version='award-contracts-audit:v1' and payload#>>'{audit,tag}'=${TAG}`;
  expect(shape).toEqual({notice:'2128622',tag:TAG,items:1,fiscal:'RO27390673'});
  expect(raw[1]!.payload).toEqual({...raw[0]!.payload,audit:{tag:TAG}});
  expect(await recoveryStep(q,async()=>{throw Error('no work expected');},'0')).toBe(false);
  expect((await q`select status from app.collection_batches`)[0]!.status).toBe('collected');
 });
 it('keeps an audit next page in the background with its tag',async()=>{
  await insertTasks(q,[auditTask('fixture',77,TAG)]);
  const items=Array.from({length:200},(_,i)=>({caNoticeContractId:i+1}));
  expect(await recoveryStep(q,async()=>({total:201,items}),'0')).toBe(true);
  const [next]=await q`select key,priority,params,status from app.collection_tasks where (params->>'page')::int=1`;
  expect(next).toMatchObject({key:'awards:contracts:77:::audit:f27-fixture:1',priority:60,params:{noticeId:77,page:1,audit:TAG},status:'pending'});
  expect(await recoveryStep(q,async()=>({total:201,items:[{caNoticeContractId:201}]}),'0')).toBe(true);
  const [doc]=await q`select endpoint_version,jsonb_array_length(payload->'items') n from raw.raw_documents`;
  expect(doc).toEqual({endpoint_version:CONTRACTS_AUDIT_VERSION,n:201});
 });
 it('fails only the audit task on unavailable notices or rejected pages; other failures still stop collection',async()=>{
  await insertTasks(q,[auditTask('fixture',1,TAG),auditTask('fixture',2,TAG),auditTask('fixture',3,TAG),auditTask('fixture',4,TAG)]);
  const blocked=async()=>(await q`select blocked_reason from app.collection_control`)[0]!.blocked_reason;
  expect(await recoveryStep(q,async()=>{throw new ScrapeError('Gone','https://e-licitatie.ro/api-pub/fixture',404,1);},'0')).toBe(true);
  expect(await blocked()).toBeNull();
  expect(await recoveryStep(q,async()=>({total:2,items:[{caNoticeContractId:5}]}),'0')).toBe(true);
  expect(await blocked()).toBeNull();
  const failed=await q`select params->>'noticeId' n,error from app.collection_tasks where status='failed' order by id`;
  expect(failed.map(r=>r.n)).toEqual(['1','2']);
  expect(failed[0]!.error).toContain('HTTP 404');expect(failed[1]!.error).toContain('Numărul');
  // A gate refusal (403/429/challenge already set the block in the gate) returns the task to the queue.
  expect(await recoveryStep(q,async()=>{throw new CollectionSuspendedError('SEAP a refuzat accesul (403).');},'0')).toBe(false);
  expect((await q`select status from app.collection_tasks where params->>'noticeId'='3'`)[0]!.status).toBe('pending');
  // Anything that is not a source verdict on this notice (transport, SQL, unknown) keeps the global stop.
  expect(await recoveryStep(q,async()=>{throw Error('socket hang up');},'0')).toBe(true);
  expect(await blocked()).toMatch(/^Sarcina/);
 });
 it('cancels only pending tasks of the tag, as superseded work rather than a gap',async()=>{
  await insertTasks(q,[auditTask('fixture',1,TAG),auditTask('fixture',2,TAG),auditTask('fixture',3,'other-tag'),task('fixture','awards','contracts',{noticeId:1,page:0},1)]);
  await q`update app.collection_tasks set status='complete' where params->>'noticeId'='2' and params->>'audit'=${TAG}`;
  expect(await cancelContractsAudit(q,{tag:TAG,actor:'alex'})).toEqual({tag:TAG,cancelled:1,running:0,complete:1,failed:0});
  const rows=await q`select params->>'noticeId' n,params->>'audit' tag,status,error from app.collection_tasks order by id`;
  expect(rows.map(r=>[r.n,r.tag,r.status])).toEqual([['1',TAG,'split'],['2',TAG,'complete'],['3','other-tag','pending'],['1',null,'pending']]);
  expect(rows[0]!.error).toContain('anulată de operator');
  expect((await q`select after from app.collection_audit where action='contracts-audit-cancel'`)[0]!.after).toMatchObject({cancelled:1,actor:'alex'});
  expect(await cancelContractsAudit(q,{tag:TAG})).toMatchObject({cancelled:0});
  await expect(cancelContractsAudit(q,{tag:'x y'})).rejects.toThrow('--tag');
  // Cancelled audit work is not a recovery gap.
  await q`update app.collection_tasks set status='complete' where status='pending'`;
  expect(await recoveryStep(q,async()=>{throw Error('no work expected');},'0')).toBe(false);
  expect((await q`select status from app.collection_batches`)[0]!.status).toBe('collected');
 });
 it('is never normalized: an audit row with a SICAP id/CUI conflict is neither processed nor quarantined',async()=>{
  const [e]=await q`insert into core.entities(name_display,name_normalized,cui_canonical,cui_valid) values('Fixture','fixture','33240921',true) returning id`;
  await q`insert into core.entity_sicap_ids(namespace,sicap_id,entity_id) values('winner',999992,${e!.id})`;
  await insertTasks(q,[auditTask('fixture',2128622,TAG)]);
  expect(await recoveryStep(q,async()=>conflicting(2128622),'0')).toBe(true);
  const [audit]=await q`select id::text from raw.raw_documents where endpoint_version=${CONTRACTS_AUDIT_VERSION}`;
  const {db,sql}=connection!;
  const report=await runNormalize(db,sql);
  expect({processed:report.processed,quarantined:report.quarantined}).toEqual({processed:0,quarantined:0});
  expect(report.perTransform.map(t=>t.transform)).not.toContain(CONTRACTS_AUDIT_VERSION);
  expect((await q`select count(*)::int n from core.contracts`)[0]!.n).toBe(0);
  // Control: the same records as an ordinary archive do quarantine, and the retry (reopen) pass never picks the audit row.
  await q`insert into raw.raw_documents(source,external_id,endpoint_version,content_hash,payload) select source,external_id,'award-contracts:v1','control',payload-'audit' from raw.raw_documents where id=${audit!.id}`;
  const control=await runNormalize(db,sql);
  expect(control).toMatchObject({processed:0,quarantined:1});
  expect((await q`select zod_error from core.quarantine`)[0]!.zod_error).toContain('Conflicting valid CUI');
  await q`update core.quarantine set retry_required=true`;
  await q`insert into core.quarantine(raw_id,endpoint_version,zod_error,retry_required) values(${audit!.id},${CONTRACTS_AUDIT_VERSION},'fixture: forced open',true)`;
  const retry=await runNormalize(db,sql);
  expect(retry).toMatchObject({processed:0,quarantined:1});
  expect((await q`select count(*)::int n from core.quarantine where raw_id=${audit!.id}`)[0]!.n).toBe(1);
  expect((await q`select count(*)::int n from core.normalize_watermarks where transform=${CONTRACTS_AUDIT_VERSION}`)[0]!.n).toBe(0);
 });
});
