/** COPY ONLY: indexes public data into a dedicated, isolated Meilisearch container. */
import {readFile,writeFile} from 'node:fs/promises';
const target=process.env.IDENTITY_REPAIR_DATABASE;
if(!/^seap_test_identity_[a-z0-9_]+$/.test(target??''))throw Error('An isolated copy is required');
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+target;url.searchParams.set('max_lifetime','0');
process.env.DATABASE_URL=url.toString();
process.env.MEILISEARCH_URL='http://identity-preview-meili:7700';
process.env.MEILISEARCH_KEY=(await readFile('/reports/preview-meili.key','utf8')).trim();
const {createDb}=await import('@seap/db');
const {indexTopics}=await import('../search/index-topics.js');
const {indexEntities,meiliClient}=await import('../search/index-entities.js');
const {validateIdentityRepair}=await import('./validate-repair.mjs');
const {sql}=createDb();
try {
 const [db]=await sql`select current_database() name`;
 const [checkpoint]=await sql`select id,status from app.monitoring_refreshes order by version desc limit 1`;
 if(db.name!==target||checkpoint?.status!=='ready')throw Error('Wrong database or unvalidated copy');
 const since=new Date().toISOString();
 const topics=await indexTopics(sql,console.log);
 const indexed=await indexEntities(sql,{log:console.log});
 const client=meiliClient(),index=client.index('entities'),stats=await index.getStats();
 const [expected]=await sql`select count(distinct entity_id)::int n from marts.entity_profile`;
 const tasks=await client.tasks.getTasks({indexUids:['entities'],statuses:['failed','canceled','processing','enqueued'],afterEnqueuedAt:since,limit:1});
 if(stats.isIndexing||stats.numberOfDocuments!==expected.n||tasks.results.length)throw Error('Isolated search did not reconcile');
 const search=await index.search('primaria cluj',{filter:'roles = authority',sort:['total:desc'],limit:20});
 if(!search.hits.some(h=>h.id===2146445)||search.hits.some(h=>h.id===2147251))throw Error('Cluj search did not consolidate');
 const checks=await validateIdentityRepair(sql);
 const report={database:target,checkpointId:checkpoint.id,completedAt:new Date().toISOString(),topics,indexed,checks,search:search.hits.map(h=>({id:h.id,name:h.name,cui:h.cui}))};
 await writeFile('/reports/search-report.json',JSON.stringify(report,null,2));
 console.log('Copy search and identity projections verified.');
}finally{await sql.end({timeout:10});}
