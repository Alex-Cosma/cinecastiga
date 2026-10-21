import {describe,expect,it} from 'vitest';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {PARSERS} from '../normalize/parsers.js';
import {planResponse,task,CONTRACTS_AUDIT_VERSION} from './plan.js';
import {auditTask,parseAuditNoticeIds,parseContractsAuditArgs,validateAuditTag,CONTRACTS_AUDIT_MAX,CONTRACTS_AUDIT_PRIORITY} from './contracts-audit.js';
const end='2026-09-25';
const rows=(start:number,count:number)=>Array.from({length:count},(_,i)=>({caNoticeContractId:start+i,contractValue:10,winners:[{entityId:start+i,fiscalNumber:'RO123'}]}));
describe('fetch-only contracts audit plans (no network)',()=>{
 it('keeps audit tasks in their own partition and key, in the background tier',()=>{
  const ordinary=task('fixture','awards','contracts',{noticeId:2128622,page:0},1);
  const audit=auditTask('fixture',2128622,'f27-20261021');
  expect(audit.partition).toBe(`${ordinary.partition}:audit:f27-20261021`);
  expect(audit.key).toBe('awards:contracts:2128622:::audit:f27-20261021:0');
  expect(audit.key).not.toBe(ordinary.key);
  expect(auditTask('fixture',2128622,'other').key).not.toBe(audit.key);
  expect(audit).toMatchObject({stream:'awards',kind:'contracts',priority:CONTRACTS_AUDIT_PRIORITY,params:{noticeId:2128622,page:0,audit:'f27-20261021'}});
  expect(CONTRACTS_AUDIT_PRIORITY).toBeGreaterThanOrEqual(50);
  expect(()=>task('fixture','awards','detail',{noticeId:1,page:0,audit:'x'})).toThrow('award contract pages only');
  expect(()=>task('fixture','tenders','contracts',{noticeId:1,page:0,audit:'x'})).toThrow('award contract pages only');
  expect(()=>task('fixture','awards','contracts',{noticeId:1,page:0,audit:'Bad Tag'})).toThrow('^[a-z0-9-]');
 });
 it('archives a single-page audit under its own version with the tag inside the payload',()=>{
  const ordinary=planResponse(task('fixture','awards','contracts',{noticeId:7,page:0},1),{total:2,items:rows(1,2)},[],end);
  const audit=planResponse(auditTask('fixture',7,'f27-20261021'),{total:2,items:rows(1,2)},[],end);
  expect(ordinary.docs[0]!.endpointVersion).toBe('award-contracts:v1');
  expect(audit.docs).toHaveLength(1);
  expect(audit.docs[0]).toMatchObject({source:'elicitatie',externalId:'award:7',endpointVersion:CONTRACTS_AUDIT_VERSION});
  expect(CONTRACTS_AUDIT_VERSION).toBe('award-contracts-audit:v1');
  expect(audit.docs[0]!.payload).toEqual({...(ordinary.docs[0]!.payload as object),audit:{tag:'f27-20261021'}});
  expect(audit.children).toHaveLength(0);
 });
 it('gives next pages the parent priority and tag, and archives only after the last page',()=>{
  const parent=auditTask('fixture',9,'f27-20261021');
  const a=planResponse(parent,{total:201,items:rows(1,200)},[],end);
  expect(a.docs).toHaveLength(0);
  expect(a.children).toHaveLength(1);
  expect(a.children[0]).toMatchObject({priority:CONTRACTS_AUDIT_PRIORITY,partition:parent.partition,key:`${parent.partition}:1`,params:{noticeId:9,page:1,audit:'f27-20261021'}});
  const b=planResponse(a.children[0]!,{total:201,items:rows(201,1)},[a.result as any],end);
  expect(b.docs[0]!.endpointVersion).toBe(CONTRACTS_AUDIT_VERSION);
  expect((b.docs[0]!.payload as any).items).toHaveLength(201);
  expect((b.docs[0]!.payload as any).audit).toEqual({tag:'f27-20261021'});
  // Ordinary pagination is unchanged: next page at priority 0, no tag.
  const o=planResponse(task('fixture','awards','contracts',{noticeId:9,page:0},1),{total:201,items:rows(1,200)},[],end);
  expect(o.children[0]).toMatchObject({priority:0,params:{noticeId:9,page:1}});
  expect(o.children[0]!.params.audit).toBeUndefined();
 });
 it('keeps the same validation as ordinary contract pages',()=>{
  expect(()=>planResponse(auditTask('fixture',9,'t'),{total:1,items:[{caNoticeContractId:0}]},[],end)).toThrow('nevalizi');
  expect(()=>planResponse(auditTask('fixture',9,'t'),{nope:true},[],end)).toThrow('Structură');
 });
});
describe('contracts-audit command line',()=>{
 it('parses enqueue, cancel and capability forms and refuses anything else',()=>{
  expect(parseContractsAuditArgs(['--tag=f27-20261021'])).toEqual({action:'enqueue',tag:'f27-20261021'});
  expect(parseContractsAuditArgs(['--cancel','--tag=f27-20261021'])).toEqual({action:'cancel',tag:'f27-20261021'});
  expect(parseContractsAuditArgs(['--tag=f27','--cancel'])).toEqual({action:'cancel',tag:'f27'});
  expect(parseContractsAuditArgs(['--capability'])).toEqual({action:'capability'});
  for(const bad of [[],['--cancel'],['--tag=a','--tag=b'],['--tag=a','--limit=3'],['--capability','--tag=a'],['--cancel','--cancel','--tag=a'],['f27']])expect(()=>parseContractsAuditArgs(bad)).toThrow('Usage');
  for(const tag of ['','F27','f27_x','a b','x'.repeat(41),'f27;drop','ă'])expect(()=>parseContractsAuditArgs([`--tag=${tag}`])).toThrow('--tag must match');
  expect(validateAuditTag('x'.repeat(40))).toBe('x'.repeat(40));
 });
 it('reads positive public IDs, deduplicated and sorted, within the cap',()=>{
  expect(parseAuditNoticeIds('2128622\n2066275\r\n2128622\n\n 100532825 ,7\n')).toEqual([7,2066275,2128622,100532825]);
  for(const bad of ['0','-5','12a','1.5','1e3','9007199254740993','0012'])expect(()=>parseAuditNoticeIds(`1\n${bad}\n`)).toThrow('Invalid caNoticeId');
  expect(()=>parseAuditNoticeIds('\n \n')).toThrow('No caNoticeId');
  const many=Array.from({length:CONTRACTS_AUDIT_MAX+1},(_,i)=>i+1).join('\n');
  expect(()=>parseAuditNoticeIds(many)).toThrow(`At most ${CONTRACTS_AUDIT_MAX}`);
  expect(parseAuditNoticeIds(many.split('\n').slice(0,CONTRACTS_AUDIT_MAX).join('\n'))).toHaveLength(CONTRACTS_AUDIT_MAX);
 });
});
describe('award-contracts-audit:v1 stays inert (source guard)',()=>{
 const root=join(import.meta.dirname,'../../../..');
 const read=(f:string)=>readFileSync(join(root,f),'utf8');
 it('has no parser, so the normalizer and its quarantine retry never select it',()=>{
  expect(Object.keys(PARSERS)).not.toContain(CONTRACTS_AUDIT_VERSION);
  expect(read('apps/ingestion/src/normalize/pipeline.ts')).not.toContain('audit');
 });
 it('every raw reader of contract archives filters versions by exact value',()=>{
  const exact:Record<string,string[]>={
   'apps/ingestion/src/normalize/discover-contract-identities.ts':["endpoint_version in ('award-list:v1','award-contracts:v1')"],
   'apps/ingestion/src/normalize/revalidate-contract-identities.ts':["endpoint_version in ('award-list:v1','award-contracts:v1')"],
   'apps/ingestion/src/normalize/scheduled-contract-identity.ts':["endpoint_version in ('award-list:v1','award-contracts:v1')"],
   'apps/ingestion/src/normalize/contract-identity-archives.ts':["not in ('award-list:v1','award-contracts:v1')"],
   'apps/ingestion/src/normalize/contract-reporting.ts':["r.endpoint_version='award-contracts:v1'"],
   'apps/ingestion/src/normalize/contract-money-replay.ts':["r.endpoint_version='award-contracts:v1'"],
   'packages/db/src/contract-money-quality.ts':["r.endpoint_version='award-contracts:v1'"],
  };
  for(const [file,filters] of Object.entries(exact))for(const f of filters)expect(read(file),file).toContain(f);
 });
 it('nothing matches endpoint versions by prefix or pattern',()=>{
  const files:string[]=[];
  const walk=(dir:string)=>{for(const name of readdirSync(join(root,dir))){
   const rel=join(dir,name);if(['node_modules','dist','.next','migrations'].includes(name))continue;
   if(statSync(join(root,rel)).isDirectory())walk(rel);else if(/\.(ts|tsx|mjs|sql)$/.test(name)&&!/\.test\.ts$/.test(name))files.push(rel);
  }};
  for(const dir of ['apps/ingestion/src','packages/db/src','apps/web/lib','apps/web/app'])walk(dir);
  expect(files.length).toBeGreaterThan(100);
  const pattern=/endpoint_?version\W{0,4}\s*(not\s+)?(like|ilike|similar|~)|endpointVersion\??\.(startsWith|endsWith|includes|match|split)/i;
  expect(files.filter(f=>pattern.test(read(f)))).toEqual([]);
  // The audit version is spelled out only where it is declared.
  expect(files.filter(f=>read(f).includes('award-contracts-audit'))).toEqual(['apps/ingestion/src/collection/plan.ts']);
 });
});
