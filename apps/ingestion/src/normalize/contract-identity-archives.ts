import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import type {DbSql} from '@seap/db';
import type {ArchivedAward} from './contract-identity.js';

/** Sources restored from a pinned backup supplement, never replace, current raw.
 * Indexed/bounded by publication ID; the complete archive stays out of memory. */
export async function readRecoveredIdentityArchives(q:DbSql,external:string[]):Promise<ArchivedAward[]> {
 if(!external.length)return [];
 const rows=await q`select source,original_raw_id,content_hash,endpoint,payload
  from marts.contract_identity_archives where external_id=any(${external}::text[]) order by archive_key`;
 return rows.map(r=>({source:String(r.source),rawId:String(r.original_raw_id),hash:String(r.content_hash),endpoint:String(r.endpoint),payload:r.payload}));
}

/** Stream exact JSON into PostgreSQL: parsing/stringifying financial numbers in
 * JS would round them. The complete file hash is checked INSIDE the transaction;
 * a mismatch rolls back the entire import. This does not normalize old payloads. */
export async function importRecoveredIdentityArchives(q:DbSql,path:string,sha256:string,source:string) {
 if(!/^[a-f0-9]{64}$/.test(sha256)||!source.trim())throw Error('Pinned SHA-256 and archive source name required');
 const transact=typeof q.begin==='function'?q.begin.bind(q):(q as unknown as {savepoint:DbSql['begin']}).savepoint.bind(q);
 return transact(async tx=>{
  const sql=tx as unknown as DbSql, digest=createHash('sha256');
  const stream=createReadStream(path);stream.on('data',chunk=>digest.update(chunk));
  const lines=createInterface({input:stream,crlfDelay:Infinity});
  let batch:string[]=[],total=0,inserted=0;
  const flush=async()=>{
   if(!batch.length)return;
   const records='['+batch.join(',')+']';
   const bad=await sql`select count(*)::int n from jsonb_array_elements(${records}::jsonb) r where
    r->>'source' is distinct from 'elicitatie' or coalesce(r->>'id','')!~'^[0-9]+$'
    or coalesce(r->>'content_hash','')!~'^[a-f0-9]{64}$'
    or coalesce(r->>'endpoint_version','') not in ('award-list:v1','award-contracts:v1')
    or coalesce(r->>'external_id','')!~'^award:[0-9]+$'
    or r->>'external_id' is distinct from 'award:'||(r->'payload'->>'caNoticeId')`;
   if(bad[0]?.n)throw Error('Invalid archived award evidence');
   const rows=await sql`insert into marts.contract_identity_archives
    (archive_key,bundle_sha256,external_id,source,original_raw_id,endpoint,content_hash,payload)
    select md5(${source}||':'||r::text),${sha256},r->>'external_id',${source},r->>'id',r->>'endpoint_version',r->>'content_hash',r->'payload'
    from jsonb_array_elements(${records}::jsonb) r on conflict(archive_key) do nothing returning archive_key`;
   total+=batch.length;inserted+=rows.length;batch=[];
  };
  try {
   for await(const line of lines){if(line.trim())batch.push(line);if(batch.length>=50)await flush();}
   await flush();
   if(digest.digest('hex')!==sha256)throw Error('Recovered evidence SHA-256 mismatch; import rolled back');
   return {source,sha256,total,inserted};
  } finally {lines.close();stream.destroy();}
 });
}
