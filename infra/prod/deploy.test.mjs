import {migrationHistoryMatch} from '../../packages/db/scripts/migration-history.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const script=fileURLToPath(new URL('./deploy.sh',import.meta.url));
async function run(fail='',collection='',proxy='current'){
 const dir=await mkdtemp(join(tmpdir(),'seap-deploy-script-'));
 try{
  await mkdir(join(dir,'bin'));await mkdir(join(dir,'.git'));await mkdir(join(dir,'infra/prod'),{recursive:true});
  await writeFile(join(dir,'infra/prod/Caddyfile'),'current configuration\n');
  for(const [name,body] of Object.entries({git:'echo "git $*" >> "$DEPLOY_TEST_LOG"\nif [ "$1" = rev-parse ]; then echo test-commit; fi',flock:'[ "$DEPLOY_TEST_FAIL" != lock ]',docker:'echo "docker $*" >> "$DEPLOY_TEST_LOG"\ncase "$*" in *"ps --status running -q collection"*) if [ -n "$DEPLOY_TEST_COLLECTION" ]; then echo collection-test; fi; exit 0;; "inspect --format "*) if [ "$DEPLOY_TEST_COLLECTION" = service ]; then echo False; else echo True; fi; exit 0;; *"build --pull"*) [ "$DEPLOY_TEST_FAIL" != build ];; *"run --rm --no-deps migrate"*) [ "$DEPLOY_TEST_FAIL" != migrate ];; *"index-topics.js --if-missing"*) [ "$DEPLOY_TEST_FAIL" != topics ];; *"cp Caddyfile caddy:"*) [ "$DEPLOY_TEST_FAIL" != proxy_copy ];; *"cat /etc/caddy/Caddyfile"*) if [ "$DEPLOY_TEST_PROXY" = stale ]; then echo old; else echo "current configuration"; fi;; *"--force-recreate caddy"*) [ "$DEPLOY_TEST_FAIL" != proxy_recreate ];; *"caddy validate"*) [ "$DEPLOY_TEST_FAIL" != proxy_validate ];; *"caddy reload"*) [ "$DEPLOY_TEST_FAIL" != proxy_reload ];; *) exit 0;; esac'}))await writeFile(join(dir,'bin',name),'#!/bin/sh\n'+body+'\n',{mode:0o755});
  const result=spawnSync('bash',[script],{env:{...process.env,PATH:join(dir,'bin')+':'+process.env.PATH,SEAP_DEPLOY_CHECKOUT:dir,DEPLOY_TEST_LOG:join(dir,'calls'),DEPLOY_TEST_FAIL:fail,DEPLOY_TEST_COLLECTION:collection,DEPLOY_TEST_PROXY:proxy},encoding:'utf8'});
  const calls=await readFile(join(dir,'calls'),'utf8').catch(()=> '');return {status:result.status,calls};
 }finally{await rm(dir,{recursive:true,force:true});}
}
test('successful deploy builds, migrates, then replaces web',async()=>{const r=await run();assert.equal(r.status,0);assert.ok(r.calls.indexOf('build --pull web migrate documents')<r.calls.indexOf('run --rm --no-deps migrate'));assert.ok(r.calls.indexOf('run --rm --no-deps migrate')<r.calls.indexOf('up -d --no-deps web documents'));assert.doesNotMatch(r.calls,/compose (?:down|stop)/);});
for(const stage of ['build','migrate','topics','proxy_copy','proxy_validate','proxy_reload'])test(`${stage} failure preserves running web`,async()=>{const r=await run(stage);assert.notEqual(r.status,0);assert.doesNotMatch(r.calls,/up -d|image prune|compose (?:stop|down)/);});
test('concurrent deploy exits before changing checkout or containers',async()=>{const r=await run('lock');assert.notEqual(r.status,0);assert.equal(r.calls,'');});

test('migration history accepts only the reconstructed legacy correction',()=>{
 const migration={folderMillis:1783884567616,hash:'8fd4aefc5bedea21b3b6fe88c904ce3b0f31a5176458916aa7d3fbb0fead0565'};
 const legacy={created_at:'1783884567616',hash:'715dde5bb016ceeb3264fe79e14334cb9a9487dcd6b8abd65c0ed1ea445d60b5'};
 assert.equal(migrationHistoryMatch(legacy,migration,5),'legacy-national-stats-nullability');
 assert.equal(migrationHistoryMatch({...legacy,hash:migration.hash},migration,5),'exact');
 assert.equal(migrationHistoryMatch(legacy,migration,4),false);
 assert.equal(migrationHistoryMatch({...legacy,hash:'unknown'},migration,5),false);
 assert.equal(migrationHistoryMatch(legacy,{...migration,hash:'modified-again'},5),false);
 assert.equal(migrationHistoryMatch({...legacy,created_at:0},migration,5),false);
});

test('a bounded one-off pilot does not activate the permanent collector',async()=>{const r=await run('','pilot');assert.equal(r.status,0);assert.doesNotMatch(r.calls,/build --pull collection|up -d --no-deps collection/);});
test('an already activated collector follows the release',async()=>{const r=await run('','service');assert.equal(r.status,0);assert.match(r.calls,/build --pull collection/);assert.match(r.calls,/up -d --no-deps collection/);});

test('initial topic index preparation runs after migration and before exposing the new search UI',async()=>{const r=await run();assert.equal(r.status,0);const migrate=r.calls.indexOf('run --rm --no-deps migrate'),topics=r.calls.indexOf('run --rm --no-deps processor node apps/ingestion/dist/scripts/index-topics.js --if-missing'),restart=r.calls.indexOf('up -d --no-deps web documents');assert.ok(topics>migrate);assert.ok(restart>topics);});

test('proxy configuration is validated and reloaded before exposing the new application',async()=>{const r=await run();assert.equal(r.status,0);const validate=r.calls.indexOf('caddy validate'),reload=r.calls.indexOf('caddy reload'),restart=r.calls.indexOf('up -d --no-deps web documents');assert.ok(validate>r.calls.indexOf('run --rm --no-deps migrate'));assert.ok(reload>validate);assert.ok(restart>reload);});

// A single-file bind mount can retain an old inode after git checkout.
test('stale mounted proxy is recreated only after validating the new checkout',async()=>{const r=await run('','','stale');assert.equal(r.status,0);const copy=r.calls.indexOf('cp Caddyfile caddy:'),validate=r.calls.indexOf('caddy validate --config /tmp/cinecastiga-deploy.Caddyfile'),recreate=r.calls.indexOf('up -d --no-deps --force-recreate caddy'),reload=r.calls.indexOf('caddy reload'),web=r.calls.indexOf('up -d --no-deps web documents');assert.ok(copy<validate&&validate<recreate&&recreate<reload&&reload<web);});
test('current mounted proxy is reloaded without unnecessary recreation',async()=>{const r=await run();assert.equal(r.status,0);assert.doesNotMatch(r.calls,/--force-recreate/);});
test('stale proxy recreation failure prevents replacement of the application',async()=>{const r=await run('proxy_recreate','','stale');assert.notEqual(r.status,0);assert.doesNotMatch(r.calls,/up -d --no-deps web documents|caddy reload|image prune/);});
