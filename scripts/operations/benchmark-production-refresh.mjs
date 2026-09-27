/** One-off, isolated benchmark. Mount in ingestion dist/scripts; never mutates the live DB. */
import { DA_CEILING_SEED_ROWS } from '@seap/domain';
import { createDb } from '@seap/db';
import { runNormalize } from '../normalize/pipeline.js';
import { runReconcile } from '../normalize/reconcile.js';
import { runTedMart } from '../normalize/ted-mart.js';
import { runMarts } from '../normalize/marts.js';
import { runFlags } from '../flags/build.js';
import { runFlagMarts } from '../flags/marts.js';
import { runRadiografieMarts } from '../flags/radiografie.js';
import { runCoverage } from '../normalize/coverage.js';
import { validateBatch1Snapshot } from '../monitoring/validate.js';
import { validateCoverageCounts } from '../monitoring/coverage.js';
import { writeFile } from 'node:fs/promises';
const target = process.env.BENCHMARK_DATABASE;
if (!/^seap_benchmark_\d{8}$/.test(target ?? '')) throw Error('Explicit isolated benchmark database required');
const url = new URL(process.env.DATABASE_URL); url.pathname = '/' + target;
const { db, sql } = createDb(url.toString());
const report = { database: target, scope: 'Isolated production clone; no live publication, no SEAP requests, search not included', startedAt: new Date().toISOString(), stages: [] };
const started = performance.now();
const save = () => writeFile('/reports/benchmark.json', JSON.stringify(report, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
const log = message => console.log(JSON.stringify({at:new Date().toISOString(), message}));
async function stage(name, fn) {
 const entry = { name, startedAt: new Date().toISOString(), status:'running' }; report.stages.push(entry); await save(); log('start '+name);
 const at = performance.now();
 try { entry.result=await fn(); entry.status='complete'; return entry.result; }
 catch(error) { entry.status='failed'; entry.error={name:error?.name,message:error?.message,code:error?.code,cause:error?.cause?.message}; throw error; }
 finally { entry.elapsedMs=Math.round(performance.now()-at); entry.finishedAt=new Date().toISOString(); await save(); log('end '+name+' '+entry.status+' '+entry.elapsedMs+'ms'); }
}
try {
 const [actual] = await sql`select current_database() name`;
 if(actual.name!==target) throw Error('Database guard mismatch');
 await sql`update app.collection_control set paused=true,maintenance=true where id=1`;
 // One-time legacy baseline repair, measured separately from nightly work.
 await stage('prepare-thresholds',()=>sql.begin(async tx=>{
  await tx`delete from core.risk_thresholds where key in ('da_ceiling_goods_services','da_ceiling_works')`;
  for(const r of DA_CEILING_SEED_ROWS)await tx`insert into core.risk_thresholds(key,valid_from,valid_to,value_num,note) values(${r.key},${r.validFrom}::date,${r.validTo}::date,${r.valueNum},${r.note})`;
  return {rows:DA_CEILING_SEED_ROWS.length,scope:'Clone only; existing versioned repository seed'};
 }));
 const normalize=await stage('normalize',()=>runNormalize(db,sql,{log}));
 if(normalize.quarantined) throw Error(`${normalize.quarantined} records quarantined; benchmark stopped before dependent stages`);
 await stage('reconcile',()=>runReconcile(sql,{log}));
 await stage('ted-mart',()=>runTedMart(sql,{log}));
 await stage('marts',()=>runMarts(sql,{log}));
 await stage('flags',()=>runFlags(sql,{log}));
 await stage('flag-marts',()=>runFlagMarts(sql,{log}));
 await stage('radiografie',()=>runRadiografieMarts(sql,{log}));
 await stage('coverage',()=>runCoverage(sql));
 await stage('validation',async()=>{
   const checks=await validateBatch1Snapshot(sql,{fullProfiles:true,allAnnual:true},c=>log(`${c.passed?'passed':'FAILED'}: ${c.check}`));
   checks.push(await validateCoverageCounts(sql));return checks;
 });
 report.status=report.stages.at(-1).result.every(c=>c.passed)?'validated':'validation_failed';
} catch(error) { report.status='failed';report.error={name:error?.name,message:error?.message,code:error?.code};process.exitCode=1; }
finally {report.finishedAt=new Date().toISOString();report.elapsedMs=Math.round(performance.now()-started);await save();console.log(JSON.stringify({status:report.status,elapsedMs:report.elapsedMs}));await sql.end();}
