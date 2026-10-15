/** Targeted rehearsal on a copied PUBLIC cohort. Never a production repair. */
import {createDb,contractKind,contractReportable,type DbSql} from '@seap/db';
import {repairContractTypes,contractReportingSummary} from '../normalize/contract-reporting.js';
import {prepareNewContractIdentities,AUTOMATIC_IDENTITY_REASON} from '../normalize/discover-contract-identities.js';
import {approveContractIdentities} from '../normalize/approve-contract-identities.js';
import {runMarts} from '../normalize/marts.js';
import {validateContractPopulation} from '../monitoring/validate.js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {archiveDocumentsSql} from '../scrape/archive.js';
import {PARSERS} from '../normalize/parsers.js';
import {loadCpvCatalog,loadCpvPrefixMap,loadUnitMap} from '../normalize/context.js';
const url=new URL(process.env.DATABASE_URL??'postgres://invalid/');
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.pathname!=='/seap_test_currency_reporting_20261011')
  throw Error('Only the dedicated local reporting rehearsal database is allowed');
const {db,sql}=createDb();
try {
 const types=await repairContractTypes(sql);
 const sourcePath=process.argv[2],expectedHash=process.argv[3];
 const bytes=sourcePath?readFileSync(sourcePath):null;
 if(bytes&&createHash('sha256').update(bytes).digest('hex')!==expectedHash)throw Error('Supplemental archive checksum mismatch');
 const supplemental=bytes?bytes.toString('utf8').trim().split('\n').map(line=>{
   const r=JSON.parse(line);return {source:'public-local-dump-20260930',rawId:String(r.id),hash:r.content_hash,endpoint:r.endpoint_version,payload:r.payload};
 }):[];
 if(supplemental.length){
  await sql`select setval(pg_get_serial_sequence('raw.raw_documents','id'),(select max(id) from raw.raw_documents))`;
  await archiveDocumentsSql(sql,supplemental.map(a=>({source:'elicitatie',externalId:'award:'+a.payload.caNoticeId,endpointVersion:a.endpoint,payload:a.payload})));
  const recovered=await sql`select id::text,payload,endpoint_version from raw.raw_documents where external_id in ('award:100532825','award:100639950')
    order by case when endpoint_version='award-list:v1' then 0 else 1 end,id`;
  const ctx={tx:db,cpvCatalog:await loadCpvCatalog(db),cpvByPrefix:await loadCpvPrefixMap(db),units:await loadUnitMap(db)};
  for(const r of recovered)await db.transaction(tx=>PARSERS[r.endpoint_version]!.load({...ctx,tx},BigInt(r.id),r.payload));
 }
 const [boundary]=await sql`select coalesce(max(id),0)::text id from raw.raw_documents`;
 const prepared=await prepareNewContractIdentities(sql,String(boundary!.id),['CAN1170804','CAN1080811','CAN1171713'],supplemental);
 const report={types,groups:prepared.groups.map(g=>({id:g.id,status:g.status,reasons:g.reasons,publicIds:g.members.map(m=>m.publicId)})),blocked:prepared.blocked.length};
 console.log(JSON.stringify(report,null,2));
 if(prepared.blocked.length)throw Error('Rehearsal source proofs incomplete');
 for(const g of prepared.groups.filter(g=>g.status==='source_verified')) {
  await sql`insert into marts.contract_identity_candidates(id,fingerprint,status,evidence,active)
    values(${g.id},${g.fingerprint},${g.status},${JSON.stringify(g)}::jsonb,true) on conflict do nothing`;
  await sql`insert into marts.contract_identity_observations(fingerprint,candidate_id,evidence)
    values(${g.fingerprint},${g.id},${JSON.stringify(g)}::jsonb) on conflict do nothing`;
 }
 const approved=await sql.begin(tx=>approveContractIdentities(tx as unknown as DbSql,prepared.groups.filter(g=>g.status==='source_verified'),prepared.archives,AUTOMATIC_IDENTITY_REASON));
 const marts=await runMarts(sql);
 const validation=await validateContractPopulation(sql);
 const totals=await sql`select notice_no,count(distinct contract_id)::int contracts,sum(closing_value)::text ron
   from marts.contract_transactions group by notice_no order by notice_no`;
 const roles=await sql`select c.ca_notice_contract_id::text id,${contractKind(sql)} kind,${contractReportable(sql)} reportable from core.contracts c order by c.id`;
 console.log(JSON.stringify({approved,marts,validation,totals,roles,summary:await contractReportingSummary(sql)},null,2));
 if(['eligible_missing','excluded_included','allocation_mismatches'].some(key=>String(validation?.[key])!=='0'))throw Error('Population reconciliation failed');
} finally {await sql.end();}
