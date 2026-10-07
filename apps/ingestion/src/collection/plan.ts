import {NOTICE_TYPE_IDS, noticeIdOf, type NoticeListItem} from '@seap/scraper-clients';
import {addDays,bucharestDayOf} from '../scrape/window.js';
import {redactPayload} from '../scrape/redact.js';
import type {ArchivableDocument} from '../scrape/archive.js';
import {isDeepStrictEqual} from 'node:util';
export type Stream='da'|'tenders'|'awards'|'catalogue';
export interface Task {id?:number;batch_id:string;key:string;partition:string;stream:Stream;kind:'da'|'list'|'detail'|'contracts'|'catalogue';params:{from?:string;to?:string;page:number;authorityId?:number;noticeId?:number};status?:string;priority:number;error?:string}
export interface PageResult {total:number;ids:number[];items?:Record<string,unknown>[]}
export interface TaskPlan {status:'complete'|'split';result:PageResult|{detail:true};docs:ArchivableDocument[];children:Task[]}
const integer=(x:unknown):x is number=>Number.isSafeInteger(x)&&Number(x)>0;
const emptyPart=(v:unknown)=>v==null||v===''||(Array.isArray(v)&&v.length===0);
/** Compare full winner records by their source IDs, never just names or CUIs. */
function sameWinners(a:unknown,b:unknown):a is Record<string,unknown>[] {
 if(!Array.isArray(a)||!Array.isArray(b)||!a.length||a.length!==b.length)return false;
 const indexed=(rows:unknown[])=>{
  const byId=new Map<number,Record<string,unknown>>();
  for(const row of rows){
   if(!row||typeof row!=='object'||!('id' in row)||!integer(row.id)||byId.has(row.id))return null;
   byId.set(row.id,row as Record<string,unknown>);
  }
  return byId;
 };
 const left=indexed(a),right=indexed(b);
 return !!left&&!!right&&[...left].every(([id,row])=>isDeepStrictEqual(row,right.get(id)));
}
/** Names can contain commas. Require an exact permutation of complete names,
 * not sorted comma fragments; ambiguous/pathological captions fail closed. */
function captionMatchesWinners(caption:unknown,winners:Record<string,unknown>[]){
 if(typeof caption!=='string'||winners.length>100)return false;
 const names=winners.map(w=>w.name);
 if(names.some(n=>typeof n!=='string'||!n.length))return false;
 let attempts=0;
 const matches=(text:string,remaining:string[]):boolean=>{
  if(++attempts>1000)return false;
  if(!remaining.length)return text==='';
  return remaining.some((name,i)=>remaining.length===1?text===name:
   text.startsWith(name+',')&&matches(text.slice(name.length+1),remaining.filter((_,j)=>j!==i)));
 };
 return matches(caption,names as string[]);
}
/** The endpoint sometimes splits winner and lot captions over an overlap.
 * Only fill empty presentation/winner fields; conflicting facts still stop. */
function mergeContractPageRow(a:Record<string,unknown>,b:Record<string,unknown>){
 const merged={...a};
 const equivalentWinners=sameWinners(a.winners,b.winners);
 const fragments=new Set(['winner','winners','winnerCaption','lotsCaption','lotsNoCaption']);
 for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
  if(isDeepStrictEqual(a[key],b[key]))continue;
  if(key==='winners'&&equivalentWinners)continue;
  if(key==='winnerCaption'&&equivalentWinners&&captionMatchesWinners(a[key],a.winners as Record<string,unknown>[])&&captionMatchesWinners(b[key],a.winners as Record<string,unknown>[]))continue;
  if(fragments.has(key)&&emptyPart(a[key])){merged[key]=b[key];continue;}
  if(fragments.has(key)&&emptyPart(b[key]))continue;
  throw Error('SEAP a modificat un contract între pagini; necesită reverificare.');
 }
 return merged;
}
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
 // CANoticeContracts can return surplus rows and overlap adjacent pages.
 // Keep the requested offsets, validate repeated payloads and reconcile the
 // final DISTINCT contract population to total before archiving anything.
 const contracts=t.kind==='contracts';
 if(e.items.length>(contracts?e.total:pageSize))throw Error('Dimensiunea paginii depășește limita cerută.');
 if(previous.some(p=>p.total!==e.total))throw Error('Totalul s-a modificat în timpul paginării; necesită reverificare.');
 const before=previous.flatMap(p=>p.ids);
 if(contracts?previous.length!==t.params.page:before.length!==t.params.page*pageSize)throw Error('Lipsește o pagină anterioară din jurnal.');
 const ids=e.items.map(i=>t.kind==='da'?i.directAcquisitionId:t.kind==='catalogue'?i.id:t.kind==='contracts'?i.caNoticeContractId??i.contractId:noticeIdOf(i as NoticeListItem));
 if(ids.some(id=>!integer(id)))throw Error('Lista conține identificatori lipsă sau nevalizi.');
 const validIds=ids as number[];
 if(new Set(validIds).size!==validIds.length||(!contracts&&new Set([...before,...validIds]).size!==before.length+validIds.length))throw Error('SEAP a repetat înregistrări între pagini.');
 const expected=Math.min(pageSize,Math.max(0,e.total-t.params.page*pageSize));
 if(contracts?e.items.length<expected:e.items.length!==expected)throw Error('Numărul de înregistrări nu corespunde totalului SEAP.');
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
 let more=before.length+validIds.length<e.total;
 let contractItems:Record<string,unknown>[]=[];
 if(contracts){
  const unique=new Map<number,Record<string,unknown>>();
  for(const item of [...previous.flatMap(p=>p.items??[]),...redactPayload(e.items,'award-contracts:v1') as Record<string,unknown>[]]){
   const id=Number(item.caNoticeContractId??item.contractId),prior=unique.get(id);
   unique.set(id,prior?mergeContractPageRow(prior,item):item);
  }
  if(unique.size>e.total)throw Error('Numărul de contracte unice depășește totalul SEAP.');
  more=(t.params.page+1)*pageSize<e.total&&unique.size<e.total;
  if(!more&&unique.size!==e.total)throw Error('Numărul de contracte unice nu corespunde totalului SEAP.');
  contractItems=[...unique.values()];
 }
 if(more)children.push(task(t.batch_id,t.stream,t.kind,{...t.params,page:t.params.page+1},0));
 const result:PageResult={total:e.total,ids:validIds};
 if(t.kind==='contracts'){
  result.items=redactPayload(e.items,'award-contracts:v1') as Record<string,unknown>[];
  if(!more)docs.push(document('awards',t.params.noticeId!,'award-contracts:v1',{caNoticeId:t.params.noticeId,total:e.total,items:contractItems}));
 }
 return {status:'complete',result,docs,children};
}
