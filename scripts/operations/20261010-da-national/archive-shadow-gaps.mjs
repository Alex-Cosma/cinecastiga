// DATED operation: only the 114 missing records proven by the ten-day shadow audit.
// Requires the exact private evidence file, paused/drained collector, and no processing.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getSharedSql,closeSharedDb} from '/app/apps/ingestion/dist/db.js';
import {archiveDocumentsSql} from '/app/apps/ingestion/dist/scrape/archive.js';
const file=process.argv[2],expectedHash=process.argv[3];
if(!file||!expectedHash||!/^[a-f0-9]{64}$/.test(expectedHash))throw Error('Evidence file and reviewed SHA256 required');
const bytes=await readFile(file);if(createHash('sha256').update(bytes).digest('hex')!==expectedHash)throw Error('Evidence hash mismatch');
const docs=JSON.parse(bytes.toString()),days=new Set(['2018-12-17','2018-12-18','2018-12-19']);
if(!Array.isArray(docs)||docs.length!==114||new Set(docs.map(d=>d.externalId)).size!==114||docs.some(d=>d.source!=='elicitatie'||d.endpointVersion!=='da-list:v1'||d.externalId!==`da:${d.payload.directAcquisitionId}`||!days.has(d.payload.finalizationDate?.slice(0,10))))throw Error('Unexpected audited records');
try{const result=await getSharedSql().begin(async tx=>{
 const [c]=await tx`select paused,blocked_reason from app.collection_control where id=1 for update`;
 if(!c?.paused||c.blocked_reason||(await tx`select id from app.processing_runs where status='running'`).length||(await tx`select id from app.collection_tasks where status='running' limit 1`).length)throw Error('Pause, drain and inspect before archival');
 const existing=await tx`select id from app.collection_audit where action='da-shadow-gap-recovery' and after->>'sha256'=${expectedHash}`;
 if(existing.length)return {alreadyApplied:true};
 const ids=docs.map(d=>d.payload.directAcquisitionId);
 if((await tx`select id from core.direct_acquisitions where sicap_da_id=any(${ids}::bigint[])`).length)throw Error('Baseline changed; review missing IDs');
 const archive=await archiveDocumentsSql(tx,docs);
 await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:da-shadow-audit','Audit DA','da-shadow-gap-recovery',${JSON.stringify({ids,normalized:0})}::jsonb,${JSON.stringify({...archive,sha256:expectedHash,days:[...days],normalization:'next scheduled processing'})}::jsonb)`;
 return archive;
});console.log(JSON.stringify(result));}finally{await closeSharedDb();}
