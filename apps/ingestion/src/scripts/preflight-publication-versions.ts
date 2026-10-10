/** Read-only audit of approved publication families at the current raw boundary. */
import {createDb,readContractIdentityQuality} from '@seap/db';
import {loadIdentityRepairBundle,IDENTITY_REPAIR_ID} from '../normalize/scheduled-contract-identity.js';
import {prepareApprovedRevalidation} from '../normalize/revalidate-contract-identities.js';
const {sql}=createDb();
try{await sql.begin('isolation level repeatable read read only',async tx=>{
 const q=tx as unknown as typeof sql;
 await q`set local statement_timeout='180s'`;await q`set local work_mem='8MB'`;await q`set local max_parallel_workers_per_gather=0`;await q`set local jit=off`;
 const [repair]=await q`select report from app.data_repairs where id=${IDENTITY_REPAIR_ID}`;
 const {path,sha256}=repair!.report.configuration;
 const bundle=await loadIdentityRepairBundle(path,sha256);
 const [boundary]=await q`select max(id)::text id from raw.raw_documents`;
 const quality=await readContractIdentityQuality(q);
 const report=await prepareApprovedRevalidation(q,bundle,String(boundary!.id));
 console.log(JSON.stringify({boundary:boundary!.id,quality,groups:report.groups.length,publications:report.groups.reduce((n,g)=>n+g.members.length,0),versionedGroups:report.groups.filter(g=>g.verified.methodology==='contract-identity-3').length,canonicalChanges:report.groups.filter(g=>g.canonical!==String(g.previous.decision.canonical_contract_id)).length,impact:report.impact}));
});}finally{await sql.end({timeout:5});}
