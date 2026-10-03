/** SELECT-only verification, never schedules/applies a repair or requests SEAP. */
import {createDb} from '@seap/db';
import {loadIdentityRepairBundle,prepareIdentityRepair} from '../normalize/scheduled-contract-identity.js';
const [path,sha]=process.argv.slice(2);if(!path||!sha)throw Error('Pass pinned evidence bundle path and SHA256');
const bundle=await loadIdentityRepairBundle(path,sha);
const {sql}=createDb();try{
 const result=await sql.begin('read only',async tx=>{
  const q=tx as unknown as typeof sql;
  await q`set local work_mem='8MB'`;await q`set local max_parallel_workers_per_gather=0`;await q`set local jit=off`;await q`set local statement_timeout='180s'`;
  const [r]=await q`select coalesce(max(id),0)::text boundary from raw.raw_documents`;
  const prepared=await prepareIdentityRepair(q,bundle,String(r!.boundary));
  return {groups:prepared.groups.length,impact:prepared.impact,rawBoundary:String(r!.boundary),checkedAt:new Date().toISOString()};
 });console.log(JSON.stringify(result));
}finally{await sql.end();}
