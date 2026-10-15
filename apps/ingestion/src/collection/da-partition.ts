import {readFileSync} from 'node:fs';
import {parseCpvObject} from '../normalize/cpv.js';
import {bucharestDayOf} from '../scrape/window.js';
import {task,type Task,type TaskPlan} from './plan.js';

export const DA_STRATEGY='cpv-day-v1' as const;
// One canonical, vendored official catalogue, available in source and Docker builds.
const codes=(JSON.parse(readFileSync(new URL('../../../../packages/db/seed/cpv_2008.json',import.meta.url),'utf8')) as {code:string}[]).map(r=>r.code.slice(0,8));
// SEAP also exposes internal id10000: '00000000 Coduri CPV'. Do not omit it.
const catalogue=new Set([...codes,'00000000']);
export function cpvChildren(prefix=''){const length=prefix?prefix.length+1:2;return prefix?[...new Set(codes.filter(c=>c.startsWith(prefix)).map(c=>c.slice(0,length)))]:[...new Set(codes.map(c=>c.slice(0,2))),'00000000'];}
export function validateDaScope(t:Pick<Task,'kind'|'stream'|'params'>){
 const p=t.params;
 if(p.daStrategy===undefined){if(p.cpvPrefix!==undefined||p.daScan!==undefined||p.daFallback)throw Error('Fereastra CPV necesită strategia explicită.');return;}
 if(p.daStrategy!==DA_STRATEGY||!['da','catalogue','da-detail'].includes(t.kind)||!p.from||p.from!==p.to||!/^\d{4}-\d{2}-\d{2}$/.test(p.from)||!p.daScan||!/^\d{4}-\d{2}-\d{2}$/.test(p.daScan)||p.page!==0&&t.kind!=='catalogue')throw Error('Fereastra națională DA trebuie să fie o singură zi.');
 if(p.cpvPrefix!==undefined&&(!/^\d{2,8}$/.test(p.cpvPrefix)||![...catalogue].some(c=>c.startsWith(p.cpvPrefix!))))throw Error('Filtrul CPV nu aparține nomenclatorului verificat.');
}
/** Disjoint ownership by leading code; the source substring queries themselves overlap. */
export function planNationalDa(t:Task,value:unknown):TaskPlan{
 validateDaScope(t);
 const p=t.params,e=value as {total:number;items:Record<string,unknown>[];searchTooLong?:boolean};
 if(!e||!Array.isArray(e.items)||!Number.isSafeInteger(e.total)||e.total<0||e.items.length>2000)throw Error('Structură de listă SEAP nevalidă.');
 const ids=e.items.map(i=>i.directAcquisitionId);
 if(ids.some(id=>!Number.isSafeInteger(id)||Number(id)<=0)||new Set(ids).size!==ids.length)throw Error('Lista conține identificatori lipsă, nevalizi sau repetați.');
 for(const i of e.items)if(typeof i.finalizationDate!=='string'||bucharestDayOf(i.finalizationDate)!==p.from)throw Error('Filtrul de finalizare nu este respectat.');
 if(p.cpvPrefix&&e.items.some(i=>typeof i.cpvCode!=='string'||!i.cpvCode.includes(p.cpvPrefix!)))throw Error('Filtrul CPV nu este respectat.');
 const unknown=e.items.some(i=>typeof i.cpvCode!=='string'||!/^\d{8}(?:-\d|\s|$)/.test(i.cpvCode)||!catalogue.has(i.cpvCode.slice(0,8)));
 const overflow=!!e.searchTooLong||e.total>=2000;
 if(overflow){
  if(p.authorityId!==undefined)throw Error('O singură instituție și zi depășesc plafonul SEAP; necesită verificare.');
  const children=!unknown&&(p.cpvPrefix?.length??0)<8?cpvChildren(p.cpvPrefix):[];
  return {status:'split',result:{total:e.total,ids:[]},docs:[],children:children.length
   ?children.map(cpvPrefix=>task(t.batch_id,'da','da',{...p,cpvPrefix,page:0},1))
   :[task(t.batch_id,'catalogue','catalogue',{...Object.fromEntries(Object.entries(p).filter(([key])=>!unknown||key!=='cpvPrefix')),daStrategy:DA_STRATEGY,from:p.from!,to:p.to!,daScan:p.daScan!,daFallback:true,page:0},1)]};
 }
 if(e.total!==e.items.length)throw Error('Numărul de înregistrări nu corespunde totalului SEAP.');
 // A newly observed code must never disappear because a cached taxonomy omits it.
 if(unknown&&p.cpvPrefix&&!p.daFallback)return {status:'split',result:{total:e.total,ids:[]},docs:[],children:[task(t.batch_id,'catalogue','catalogue',{...Object.fromEntries(Object.entries(p).filter(([key])=>!unknown||key!=='cpvPrefix')),daStrategy:DA_STRATEGY,from:p.from!,to:p.to!,daScan:p.daScan!,daFallback:true,page:0},1)]};
 const owned=p.cpvPrefix?e.items.filter(i=>typeof i.cpvCode==='string'&&i.cpvCode.startsWith(p.cpvPrefix!)):e.items;
 return {status:'complete',result:{total:owned.length,ids:owned.map(i=>Number(i.directAcquisitionId)),sourceTotal:e.total},children:[],docs:owned.map(payload=>({source:'elicitatie',externalId:`da:${payload.directAcquisitionId}`,endpointVersion:'da-list:v1',payload}))};
}
export function planDaVerification(t:Task,value:unknown):TaskPlan{
 validateDaScope(t);const p=t.params,d=value as Record<string,unknown>;
 if(!d||d.directAcquisitionID!==p.noticeId)throw Error('Identitatea detaliului DA nu corespunde cererii.');
 const cpv=parseCpvObject(d.cpvCode as {text?:string;localeKey?:string}|null).code;
 if(typeof d.finalizationDate==='string'&&bucharestDayOf(d.finalizationDate)===p.from&&(!p.cpvPrefix||typeof cpv!=='string'||cpv.startsWith(p.cpvPrefix)))throw Error('Lista DA omite o înregistrare care încă aparține aceleiași zile și aceluiași CPV.');
 if(d.finalizationDate==null&&![2,5].includes(Number(d.sysDirectAcquisitionStateID)))throw Error('Data finalizării lipsește fără o stare DA în desfășurare.');
 return {status:'complete',result:{detail:true},children:[],docs:[{source:'elicitatie',externalId:`da:${p.noticeId}`,endpointVersion:'da-detail:v1',payload:d}]};
}

