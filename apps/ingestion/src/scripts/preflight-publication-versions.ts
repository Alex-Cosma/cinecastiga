/** Read-only audit of approved publication families at the current raw boundary. */
import {createDb,readContractIdentityQuality} from '@seap/db';
import {loadIdentityRepairBundle,IDENTITY_REPAIR_ID} from '../normalize/scheduled-contract-identity.js';
import {approvedRevalidationBatches} from '../normalize/revalidate-contract-identities.js';
const {sql}=createDb();
try{await sql.begin('isolation level repeatable read read only',async tx=>{
 const q=tx as unknown as typeof sql;
 await q`set local statement_timeout='180s'`;await q`set local work_mem='8MB'`;await q`set local max_parallel_workers_per_gather=0`;await q`set local jit=off`;
 const [repair]=await q`select report from app.data_repairs where id=${IDENTITY_REPAIR_ID}`;
 const {path,sha256}=repair!.report.configuration;
 const bundle=await loadIdentityRepairBundle(path,sha256);
 const [boundary]=await q`select max(id)::text id from raw.raw_documents`;
 const quality=await readContractIdentityQuality(q);
 // Aggregated per slice: the whole registry never sits in memory at once.
 const totals={groups:0,publications:0,versionedGroups:0,canonicalChanges:0,excludedPublications:0,peakHeapMb:0};
 // REVALIDATION_BATCH lets an operator confirm that totals do not depend on the slice size.
 for await(const slice of approvedRevalidationBatches(q,bundle,String(boundary!.id),Number(process.env['REVALIDATION_BATCH'])||undefined)){
  totals.groups+=slice.groups.length;
  totals.publications+=slice.groups.reduce((n,g)=>n+g.members.length,0);
  totals.versionedGroups+=slice.groups.filter(g=>g.verified.methodology==='contract-identity-3').length;
  totals.canonicalChanges+=slice.groups.filter(g=>g.canonical!==String(g.previous.decision.canonical_contract_id)).length;
  totals.excludedPublications+=slice.population.filter(p=>!p.previous).length;
  totals.peakHeapMb=Math.max(totals.peakHeapMb,Math.round(process.memoryUsage().heapUsed/2**20));
 }
 console.log(JSON.stringify({boundary:boundary!.id,quality,...totals}));
});}finally{await sql.end({timeout:5});}
