import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const script=new URL('./process-nightly.sh',import.meta.url).pathname;
const runId='00000000-0000-4000-8000-000000000001',digest='ab'.repeat(32);
async function run(failure='',due=true,args=[],rawResume=false,mode='in-place'){
 const dir=await mkdtemp(join(tmpdir(),'seap-nightly-'));
 try{
  await mkdir(join(dir,'bin'));await mkdir(join(dir,'.git'));await mkdir(join(dir,'infra/prod'),{recursive:true});
  const docker=`echo "docker $*" >> "$TEST_LOG"
case "$*" in
 *"processing.js claim"|*"processing.js claim-repair reference-import-v1"|*"processing.js claim-recovery 11111111-1111-4111-8111-111111111111") if read -r caller_input; then echo "CONSUMED_CALLER_INPUT" >> "$TEST_LOG"; fi; if [ "$TEST_DUE" = yes ]; then echo 00000000-0000-4000-8000-000000000001; fi;;
 *"ps --status running -q collection") echo collection-fixture;;
 "inspect --format "*) echo False;;
 *"select mode from app.processing_runs"*) echo "$TEST_MODE";;
 *"psql -X -v ON_ERROR_STOP=1 -U seap -d seap -Atc "*) if [ "$TEST_FAILURE" = drain ]; then exit 1; fi; echo 0;;
 *"select maintenance and collection_during_maintenance"*) [ "$TEST_RAW_RESUME" = yes ] && echo t || echo f;;
 *"pg_dump "*) echo backup; if [ "$TEST_FAILURE" = backup ]; then exit 1; fi;;
 *"pg_restore --list"*) cat >/dev/null; echo archive;;
 *"processing.js refresh "*) if [ "$TEST_FAILURE" = refresh ]; then exit 1; fi;;
 *"processing.js swap "*) if [ "$TEST_FAILURE" = swap ]; then exit 1; fi;;
 *"source-search.js"*) if [ "$TEST_FAILURE" = search ]; then exit 1; fi;;
esac`;
  // The public page answers 200 only when the test says the proxy never closed.
  const curl='echo "curl $*" >> "$TEST_LOG"\ncase "$*" in *api/health*) echo 200;; *) if [ "$TEST_FAILURE" = open ]; then echo 200; else echo 503; fi;; esac';
  // Gate retries and the in-flight grace are logged, not waited; the heartbeat keeps real sleep.
  const sleep='case "$1" in 3|30) echo "sleep $1" >> "$TEST_LOG";; *) exec /bin/sleep "$@";; esac';
  // The search step's bound is logged, then its command runs (options, then the duration, then the command).
  const timeout='echo "timeout $*" >> "$TEST_LOG"\nwhile [ "${1#-}" != "$1" ]; do shift; done\nshift\nexec "$@"';
  const bins={docker,flock:'[ "$TEST_FAILURE" != lock ]',curl,sleep,timeout,sha256sum:`cat >/dev/null; case "$TEST_FAILURE" in checksum) exit 1;; checksum-empty) exit 0;; esac; echo '${digest}  -'`};
  for(const [name,body] of Object.entries(bins))await writeFile(join(dir,'bin',name),'#!/bin/sh\n'+body+'\n',{mode:0o755});
  // The shadow preparation is its own script (shadow-prepare.sh, tested apart): here it only logs, or fails.
  await writeFile(join(dir,'infra/prod/shadow-prepare.sh'),'#!/bin/sh\necho "shadow-prepare $*" >> "$TEST_LOG"\n[ "$TEST_FAILURE" != prepare ]\n',{mode:0o755});
  const r=spawnSync('bash',[script,...args],{input:'caller-script-must-not-reach-container\n',env:{...process.env,PATH:join(dir,'bin')+':'+process.env.PATH,SEAP_DEPLOY_CHECKOUT:dir,SEAP_PROCESSING_BACKUPS:join(dir,'backups'),TEST_LOG:join(dir,'calls'),TEST_FAILURE:failure,TEST_RAW_RESUME:rawResume?'yes':'no',TEST_DUE:due?'yes':'no',TEST_MODE:mode,SHADOW_MIN_FREE_KB:'1'},encoding:'utf8'});
  const backup=join(dir,'backups',runId);
  return {status:r.status,calls:await readFile(join(dir,'calls'),'utf8').catch(()=> ''),backup,
   files:(await readdir(backup).catch(()=>[])).sort(),
   dump:await readFile(join(backup,'database.dump'),'utf8').catch(()=>null),
   checksum:await readFile(join(backup,'database.sha256'),'utf8').catch(()=>null)};
 }finally{await rm(dir,{recursive:true,force:true});}
}
test('no due run makes no changes and never consumes its caller input',async()=>{const r=await run('',false);assert.equal(r.status,0);assert.doesNotMatch(r.calls,/stop |pg_dump|refresh |finish |CONSUMED_CALLER_INPUT/);});
test('deployment lock conflict exits before touching containers or database',async()=>{const r=await run('lock');assert.equal(r.status,0);assert.equal(r.calls,'');});
test('drain, backup and processing failure retain maintenance and never finish or restart workers',async()=>{
 for(const failure of ['drain','backup','checksum','checksum-empty','refresh']){const r=await run(failure);assert.equal(r.status,1);assert.match(r.calls,/processing.js fail /);assert.doesNotMatch(r.calls,/processing.js finish |restart web|up -d/);if(failure==='drain')assert.doesNotMatch(r.calls,/stop collection documents|pg_dump/);}
});
test('a failed dump or streamed checksum leaves only a .partial file, never a restore point',async()=>{
 for(const failure of ['backup','checksum','checksum-empty']){
  const r=await run(failure);assert.equal(r.status,1,failure);
  assert.doesNotMatch(r.calls,/pg_restore --list|backup-verified/,failure);
  assert.ok(r.files.includes('database.dump.partial'),failure);
  for(const name of ['database.dump','database.list','database.sha256'])assert.ok(!r.files.includes(name),`${failure}: ${name}`);
 }
});
test('the dump is zstd-compressed and its streamed SHA-256 names the final file',async()=>{
 const r=await run();assert.equal(r.status,0);
 assert.match(r.calls,/exec cinecastiga-postgres-1 pg_dump -U seap -d seap -Fc --compress=zstd:1 --exclude-table-data=marts\.source_search\n/);
 assert.equal(r.dump,'backup\n');
 assert.equal(r.checksum,`${digest}  ${join(r.backup,'database.dump')}\n`);
 assert.deepEqual(r.files,['database.dump','database.list','database.sha256','run.log']);
});
test('drains, backs up, verifies and restarts before the guarded reopen',async()=>{
 const r=await run();assert.equal(r.status,0);
 const steps=['psql -X -v ON_ERROR_STOP=1 -U seap -d seap -Atc','stop collection documents','processing.js freeze ','pg_dump ','pg_restore --list','processing.js stage 00000000-0000-4000-8000-000000000001 backup-verified','sleep 30','processing.js refresh ','restart web','up -d --no-deps collection','processing.js finish '];
 let previous=-1;for(const step of steps){const position=r.calls.indexOf(step);assert.ok(position>previous,step);previous=position;}
 assert.doesNotMatch(r.calls,/processing.js fail /);
});

