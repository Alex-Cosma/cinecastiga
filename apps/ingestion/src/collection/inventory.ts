import type {DbSql} from '@seap/db';
import {noticeIdOf,participationNamespace,type NoticeListItem} from '@seap/scraper-clients';
import type {Task} from './plan.js';

export interface InventoryIdentity {key:string;noticeNo:string}
export interface InventoryComparison {checked:number;matched:number;missing:InventoryIdentity[];unverified:InventoryIdentity[]}
/** Compare to normalized data at collection time, before a future normalization.
 * Missing rows are not proof of missing contracts; null old names are unverified.
 * A contradictory identity stops before archival can feed it into normalization.
 */
export async function compareNoticeInventory(q:DbSql,t:Task,items:NoticeListItem[]):Promise<InventoryComparison>{
 if(t.kind!=='list'||!['tenders','awards'].includes(t.stream))throw Error('Notice inventory requires a notice list');
 const identities=items.map(item=>{
  const publicId=noticeIdOf(item),namespace=t.stream==='tenders'?participationNamespace(item.sysNoticeTypeId):'award';
  if(!Number.isSafeInteger(publicId)||publicId<=0||typeof item.noticeNo!=='string'||!item.noticeNo.trim())throw Error('Identitatea inventarului nu conține numărul anunțului.');
  return {publicId,namespace,key:`${namespace}:${publicId}`,noticeNo:item.noticeNo,internalId:item.noticeId};
 });
 const ids=identities.map(i=>i.publicId);
 const rows=t.stream==='tenders'
  ?await q`select notice_namespace namespace,c_notice_id::text public_id,notice_no,internal_notice_id::text internal_id from core.notices where c_notice_id=any(${ids}::bigint[])`
  :await q`select 'award' namespace,ca_notice_id::text public_id,notice_no,null::text internal_id from core.awards where ca_notice_id=any(${ids}::bigint[])`;
 const stored=new Map(rows.map(row=>[`${row.namespace}:${row.public_id}`,row]));
 const result:InventoryComparison={checked:items.length,matched:0,missing:[],unverified:[]};
 for(const source of identities){
  const row=stored.get(source.key),identity={key:source.key,noticeNo:source.noticeNo};
  if(!row){result.missing.push(identity);continue;}
  if(row.notice_no!=null&&row.notice_no!==source.noticeNo||row.internal_id!=null&&source.internalId!=null&&row.internal_id!==String(source.internalId))throw Error(`Identitatea inventarului contrazice datele normalizate: ${source.key}, ${source.noticeNo}.`);
  if(row.notice_no==null)result.unverified.push(identity);else result.matched++;
 }
 return result;
}
