import {createDb} from '@seap/db';
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const u=new URL(process.env.DATABASE_URL??'postgres://invalid/');
if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||!u.pathname.startsWith('/seap_test_currency_'))throw Error('Requires validated isolated fixture');
const [output,...files]=process.argv.slice(2);if(!output||!files.length)throw Error('Pass output gzip and source JSONL files');
const {sql}=createDb();try{
 const groups=await sql.begin('read only',async q=>(await q`select c.evidence from marts.contract_identity_candidates c join marts.contract_identity_decisions d on d.candidate_id=c.id and d.fingerprint=c.fingerprint where c.active and c.status='source_verified' order by c.id`).map(r=>r.evidence));
 if(groups.length!==8045)throw Error('Validated approval population changed');
 const archives=[];for(const file of files)for(const line of (await readFile(file,'utf8')).trim().split('\n')){const r=JSON.parse(line);archives.push({source:r.archive_source,hash:r.content_hash,rawId:String(r.id),endpoint:r.endpoint_version,payload:r.payload});}
 const bytes=gzipSync(JSON.stringify({version:1,groups,archives,expected:{groups:8045,duplicates:7300,reductionRon:'7100577914.82'}}));
 await writeFile(output,bytes,{mode:0o600});console.log(JSON.stringify({sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,groups:groups.length,archives:archives.length}));
}finally{await sql.end();}
