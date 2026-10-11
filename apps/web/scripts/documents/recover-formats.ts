import {createDb} from '@seap/db';
const apply=process.argv.includes('--apply');if(process.argv.slice(2).some(x=>x!=='--apply'))throw Error('Only --apply is accepted');
const db=createDb(undefined,{max:1});
try{
 const result=await db.sql.begin(async tx=>{
  const candidates=await tx`select j.id,j.document_id,j.error,j.attempts,j.finished_at,d.original_hash from app.document_jobs j join app.procurement_documents d on d.id=j.document_id
   where j.automatic and j.kind='file' and j.status='failed' and d.processed_at is null and (
    j.error in ('Formatul nu conține un PDF compatibil. Originalul rămâne disponibil.','Procesarea acceptă cel mult 150 de pagini. Originalul rămâne disponibil.','Pagina depășește limita de text procesabil. Originalul rămâne disponibil.','Procesarea cu openssl nu a reușit. Originalul rămâne disponibil.')
    or j.error like 'SEAP: răspunsul depășește limita de 50 MiB%')
   and not exists(select 1 from app.document_jobs active where active.dedup_key=j.dedup_key and active.status in ('queued','running')) order by j.id for update of j`;
  if(apply&&candidates.length){
   for(const c of candidates)await tx`update app.document_jobs set status='queued',stage=${c.original_hash?'process_queued':'queued'},attempts=0,retry_at=null,error=null,finished_at=null where id=${c.id}`;
   await tx`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('system:document-formats-v3','Recuperare formate și documente mari','documents-formats-recovery',${JSON.stringify(candidates)}::jsonb,${JSON.stringify({jobs:candidates.map(c=>c.id),processor:'documents-v3'})}::jsonb)`;
  }
  return {apply,candidates:candidates.length,fromArchive:candidates.filter(c=>c.original_hash).length,needsDownload:candidates.filter(c=>!c.original_hash).length};
 });console.log(JSON.stringify(result));
}finally{await db.sql.end();}
