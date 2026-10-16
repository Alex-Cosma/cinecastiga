import type {DbSql} from '@seap/db';
import {extractTedNotice} from '../normalize/ted.js';
import {tedArchiveDocument} from '../scrape/ted/notices.js';
import {task,type PageResult,type Task,type TaskPlan} from './plan.js';

/**
 * TED as a collection stream: Romanian contract award notices (eForms
 * `can-standard`) published in the EU Official Journal. Same gate, proxies,
 * quiet window, ledger and retries as SEAP; failures pause only `ted`.
 *
 * One `ted-list` task per publication day and scan (pagination as children);
 * one `ted-xml` child per notice not yet archived. The XML is archived exactly
 * like the manual import (source 'ted', `ted-eforms:v1`), so the nightly
 * normalize → reconcile → ted-mart stages read it.
 */
export const TED_PAGE_SIZE=100;
/** Days re-searched before each newly closed day (late TED indexing). */
export const TED_OVERLAP_DAYS=3;
export const TED_NOTICE_TYPE='can-standard';
const ISO=/^\d{4}-\d{2}-\d{2}$/,PUBLICATION=/^\d{1,8}-\d{4}$/;

export function validateTedScope(t:Pick<Task,'kind'|'stream'|'params'>){
 const p=t.params,ted=t.stream==='ted';
 if(!ted&&(p.publicationNumber!==undefined||p.publicationDate!==undefined||p.tedScan!==undefined||t.kind==='ted-list'||t.kind==='ted-xml'))throw Error('TED: parametri în afara fluxului TED.');
 if(!ted)return;
 if(!p.tedScan||!ISO.test(p.tedScan))throw Error('TED: lipsește scanarea zilei.');
 if(t.kind==='ted-list'&&(!p.from||p.from!==p.to||!ISO.test(p.from)||!Number.isSafeInteger(p.page)||p.page<0||p.page>50))throw Error('TED: căutarea trebuie să acopere o singură zi.');
 else if(t.kind==='ted-xml'&&(!p.publicationNumber||!PUBLICATION.test(p.publicationNumber)||!p.publicationDate||!ISO.test(p.publicationDate)||p.page!==0))throw Error('TED: număr de publicare nevalid.');
 else if(t.kind!=='ted-list'&&t.kind!=='ted-xml')throw Error('TED: tip de sarcină necunoscut.');
}

export const tedListTask=(batch:string,day:string,scan:string,priority=10)=>task(batch,'ted','ted-list',{from:day,to:day,tedScan:scan,page:0},priority);

export function planTedTask(t:Task,value:unknown,previous:PageResult[]):TaskPlan{
 validateTedScope(t);
 return t.kind==='ted-list'?planTedList(t,value,previous):planTedXml(t,value);
}

/** Exact day population: same total on every page, no repeats, no foreign days. */
function planTedList(t:Task,value:unknown,previous:PageResult[]):TaskPlan{
 const day=t.params.from!,page=t.params.page;
 const e=value as {notices?:unknown;totalNoticeCount?:unknown};
 if(!e||!Array.isArray(e.notices)||!Number.isSafeInteger(e.totalNoticeCount)||Number(e.totalNoticeCount)<0)throw Error('TED: structura căutării nu este validă.');
 const total=Number(e.totalNoticeCount);
 if(total>TED_PAGE_SIZE*50)throw Error('TED: o singură zi depășește plafonul de paginare.');
 if(previous.length!==page)throw Error('TED: lipsește o pagină anterioară din jurnal.');
 if(previous.some(p=>p.total!==total))throw Error('TED: totalul s-a modificat în timpul paginării.');
 const notices=e.notices as Record<string,unknown>[];
 const numbers=notices.map(n=>n?.['publication-number']);
 if(numbers.some(n=>typeof n!=='string'||!PUBLICATION.test(n)))throw Error('TED: rezultat fără număr de publicare valid.');
 const identities=numbers as string[],before=previous.flatMap(p=>p.identities??[]);
 if(new Set([...before,...identities]).size!==before.length+identities.length)throw Error('TED: paginare instabilă (anunț repetat între pagini).');
 for(const n of notices){
  const date=n['publication-date'],type=n['notice-type'];
  if(typeof date==='string'&&date.slice(0,10)!==day)throw Error('TED: anunț din afara zilei solicitate.');
  if(type!==undefined&&type!==TED_NOTICE_TYPE)throw Error('TED: tip de anunț în afara fluxului.');
 }
 const expected=Math.min(TED_PAGE_SIZE,Math.max(0,total-page*TED_PAGE_SIZE));
 if(identities.length!==expected)throw Error('TED: numărul de anunțuri nu corespunde totalului.');
 const children=identities.map(p=>task(t.batch_id,'ted','ted-xml',{publicationNumber:p,publicationDate:day,tedScan:t.params.tedScan!,page:0},2));
 if((page+1)*TED_PAGE_SIZE<total)children.push(task(t.batch_id,'ted','ted-list',{...t.params,page:page+1},0));
 return {status:'complete',result:{total,ids:[],identities},docs:[],children};
}

