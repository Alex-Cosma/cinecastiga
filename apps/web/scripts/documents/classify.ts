/** Explicit offline classification/backfill. Default: report only; --apply writes
 * classification and scheduling priority. Does not enqueue jobs, change source
 * controls or modify original bytes/OCR pages. */
import {createDb} from '@seap/db';
import {classifyDocumentBatch} from '../../lib/documents/classify';
import {CLASSIFICATION_VERSION} from '../../lib/documents/classification';
const {sql}=createDb();
try{
 const [before]=await sql`select count(*)::int total,count(*) filter(where (classification_version<${CLASSIFICATION_VERSION} or classification_pdf_hash is distinct from pdf_hash) and coalesce(classification->>'method','')<>'manual')::int pending from app.procurement_documents`;
 console.log(JSON.stringify({event:'classification-preview',...before,apply:process.argv.includes('--apply')}));
 if(process.argv.includes('--apply')){
  let processed=0;
  while(true){const batch=await classifyDocumentBatch(sql);processed+=batch.changed;if(!batch.inspected)break;}
  const groups=await sql`select category,count(*)::int files from app.procurement_documents d cross join lateral jsonb_array_elements_text(d.classification->'categories') category group by category order by files desc`;
  console.log(JSON.stringify({event:'classification-complete',processed,groups,sourceRequests:0}));
 }
}finally{await sql.end();}
