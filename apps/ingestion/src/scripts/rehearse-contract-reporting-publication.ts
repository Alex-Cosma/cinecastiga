/** Complete identity/reporting rehearsal on a copied public cohort only.
 * Synthetic freeze markers exercise gates; they are NOT production backups. */
import {createDb,type DbSql,assertContractExclusionsQuality,readContractIdentityQuality} from '@seap/db';
import {repairContractTypes,contractReportingSummary} from '../normalize/contract-reporting.js';
import {revalidateApprovedContractIdentities} from '../normalize/revalidate-contract-identities.js';
import {discoverAndApproveContractIdentities} from '../normalize/discover-contract-identities.js';
import {runMarts} from '../normalize/marts.js';
import {runCoverage} from '../normalize/coverage.js';
import {validateContractPopulation} from '../monitoring/validate.js';
const url=new URL(process.env.DATABASE_URL??'postgres://invalid/');
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!['/seap_test_currency_inventory_20261011','/seap_test_currency_reporting_20261011'].includes(url.pathname))
 throw Error('Only the two isolated reporting copies are allowed');
const {sql}=createDb(),run='00000000-0000-4000-8000-000000009997';
const timed=async<T>(name:string,fn:()=>Promise<T>)=>{const start=Date.now();console.log(name+' started');const result=await fn();console.log(JSON.stringify({stage:name,durationMs:Date.now()-start,result}));return result;};
try {
 await sql`insert into app.collection_control(id,paused,maintenance,revision) values(1,true,true,1)
  on conflict(id) do update set paused=true,maintenance=true,revision=1`;
 await sql`insert into app.data_repairs(id,scheduled_day,status,report) values('contract-publication-identity-v1','2026-10-04','completed',
  ${JSON.stringify({configuration:{path:'infra/prod/dumps/dq02-evidence-20261003/approved-bundle.json.gz',sha256:'c3a570b5ad4638778183c77b2e0a7385a3467ae6c22af1e012afd22151621596'}})}::jsonb)
  on conflict(id) do update set report=excluded.report`;
 const [boundary]=await sql`select max(id)::text id from raw.raw_documents`;
 await sql`insert into app.processing_runs(id,scheduled_day,scope,control_revision,before_control,raw_boundary,stage,stages)
  values(${run}::uuid,'2026-10-12','full',1,'{"isolatedRehearsal":true}',${boundary!.id}::bigint,'identity-repair',
   '{"backup":{"completedAt":"isolated-rehearsal-only"},"backup-verified":{"completedAt":"isolated-rehearsal-only"},"normalize":{"completedAt":"isolated-rehearsal-only"}}')
  on conflict(id) do update set status='running',completed_at=null,error=null,stage='identity-repair',
    raw_boundary=excluded.raw_boundary,control_revision=excluded.control_revision,stages=excluded.stages`;
 await timed('types',()=>repairContractTypes(sql));
 await timed('approved-revalidation',()=>revalidateApprovedContractIdentities(sql,run));
 await timed('discovery',()=>discoverAndApproveContractIdentities(sql,run,console.log));
 await timed('marts',()=>runMarts(sql,{log:console.log}));
 const validation=await timed('population',()=>validateContractPopulation(sql));
 if(['eligible_missing','excluded_included','allocation_mismatches'].some(key=>String(validation?.[key])!=='0'))throw Error('Population reconciliation failed');
 await timed('coverage',()=>runCoverage(sql));
 console.log(JSON.stringify({classification:await contractReportingSummary(sql),quality:await readContractIdentityQuality(sql),exclusions:await assertContractExclusionsQuality(sql),
  examples:await sql`select notice_no,count(distinct contract_id)::int n,sum(closing_value)::text value from marts.contract_transactions where notice_no in ('CAN1170804','CAN1080811','CAN1171713') group by notice_no order by notice_no`,
  coverage:await sql`select observation from marts.data_coverage where dataset='contracts'`},null,2));
}finally{await sql.end();}
