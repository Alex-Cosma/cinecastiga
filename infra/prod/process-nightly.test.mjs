import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const script=new URL('./process-nightly.sh',import.meta.url).pathname;
async function run(failure='',due=true){
 const dir=await mkdtemp(join(tmpdir(),'seap-nightly-'));
 try{
  await mkdir(join(dir,'bin'));await mkdir(join(dir,'.git'));await mkdir(join(dir,'infra/prod'),{recursive:true});
  const docker=`echo "docker $*" >> "$TEST_LOG"
case "$*" in
 *"processing.js claim") if read -r caller_input; then echo "CONSUMED_CALLER_INPUT" >> "$TEST_LOG"; fi; if [ "$TEST_DUE" = yes ]; then echo 00000000-0000-4000-8000-000000000001; fi;;
 *"ps --status running -q collection") echo collection-fixture;;
 "inspect --format "*) echo False;;
 *"psql -X -v ON_ERROR_STOP=1 -U seap -d seap -Atc "*) if [ "$TEST_FAILURE" = drain ]; then exit 1; fi; echo 0;;
 *"pg_dump "*) if [ "$TEST_FAILURE" = backup ]; then exit 1; fi; echo backup;;
 *"pg_restore --list"*) cat >/dev/null; echo archive;;
 *"processing.js refresh "*) if [ "$TEST_FAILURE" = refresh ]; then exit 1; fi;;
esac`;
  const bins={docker,flock:'[ "$TEST_FAILURE" != lock ]',curl:'case "$*" in *api/health*) echo 200;; *) echo 503;; esac',sha256sum:'echo sha256'};
  for(const [name,body] of Object.entries(bins))await writeFile(join(dir,'bin',name),'#!/bin/sh\n'+body+'\n',{mode:0o755});
  const r=spawnSync('bash',[script],{input:'caller-script-must-not-reach-container\n',env:{...process.env,PATH:join(dir,'bin')+':'+process.env.PATH,SEAP_DEPLOY_CHECKOUT:dir,SEAP_PROCESSING_BACKUPS:join(dir,'backups'),TEST_LOG:join(dir,'calls'),TEST_FAILURE:failure,TEST_DUE:due?'yes':'no'},encoding:'utf8'});
  return {status:r.status,calls:await readFile(join(dir,'calls'),'utf8').catch(()=> '')};
 }finally{await rm(dir,{recursive:true,force:true});}
}
test('no due run makes no changes and never consumes its caller input',async()=>{const r=await run('',false);assert.equal(r.status,0);assert.doesNotMatch(r.calls,/stop |pg_dump|refresh |finish |CONSUMED_CALLER_INPUT/);});
test('deployment lock conflict exits before touching containers or database',async()=>{const r=await run('lock');assert.equal(r.status,0);assert.equal(r.calls,'');});
test('drain, backup and processing failure retain maintenance and never finish or restart workers',async()=>{
 for(const failure of ['drain','backup','refresh']){const r=await run(failure);assert.equal(r.status,1);assert.match(r.calls,/processing.js fail /);assert.doesNotMatch(r.calls,/processing.js finish |restart web|up -d/);if(failure==='drain')assert.doesNotMatch(r.calls,/stop collection documents|pg_dump/);}
});
test('drains, backs up, verifies and restarts before the guarded reopen',async()=>{
 const r=await run();assert.equal(r.status,0);
 const steps=['psql -X -v ON_ERROR_STOP=1 -U seap -d seap -Atc','stop collection documents','processing.js freeze ','pg_dump ','pg_restore --list','processing.js refresh ','restart web','up -d --no-deps collection','processing.js finish '];
 let previous=-1;for(const step of steps){const position=r.calls.indexOf(step);assert.ok(position>previous,step);previous=position;}
 assert.doesNotMatch(r.calls,/processing.js fail /);
});
