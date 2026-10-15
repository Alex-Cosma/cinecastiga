import type {DbSql} from '@seap/db';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {extractSignedContent,runTool} from './process';
const previousError='Procesarea cu openssl nu a reușit. Originalul rămâne disponibil.';
type Inspection={signature:string;pages:number}|{error:string};
export async function inspectArchivedP7s(bytes:Buffer):Promise<Inspection>{
 const dir=await mkdtemp(join(tmpdir(),'seap-p7s-recovery-'));
 try{
  const source=join(dir,'original'),output=join(dir,'content'),signal=AbortSignal.timeout(180000);
  await writeFile(source,bytes,{mode:0o600});
  const signature=await extractSignedContent(source,output,signal),content=await readFile(output);
  if(content.length>50*1024*1024||content.subarray(0,5).toString()!=='%PDF-')return {error:'Formatul nu conține un PDF compatibil. Originalul rămâne disponibil.'};
  const info=await runTool('pdfinfo',[output],signal),pages=Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);
  if(!pages||pages>150)return {error:'Procesarea acceptă cel mult 150 de pagini. Originalul rămâne disponibil.'};
  return {signature,pages};
 }finally{await rm(dir,{recursive:true,force:true});}
}
/** Read archived bytes only. No worker/source imports, no SEAP requests. Does not
 * reset other failures or overwrite a successful/concurrently resumed document. */
export async function recoverArchivedP7s(q:DbSql,{apply=false,inspect=inspectArchivedP7s}:{apply?:boolean;inspect?:(bytes:Buffer)=>Promise<Inspection>}={}){
 const candidates=await q`select j.id,j.document_id,j.error,j.attempts,j.finished_at,d.original_hash,(select count(*)::int from app.document_requests r where r.job_id=j.id) source_requests from app.document_jobs j join app.procurement_documents d on d.id=j.document_id
  where j.automatic and j.kind='file' and j.status='failed' and j.error=${previousError} and d.original_hash is not null and d.processed_at is null order by j.id`;
 const plan:Array<{id:string;documentId:string;originalHash:string;result:Inspection|null}>=[];
 for(const c of candidates){
  const [blob]=await q`select bytes from app.document_blobs where hash=${c.original_hash}`;
  let result:Inspection|null=null;
  try{if(blob)result=await inspect(blob.bytes);}catch{/* Keep the original diagnostic; no speculative retry of unreadable contents. */}
  plan.push({id:c.id,documentId:c.document_id,originalHash:c.original_hash,result});
 }
 let changed:string[]=[];
 if(apply)changed=await q.begin(async tx=>{
  const ids:string[]=[];
  for(const p of plan){if(!p.result)continue;
   const ready='pages' in p.result;
   const rows=await tx`update app.document_jobs j set status=${ready?'queued':'failed'},stage=${ready?'process_queued':'failed'},attempts=case when ${ready} then 0 else attempts end,retry_at=null,finished_at=case when ${ready} then null else finished_at end,error=${ready?null:('error' in p.result?p.result.error:null)}
    where j.id=${p.id} and j.status='failed' and j.error=${previousError}
     and exists(select 1 from app.procurement_documents d where d.id=j.document_id and d.original_hash=${p.originalHash} and d.processed_at is null)
     and not exists(select 1 from app.document_jobs other where other.dedup_key=j.dedup_key and other.status in ('queued','running')) returning j.id`;
   if(rows.length)ids.push(p.id);
  }
  if(ids.length)await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:p7s-recovery-v2','Recuperare P7S','documents-p7s-recovery',${JSON.stringify(candidates.filter(c=>ids.includes(c.id)))}::jsonb,${JSON.stringify(plan.filter(p=>ids.includes(p.id)))}::jsonb)`;
  return ids;
 });
 return {apply,candidates:candidates.length,ready:plan.filter(p=>p.result&&'pages' in p.result).length,unsupported:plan.filter(p=>p.result&&'error' in p.result).length,unresolved:plan.filter(p=>!p.result).length,changed:changed.length,plan};
}
