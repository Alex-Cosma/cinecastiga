/** Dated recovery of the 2026-10-01 harmless indexCreation failure only.
 * Never rebuilds procurement data. Requires the original frozen boundary and
 * ready checkpoint; validates both indexes and identities before publication.
 * Mount the corrected, built index-entities.js alongside this script.
 */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createDb,collectionHeartbeat} from '@seap/db';
import {indexEntities,meiliClient} from '../search/index-entities.js';
import {control} from './publication-control.mjs';
import {validateIdentityRepair} from './validate-repair.mjs';
if(process.env.IDENTITY_REPAIR_APPLY!=='20261001-approved-copy')throw Error('Explicit dated recovery required');
const url=new URL(process.env.DATABASE_URL);
if(url.pathname!=='/seap')throw Error('Wrong database');
const {sql}=createDb(url.toString());
try {
 const report=JSON.parse(await readFile('/reports/report.json','utf8'));
 const boundary=JSON.parse(await readFile('/reports/boundary.json','utf8'));
 if(report.status!=='failed'||report.failedStage!=='search'||report.error?.message!=='Search validation failed'
  ||report.checkpoint?.id!=='1b4d434e-7f8a-464f-959b-706940c397fe')throw Error('Unexpected failure; manual investigation required');
 await sql.begin(q=>control(q,boundary));
 const [checkpoint]=await sql`select id,status,completed_at,validation from app.monitoring_refreshes order by version desc limit 1`;
 if(checkpoint.id!==report.checkpoint.id||checkpoint.status!=='ready'||checkpoint.validation.checks.length!==11||checkpoint.validation.checks.some(c=>!c.passed))throw Error('Checkpoint changed');
 const client=meiliClient();
 const bad=await client.tasks.getTasks({indexUids:['entities'],statuses:['failed','canceled','processing','enqueued'],afterEnqueuedAt:report.stageStartedAt,limit:100});
 if(bad.results.length!==1||bad.total!==1||bad.results[0].uid!==191||bad.results[0].type!=='indexCreation'
  ||bad.results[0].status!=='failed'||bad.results[0].error?.code!=='index_already_exists')throw Error('Unexpected indexing failure');
 await writeFile('/reports/report-search-failure.json',JSON.stringify(report,null,2),{flag:'wx'});
 const since=new Date().toISOString();
 const entities=await indexEntities(sql,{log:console.log});
 const stats=await client.index('entities').getStats();
 const [expected]=await sql`select count(distinct entity_id)::int n from marts.entity_profile`;
 const tasks=await client.tasks.getTasks({indexUids:['entities'],statuses:['failed','canceled','processing','enqueued'],afterEnqueuedAt:since,limit:1});
 if(stats.isIndexing||stats.numberOfDocuments!==expected.n||tasks.results.length)throw Error('Recovered search failed verification');
 const [topics]=await sql`select records::text,built_at from marts.topic_search_state where id=1`;
 const [population]=await sql`select (select count(*)::text from marts.topic_acquisitions) actual,
 ((select count(*) from marts.da_transactions)+(select count(distinct contract_id) from marts.contract_transactions))::text expected`;
 if(!topics||topics.records!==population.actual||topics.records!==population.expected||new Date(topics.built_at)<=new Date(checkpoint.completed_at))throw Error('Topic search differs from the ready publication');
 const search=await client.index('entities').search('primaria cluj',{filter:'roles = authority',sort:['total:desc'],limit:20});
 if(!search.hits.some(h=>h.id===2146445)||search.hits.some(h=>h.id===2147251))throw Error('Cluj search did not consolidate');
 const checks=await validateIdentityRepair(sql);
 if(checks.rows.planned!==boundary.plannedRows||checks.rows.aliases!==boundary.aliases)throw Error('Repair differs from validated copy');
 await sql.begin(q=>control(q,boundary));
 report.recovery={startedAt:since,reason:'Existing-index creation task 191 failed; entity indexing itself completed. Corrected initialization and reindexed entities; all checks repeated.',previousFailure:'report-search-failure.json'};
 report.search={topics:{records:topics.records},entities,documents:stats.numberOfDocuments};
 report.checks=checks;report.status='validated';report.stage='identity-validation';report.completedAt=new Date().toISOString();
 delete report.failedStage;delete report.error;
 await writeFile('/reports/report.partial',JSON.stringify(report,null,2));await rename('/reports/report.partial','/reports/report.json');
 await collectionHeartbeat(sql,'identity-repair-20261001','processor','validated-awaiting-reopen');
 console.log('Recovered search and all identity checks passed.');
}finally{await sql.end({timeout:10});}
