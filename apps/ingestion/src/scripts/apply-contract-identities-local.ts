/** Local validation only. No production entrypoint or scheduled repair. */
import {createDb,assertContractIdentityQuality} from '@seap/db';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {writeFile} from 'node:fs/promises';
import {approveContractIdentities} from '../normalize/approve-contract-identities.js';
import type {ArchivedAward} from '../normalize/contract-identity.js';
import {validateContractPopulation} from '../monitoring/validate.js';
import {runMarts} from '../normalize/marts.js';
const u=new URL(process.env.DATABASE_URL??'postgres://invalid/');
if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||!u.pathname.startsWith('/seap_test_currency_'))throw Error('Requires local isolated monetary copy');
const [output,...files]=process.argv.slice(2);if(!output||!files.length)throw Error('Provide report path and verified archives');
const {sql}=createDb();
try{
 const archives:ArchivedAward[]=[];
 for(const file of files)for await(const line of createInterface({input:createReadStream(file),crlfDelay:Infinity})){
  const r=JSON.parse(line);archives.push({source:r.archive_source??file.split('/').slice(-2).join('/'),hash:r.content_hash,rawId:String(r.id),endpoint:r.endpoint_version,payload:r.payload});
 }
 const start=Date.now();
 const decisions=await sql.begin(async tx=>{
  const q=tx as unknown as typeof sql;
  await q`set local statement_timeout='180s'`;await q`set local work_mem='8MB'`;await q`set local max_parallel_workers_per_gather=0`;await q`set local jit=off`;
  const selected=await q`select id,fingerprint from marts.contract_identity_candidates where active and status='source_verified'`;
  if(selected.length!==8045)throw Error('Verified pilot population changed; review the simulation first');
  return approveContractIdentities(q,selected.map(r=>({id:String(r.id),fingerprint:String(r.fingerprint)})),archives,'Owner approved DQ-02 verified pairs on 2026-10-03; isolated local validation');
 });
 // Rebuild the real builders, not only a second counterfactual query.
 const marts=await runMarts(sql,{log:console.log});
 const [actual]=await sql`select count(distinct contract_id)::int contracts,sum(closing_value)::text total_ron from marts.contract_transactions`;
 if(actual?.contracts!==973625||String(actual?.total_ron).replace(/0+$/,'').replace(/\.$/,'')!=='929040718679.61')throw Error('Applied totals differ from the verified simulation');
 const [sources]=await sql`select count(*)::int publications from marts.contract_identity_members m join core.contracts c on c.id=m.contract_id`;
 const quality=await assertContractIdentityQuality(sql);
 const allocations=await validateContractPopulation(sql);
 if(!['eligible_missing','excluded_included','allocation_mismatches'].every(k=>allocations?.[k]==='0'))throw Error('Actual allocation reconciliation failed');
 const roles=await sql`select role,sum(total_ron_split)::text total_ron from marts.entity_profile group by role`;
 if(roles.length!==2||roles.some(r=>String(r.total_ron).replace(/0+$/,'').replace(/\.$/,'')!=='929040718679.61'))throw Error('Role totals do not reconcile');
 const report={database:u.pathname.slice(1),decisions,marts,actual,sources,quality,allocations,roles,durationSeconds:(Date.now()-start)/1000,
  scope:'Isolated currency fixture. Real contract/statistics marts rebuilt; no full DA/TED/risk dataset, search refresh or production deployment.'};
 await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await sql.end();}
