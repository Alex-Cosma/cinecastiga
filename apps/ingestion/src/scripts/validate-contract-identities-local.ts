import {createDb,assertContractIdentityQuality} from '@seap/db';
import {readFile,writeFile} from 'node:fs/promises';
import {validateContractPopulation} from '../monitoring/validate.js';
const u=new URL(process.env.DATABASE_URL??'postgres://invalid/');
if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||!u.pathname.startsWith('/seap_test_currency_'))throw Error('Requires isolated monetary copy');
const path=process.argv[2];if(!path)throw Error('Pass existing application report');
const {sql}=createDb();
try{
 const result=await sql.begin('read only',async tx=>{
  const q=tx as unknown as typeof sql;
  await q`set local statement_timeout='180s'`;
  const quality=await assertContractIdentityQuality(q);
  const allocations=await validateContractPopulation(q);
  if(!['eligible_missing','excluded_included','allocation_mismatches'].every(k=>allocations?.[k]==='0'))throw Error('Allocation reconciliation failed');
  const roles=await q`select role,sum(total_ron_split)::text total_ron from marts.entity_profile group by role`;
  if(roles.length!==2||roles.some(r=>String(r.total_ron).replace(/0+$/,'').replace(/\.$/,'')!=='929040718679.61'))throw Error('Role totals do not reconcile');
  const [unchanged]=await q`select count(*)::int unresolved,count(*) filter(where d.candidate_id is not null)::int incorrectly_approved
    from marts.contract_identity_candidates c left join marts.contract_identity_decisions d on d.candidate_id=c.id where active and status='needs_evidence'`;
  if(unchanged?.unresolved!==11||unchanged?.incorrectly_approved!==0)throw Error('Unresolved candidates were changed');
  return {quality,allocations,roles,unresolved:unchanged};
 });
 const report=JSON.parse(await readFile(path,'utf8'));Object.assign(report,{validation:result});
 await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await sql.end();}
