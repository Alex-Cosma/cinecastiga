import {createDb,type DbSql} from '@seap/db';
import {unstable_cache} from 'next/cache';
const globalDb=globalThis as unknown as {processingFreshnessSql?:DbSql};
export const getProcessingFreshness=unstable_cache(async()=>{
 const q=globalDb.processingFreshnessSql??=createDb().sql;
 const [r]=await q`select completed_at,validation->'risk' risk,
   validation->'stages' ? 'flags' and validation->'stages' ? 'flag-marts' legacy_full
   from app.monitoring_refreshes where status='ready' and kind='coordinated' order by version desc limit 1`;
 if(!r)return null;
 return {dataAt:new Date(r.completed_at).toISOString(),riskAt:r.risk?.calculatedAt??(r.legacy_full?new Date(r.completed_at).toISOString():null)};
},['processing-freshness-1'],{revalidate:60});