test('the stored search text is built after the reopen, never on a failed run, and its failure keeps the publication',async()=>{
 const r=await run();assert.equal(r.status,0);
 const finish=r.calls.indexOf('processing.js finish '),search=r.calls.indexOf('dist/scripts/source-search.js');
 assert.ok(finish>=0&&search>finish);
 const failed=await run('search');assert.equal(failed.status,0);
 assert.match(failed.calls,/processing.js finish [\s\S]*source-search\.js/);assert.doesNotMatch(failed.calls,/processing.js fail /);
 for(const failure of ['backup','refresh']){const f=await run(failure);assert.doesNotMatch(f.calls,/source-search\.js/,failure);}
 // Bounded, as it holds the deploy lock: a hang ends as a failure, not as skipped nights.
 assert.match(r.calls,/timeout --kill-after=60s 40m docker compose --profile processing run --rm --no-deps -T processor node apps\/ingestion\/dist\/scripts\/source-search\.js\n/);
});

test('readers keep the site through drain and backup; it must answer 503 before data changes',async()=>{
 const r=await run();assert.equal(r.status,0);
 // The claim-time check only records the status: a recovery starts on a closed site.
 const first=r.calls.indexOf('cinecastiga.ro/domenii'),drained=r.calls.indexOf('stop collection documents');
 assert.ok(first>=0&&first<drained);
 const verified=r.calls.indexOf('backup-verified'),refresh=r.calls.indexOf('processing.js refresh ');
 assert.ok(r.calls.indexOf('cinecastiga.ro/domenii',verified)>verified&&r.calls.indexOf('cinecastiga.ro/domenii',verified)<refresh);
 const open=await run('open');assert.equal(open.status,1);
 assert.match(open.calls,/pg_dump [\s\S]*backup-verified[\s\S]*processing.js fail /);
 assert.equal(open.calls.match(/^sleep 3$/gm)?.length,10);
 assert.doesNotMatch(open.calls,/processing.js refresh |sleep 30|processing.js finish |restart web|up -d/);
});

