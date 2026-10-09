/** Explicit scoped repair. No requests, no watermark resets, no marts/publication. */
import {createDb} from '@seap/db';
import {participationNamespace} from '@seap/scraper-clients';
import {PARSERS} from '../normalize/parsers.js';
import {loadCpvCatalog,loadCpvPrefixMap,loadUnitMap} from '../normalize/context.js';
const apply=process.argv.includes('--apply');
const {db,sql:q}=createDb();
const guard=await q.reserve();
try{
 const [control]=await q`select paused,maintenance from app.collection_control where id=1`;
 if(apply&&(!control?.paused||!control.maintenance))throw Error('Pause collection and retain maintenance before applying the identity replay');
 const [owner]=await guard`select pg_try_advisory_lock(729114,12) acquired`;
 // This command is run exclusively while normal processing is inactive.
 if(!owner?.acquired)throw Error('Another identity repair is active');
 if((await q`select id from app.processing_runs where status='running'`).length)throw Error('Processing is active');
 const [boundary]=await q`select max(id)::text id from raw.raw_documents where source='elicitatie' and endpoint_version='tender-list:v1'`;
 const end=BigInt(boundary?.id??0);
 const cpvCatalog=await loadCpvCatalog(db),cpvByPrefix=await loadCpvPrefixMap(db),units=await loadUnitMap(db);
 let last=0n,processed=0;
 const parser=PARSERS['tender-list:v1']!;
 for(;;){
  const rows=await q`select r.id::text id,r.payload from raw.raw_documents r where source='elicitatie' and endpoint_version='tender-list:v1' and id>${String(last)}::bigint and id<=${String(end)}::bigint order by r.id limit 200`;
  if(!rows.length)break;
  if(apply)await db.transaction(async tx=>{
   for(const row of rows)await parser.load({tx,cpvCatalog,cpvByPrefix,units},BigInt(row.id),parser.schema.parse(row.payload));
  });
  else for(const row of rows)participationNamespace((parser.schema.parse(row.payload) as {sysNoticeTypeId?:number}).sysNoticeTypeId);
  processed+=rows.length;last=BigInt(rows.at(-1)!.id);
  console.log(JSON.stringify({apply,processed,lastRawId:String(last),boundary:String(end)}));
 }
 console.log(JSON.stringify({complete:true,apply,processed,boundary:String(end)}));
}finally{await guard`select pg_advisory_unlock(729114,12)`;guard.release();await q.end({timeout:5});}
