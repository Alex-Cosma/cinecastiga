import {NOTICE_TYPE_IDS, noticeIdOf, type NoticeListItem} from '@seap/scraper-clients';
import {addDays,bucharestDayOf} from '../scrape/window.js';
import {redactPayload} from '../scrape/redact.js';
import type {ArchivableDocument} from '../scrape/archive.js';
export type Stream='da'|'tenders'|'awards'|'catalogue';
export interface Task {id?:number;batch_id:string;key:string;partition:string;stream:Stream;kind:'da'|'list'|'detail'|'contracts'|'catalogue';params:{from?:string;to?:string;page:number;authorityId?:number;noticeId?:number};status?:string;priority:number;error?:string}
export interface PageResult {total:number;ids:number[];items?:Record<string,unknown>[]}
export interface TaskPlan {status:'complete'|'split';result:PageResult|{detail:true};docs:ArchivableDocument[];children:Task[]}
const integer=(x:unknown):x is number=>Number.isSafeInteger(x)&&Number(x)>0;
export function task(batch:string,stream:Stream,kind:Task['kind'],params:Task['params'],priority=10):Task{
 const partition=[stream,kind,params.authorityId??params.noticeId??'',params.from??'',params.to??''].join(':');
 return {batch_id:batch,key:`${partition}:${params.page}`,partition,stream,kind,params,priority};
}
const document=(stream:Stream,id:number,version:string,payload:unknown):ArchivableDocument=>({source:'elicitatie',externalId:`${stream==='tenders'?'tender':stream==='awards'?'award':'da'}:${id}`,endpointVersion:version,payload});
/** One task consumes exactly one HTTP attempt. No cursor moves on validation failure. */
export function planResponse(t:Task,value:unknown,previous:PageResult[],batchEnd:string):TaskPlan{
 const prefix=t.stream==='tenders'?'tender':'award';
 if(t.kind==='detail'){
  const v=value as Record<string,unknown>;
  if(!v||typeof v!=='object'||Array.isArray(v)||!Object.keys(v).length)throw Error('Detaliu SEAP fără conținut.');
  if(integer(v.caNoticeId)&&v.caNoticeId!==t.params.noticeId||integer(v.cNoticeId)&&v.cNoticeId!==t.params.noticeId)throw Error('Identitatea detaliului nu corespunde.');
  return {status:'complete',result:{detail:true},children:[],docs:[document(t.stream,t.params.noticeId!,`${prefix}-detail:v1`,value)]};
 }
 const e=value as {total:number;items:Record<string,unknown>[];searchTooLong?:boolean};
 if(!e||!Array.isArray(e.items)||!Number.isSafeInteger(e.total)||e.total<0)throw Error('Structură de listă SEAP nevalidă.');
 if(t.kind==='da'&&(e.searchTooLong||e.total>2000)){
  const {from,to}=t.params;if(!from||!to||from===to)throw Error('O singură zi depășește plafonul SEAP; necesită o partiționare verificată.');
  const days=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1,mid=addDays(from,Math.floor(days/2)-1);
  return {status:'split',result:{total:e.total,ids:[]},docs:[],children:[task(t.batch_id,'da','da',{...t.params,to:mid,page:0},1),task(t.batch_id,'da','da',{...t.params,from:addDays(mid,1),page:0},1)]};
 }
 if(e.searchTooLong)throw Error('Fereastra SEAP este trunchiată; colectarea se oprește.');
 const pageSize=t.kind==='da'||t.kind==='catalogue'?2000:t.kind==='contracts'?200:100;
 if(e.items.length>pageSize)throw Error('Dimensiunea paginii depășește limita cerută.');
 if(previous.some(p=>p.total!==e.total))throw Error('Totalul s-a modificat în timpul paginării; necesită reverificare.');
 const before=previous.flatMap(p=>p.ids);
 if(before.length!==t.params.page*pageSize)throw Error('Lipsește o pagină anterioară din jurnal.');
 const ids=e.items.map(i=>t.kind==='da'?i.directAcquisitionId:t.kind==='catalogue'?i.id:t.kind==='contracts'?i.caNoticeContractId??i.contractId:noticeIdOf(i as NoticeListItem));
 if(ids.some(id=>!integer(id)))throw Error('Lista conține identificatori lipsă sau nevalizi.');
 const validIds=ids as number[];
 if(new Set([...before,...validIds]).size!==before.length+validIds.length)throw Error('SEAP a repetat înregistrări între pagini.');
 if(e.items.length!==Math.min(pageSize,Math.max(0,e.total-before.length)))throw Error('Numărul de înregistrări nu corespunde totalului SEAP.');
 const docs:ArchivableDocument[]=[],children:Task[]=[];
 for(const i of e.items){
  if(t.kind==='da'){
   if(typeof i.finalizationDate!=='string')throw Error('Data finalizării lipsește.');
   const day=bucharestDayOf(i.finalizationDate);
   if(day<t.params.from!||day>t.params.to!)throw Error('Filtrul de finalizare nu este respectat.');
   docs.push(document('da',Number(i.directAcquisitionId),'da-list:v1',i));
  }else if(t.kind==='list'){
   const types=t.stream==='tenders'?NOTICE_TYPE_IDS.participation:NOTICE_TYPE_IDS.award;
   if(!(types as readonly number[]).includes(Number(i.sysNoticeTypeId)))throw Error('Tip de anunț în afara fluxului solicitat.');
   if(typeof i.noticeStateDate!=='string'||bucharestDayOf(i.noticeStateDate)<t.params.from!)throw Error('Filtrul de publicare nu este respectat.');
   if(typeof i.publicationDate==='string'&&bucharestDayOf(i.publicationDate)!==t.params.from)throw Error('Anunț din afara zilei solicitate.');
   const id=noticeIdOf(i as NoticeListItem);docs.push(document(t.stream,id,`${prefix}-list:v1`,i));
   const detail=task(t.batch_id,t.stream,'detail',{noticeId:id,page:0},2);
   if(i.sysNoticeVersionId===2){detail.status='deferred';detail.error='Detaliu eForms: endpoint separat, neimplementat. Lista nu reprezintă documentația completă.';}
   children.push(detail);
   if(t.stream==='awards')children.push(task(t.batch_id,t.stream,'contracts',{noticeId:id,page:0},1));
  }else if(t.kind==='catalogue')children.push(task(t.batch_id,'da','da',{authorityId:Number(i.id),from:t.params.from??'2026-07-01',to:t.params.to??batchEnd,page:0}));
 }
 const more=before.length+validIds.length<e.total;
 if(more)children.push(task(t.batch_id,t.stream,t.kind,{...t.params,page:t.params.page+1},0));
 const result:PageResult={total:e.total,ids:validIds};
 if(t.kind==='contracts'){
  result.items=redactPayload(e.items,'award-contracts:v1') as Record<string,unknown>[];
  if(!more)docs.push(document('awards',t.params.noticeId!,'award-contracts:v1',{caNoticeId:t.params.noticeId,total:e.total,items:[...previous.flatMap(p=>p.items??[]),...result.items]}));
 }
 return {status:'complete',result,docs,children};
}