/** Only XML the nightly parser reads back with the same number is archived. */
function planTedXml(t:Task,value:unknown):TaskPlan{
 const publication=t.params.publicationNumber!;
 if(typeof value!=='string'||!value.length)throw Error('TED: XML-ul notificării lipsește.');
 let parsed:string|null;
 try{parsed=extractTedNotice(value).publicationNumber;}catch{throw Error(`TED: XML-ul ${publication} nu poate fi citit.`);}
 if(parsed!==publication)throw Error(`TED: XML-ul cerut pentru ${publication} poartă alt număr de publicare.`);
 return {status:'complete',result:{total:1,ids:[],identities:[publication]},
  docs:[tedArchiveDocument({'publication-date':t.params.publicationDate!},publication,TED_NOTICE_TYPE,value)],children:[]};
}

/** Skip XML children already archived or already queued (any scan) unless that attempt failed. */
export async function filterTedChildren(tx:DbSql,t:Task,children:Task[]){
 const wanted=children.filter(c=>c.kind==='ted-xml').map(c=>c.params.publicationNumber!);
 if(!wanted.length)return children;
 const archived=await tx`select distinct external_id from raw.raw_documents where source='ted' and external_id=any(${wanted.map(p=>`${TED_NOTICE_TYPE}:${p}`)}::text[])`;
 const queued=await tx`select distinct params->>'publicationNumber' p from app.collection_tasks where batch_id=${t.batch_id} and stream='ted' and kind='ted-xml' and status<>'failed' and params->>'publicationNumber'=any(${wanted}::text[])`;
 const skip=new Set([...archived.map(r=>String(r.external_id).slice(TED_NOTICE_TYPE.length+1)),...queued.map(r=>String(r.p))]);
 return children.filter(c=>c.kind!=='ted-xml'||!skip.has(c.params.publicationNumber!));
}

/** Latest TED publication day already archived as an eForms award notice, from data. */
export async function latestArchivedTedDay(q:DbSql):Promise<string|null>{
 // Publication numbers grow with the OJ S issue; bulk-imported rows carry the date only in the XML.
 const [row]=await q`select max(coalesce(left(payload->>'publication-date',10),
   substring(payload->>'xml' from '<efbc:PublicationDate>([0-9]{4}-[0-9]{2}-[0-9]{2})'))) as day
  from (select payload from raw.raw_documents
   where source='ted' and endpoint_version='ted-eforms:v1' and external_id ~ '^can-standard:[0-9]+-[0-9]{4}$'
   order by split_part(split_part(external_id,':',2),'-',2)::int desc,split_part(split_part(external_id,':',2),'-',1)::int desc
   limit 50) latest`;
 const day=row?.day==null?null:String(row.day);
 return day&&ISO.test(day)?day:null;
}