/** Weekly source-vocabulary check. A new/missing/repeated code requires review;
 * discovery must never silently keep using a stale CPV partition. */
export function planCpvCatalogue(t:Task,value:unknown,previous:import('./plan.js').PageResult[]):TaskPlan{
 const e=value as {total:number;items:Record<string,unknown>[]};
 if(!e||!Array.isArray(e.items)||e.total!==catalogue.size||e.items.length!==Math.min(50,e.total-t.params.page*50)||previous.length!==t.params.page)throw Error('Lista nomenclatorului CPV s-a modificat; verifică acoperirea înainte de reluare.');
 const all=[...previous.flatMap(p=>p.items??[]),...e.items];
 const ids=all.map(i=>i.id),seen=all.map(i=>typeof i.text==='string'?i.text.slice(0,8):'');
 if(ids.some(id=>!Number.isSafeInteger(id)||Number(id)<=0)||new Set(ids).size!==ids.length||new Set(seen).size!==seen.length||seen.some(code=>!catalogue.has(code)))throw Error('Lista nomenclatorului CPV conține coduri noi sau repetate; necesită verificare.');
 const more=all.length<e.total;
 return {status:'complete',result:{total:e.total,ids:e.items.map(i=>Number(i.id)),items:e.items},docs:[],children:more?[task(t.batch_id,'catalogue','cpv-catalogue',{...t.params,page:t.params.page+1},0)]:[]};
}