test('explicit reference repair uses the same backup and publication path',async()=>{
 const r=await run('',true,['--reference-repair-now']);assert.equal(r.status,0);
 assert.match(r.calls,/processing.js claim-repair reference-import-v1/);
 assert.match(r.calls,/pg_dump /);assert.match(r.calls,/processing.js refresh /);assert.match(r.calls,/processing.js finish /);
 assert.doesNotMatch(r.calls,/CONSUMED_CALLER_INPUT/);
});

test('operator recovery of a failed run uses the same backup and publication path',async()=>{
 const r=await run('',true,['--recover-failed','11111111-1111-4111-8111-111111111111']);assert.equal(r.status,0);
 assert.match(r.calls,/processing.js claim-recovery 11111111-1111-4111-8111-111111111111/);
 assert.match(r.calls,/pg_dump /);assert.match(r.calls,/processing.js refresh /);assert.match(r.calls,/processing.js finish /);
 const invalid=await run('',true,['--recover-failed','; reboot']);assert.equal(invalid.status,2);assert.equal(invalid.calls,'');
});

test('verified failure resumes only collection, retaining public maintenance and document stop',async()=>{
 const r=await run('refresh',true,[],true);assert.equal(r.status,1);
 assert.match(r.calls,/up -d --no-deps collection/);assert.doesNotMatch(r.calls,/processing.js finish |restart web|up -d --no-deps documents/);
});

// Blue/green (owner, 9 November 2026): a shadow build never closes the site.
test('a shadow build keeps the site open: no 503, documents keep working, prepare, build as the build role, swap, then the web restarts',async()=>{
 const r=await run('',true,[],false,'shadow');assert.equal(r.status,0);
 const order=['stop collection','processing.js freeze','pg_dump','backup-verified','stage 00000000-0000-4000-8000-000000000001 shadow-prepare','shadow-prepare cinecastiga-postgres-1 seap','processor-build node apps/ingestion/dist/scripts/processing.js refresh','processing.js swap','restart web','source-search.js'];
 let at=-1;for(const step of order){const i=r.calls.indexOf(step,at+1);assert.ok(i>at,`${step} after the previous step`);at=i;}
 assert.doesNotMatch(r.calls,/stop collection documents|curl -sS -o \/dev\/null -w %\{http_code\} https:\/\/cinecastiga\.ro\/domenii.*\n.*sleep 30|processing\.js finish |sleep 30/);
 assert.doesNotMatch(r.calls,/processor node apps\/ingestion\/dist\/scripts\/processing\.js refresh/);
});
test('a failed shadow build or preparation changes nothing published: no swap, no web restart, the run is failed',async()=>{
 for(const failure of ['prepare','refresh']){
  const r=await run(failure,true,[],false,'shadow');assert.equal(r.status,1,failure);
  assert.match(r.calls,/processing.js fail /,failure);
  assert.doesNotMatch(r.calls,/processing\.js swap |restart web|source-search/,failure);
 }
});
test('an unknown processing mode stops before the drain',async()=>{
 const r=await run('',true,[],false,'0');assert.equal(r.status,1);assert.doesNotMatch(r.calls,/stop |pg_dump/);
});
test('every table shadow-derived.txt lists is emptied or recreated by the processing code (else the shadow build would read it empty)',async()=>{
 const {readdir:rd,readFile:rf}=await import('node:fs/promises');
 const root=new URL('../../',import.meta.url).pathname;
 async function sources(dir){const out=[];for(const e of await rd(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())out.push(...await sources(p));else if(/\.ts$/.test(e.name)&&!/\.test\.ts$/.test(e.name))out.push(await rf(p,'utf8'));}return out;}
 const text=(await sources(join(root,'apps/ingestion/src'))).concat(await sources(join(root,'packages/db/src'))).join('\n').toLowerCase();
 const listed=(await rf(join(root,'infra/prod/shadow-derived.txt'),'utf8')).split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));
 assert.ok(listed.length>10);
 for(const name of listed){
  const t=name.replace(/_/g,'_');
  const rebuilt=new RegExp(`(truncate[^;\`]*\\bmarts\\.${t}\\b|drop table (if exists )?marts\\.${t}\\b|create table (if not exists )?marts\\.${t}\\b)`).test(text);
  assert.ok(rebuilt,`${name} is not truncated or recreated in apps/ingestion/src or packages/db/src`);
 }
});
