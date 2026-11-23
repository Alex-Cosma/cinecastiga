import { periodPhrase } from '../ask/filters/words';
import { parseRoleParam } from '../role-param';
export type SearchTab='all'|'acquisitions'|'documents'|'entities';
export type TopicScope={q:string;place:string;from:string;to:string;type:'all'|'da'|'contracts';match:'words'|'phrase';tab:SearchTab;page:number;role:''|'authority'|'supplier';/** The acquisitions' order: the newest first unless asked („cel mai mare contract” or the panel's switch). */order?:'value'|'date';/** The words are a subject: the names panel lists only names that carry them, never the closest names. */names?:'exact';/** A locality: only its town hall („Doar primăria”), not all of its institutions (owner, 13 November 2026). */hall?:boolean;/** One CPV domain of the subject („34993000-4”), kept alone in „Pe scurt” (owner, 16 November 2026); a new search drops it. */domain?:string};
/** How a suggestion matched the typed place name (/api/topic-search/places); absent on stored places. */
export type PlaceMatchKind='exact'|'prefix'|'word'|'contains'|'county'|'fuzzy';
export type Place={id:string;name:string;detail:string;kind:'county'|'locality';match?:PlaceMatchKind};
export type AcquisitionHit={id:string;kind:'da'|'contracts';title:string;date:string|null;value:string|null;authorityId:string|null;authorityName:string|null;suppliers:string[];/** The suppliers' ids, in the same order as their names. */supplierIds?:string[];county:string|null;code:string|null;href:string;sourceUrl:string};
export type DocumentHit={id:string;filename:string;page:number;pages:number[];text:string;method:string;noticeNo:string;noticeTitle:string;sourceUrl:string;contractId:string|null};
export type EntityHit={id:string;name:string;cui:string|null;roles:string[];county:string|null};
/** Titles, institutions and firms: the fast part of a search. */
export type TopicResult={scope:TopicScope;place:Place|null;acquisitions:{total:number;hits:AcquisitionHit[]};entities:{total:number;hits:EntityHit[];suggestions?:EntityHit[];/** No name contains the words: the closest names instead. */approximate?:true};builtAt:string|null;titleCoverage:{total:number;searchable:number};/** A locality chosen: who „toate instituțiile” holds (lib/locality-institutions.ts). */locality?:TopicLocality|null;/** „Doar primăria” found no title: the titles at the locality's other institutions. */elsewhere?:number};
export type TopicLocality={townHall:number;groups:{kind:'primarie'|'institutie'|'firma'|'spital'|'scoala';name:string}[]};
/** Prepared document pages for the same selection, from /api/topic-search/documents. */
export type TopicDocumentsResult={scope:TopicScope;documents:{total:number;hits:DocumentHit[]};coverage:{known:number;ready:number;pages:number}};
export const PAGE_SIZE=10;
/**
 * A bound of the period in the address: a year („2024”) or a month of one („2024-12”). Owner, 23 November 2026: /cauta
 * filters by month too; only the words („în decembrie 2024”, „ultimele 6 luni”) and such an address set months, the
 * page's own period picker stays by years. Both bounds are years or both are months.
 */
const PERIOD_BOUND=/^(\d{4})(?:-(0[1-9]|1[0-2]))?$/;
export type PeriodWindow={yearFrom:number;yearTo:number;monthFrom?:number;monthTo?:number};
/** The address's period as years and months (the first month of yearFrom, the last of yearTo), or null when unread. */
export function periodWindow(from:string,to:string):PeriodWindow|null{
 const a=PERIOD_BOUND.exec(from),b=PERIOD_BOUND.exec(to);
 if(!a||!b||Boolean(a[2])!==Boolean(b[2]))return null;
 return {yearFrom:Number(a[1]),yearTo:Number(b[1]),...(a[2]&&b[2]?{monthFrom:Number(a[2]),monthTo:Number(b[2])}:{})};
}
/** The same window as the address writes it. */
export function periodBounds(w:PeriodWindow):{from:string;to:string}{
 const bound=(y:number,m?:number)=>m===undefined?String(y):`${y}-${String(m).padStart(2,'0')}`;
 return {from:bound(w.yearFrom,w.monthFrom),to:bound(w.yearTo,w.monthTo)};
}
/** The period as the page says it: „2024”, „2023–2024”, „dec. 2024”, „iun.–nov. 2026” (the sentence's own words). */
export function periodText(from:string,to:string):string{
 const w=periodWindow(from,to);
 return w?periodPhrase(w).value:from===to?from:`${from}–${to}`;
}
export function parseTopicScope(p:URLSearchParams):TopicScope {
 const q=(p.get('q')??'').trim().replace(/\s+/g,' ');
 if(q.length>150)throw Error('Căutarea poate avea cel mult 150 de caractere.');
 if(q&&q.length<2)throw Error('Scrie cel puțin două caractere.');
 const from=p.get('from')??'',to=p.get('to')??'';
 const year=(v:string)=>PERIOD_BOUND.test(v)&&Number(v.slice(0,4))>=1900&&Number(v.slice(0,4))<=new Date().getFullYear()+1;
 if((from||to)&&(!year(from)||!year(to)||from.length!==to.length||from>to))throw Error('Alege un interval valid: anul de început nu poate depăși anul de sfârșit.');
 const place=p.get('place')??'';
 if(place&&!/^(county:[a-z -]{2,40}|uat:\d{1,7})$/.test(place))throw Error('Alege o localitate sau un județ din sugestii.');
 const type=p.get('type')??'all',match=p.get('match')??'words',tab=p.get('tab')??'all';
 if(!['all','da','contracts'].includes(type)||!['words','phrase'].includes(match)||!['all','acquisitions','documents','entities'].includes(tab))throw Error('Filtre de căutare invalide.');
 const rawPage=p.get('page')??'1';
 if(!/^\d{1,4}$/.test(rawPage)||Number(rawPage)<1||Number(rawPage)>1000)throw Error('Pagina nu este validă. Restrânge căutarea pentru rezultate mai precise.');
 const role=parseRoleParam(p.get('rol'))??'';
 const domain=p.get('domeniu')??'';
 if(domain&&!/^\d{8}-\d$/.test(domain))throw Error('Domeniul ales nu este un cod CPV.');
 const ordine=p.get('ordine');
 return {q,place,from,to,type:type as TopicScope['type'],match:match as TopicScope['match'],tab:role?'entities':tab as SearchTab,page:Number(rawPage),role,...(ordine==='valoare'?{order:'value' as const}:ordine==='data'?{order:'date' as const}:{}),...(p.get('nume')==='exacte'?{names:'exact' as const}:{}),...(p.get('doar')==='primaria'&&place.startsWith('uat:')?{hall:true as const}:{}),...(domain&&q?{domain}:{})};
}
/**
 * An address with filters /cauta cannot read (UX audit Z1-31, 16 November 2026): the same address without them, so the
 * search still runs and the page says one was left out. Each filter is checked on its own (the years as a pair); null
 * when the address reads as it is, or when the words themselves cannot be searched.
 */
export function cleanTopicParams(p:URLSearchParams):URLSearchParams|null {
 const reads=(x:URLSearchParams)=>{try{parseTopicScope(x);return true;}catch{return false;}};
 if(reads(p))return null;
 const q=p.get('q'),base=new URLSearchParams(q!=null?{q}:{});
 if(!reads(base))return null;
 const out=new URLSearchParams(base),seen=new Set<string>(['q']);
 for(const key of p.keys()){
  if(seen.has(key))continue;
  const group=key==='from'||key==='to'?['from','to']:[key];
  group.forEach(k=>seen.add(k));
  const trial=new URLSearchParams(base);for(const k of group)for(const v of p.getAll(k))trial.append(k,v);
  if(reads(trial))for(const k of group)for(const v of p.getAll(k))out.append(k,v);
 }
 return reads(out)?out:null;
}
export function topicParams(s:TopicScope):URLSearchParams {
 const p=new URLSearchParams();
 if(s.q)p.set('q',s.q);if(s.place)p.set('place',s.place);
 if(s.from){p.set('from',s.from);p.set('to',s.to);}
 if(s.type!=='all')p.set('type',s.type);if(s.match!=='words')p.set('match',s.match);
 if(s.tab!=='all')p.set('tab',s.tab);if(s.page>1)p.set('page',String(s.page));
 if(s.role)p.set('rol',s.role==='supplier'?'furnizor':'autoritate');if(s.order)p.set('ordine',s.order==='value'?'valoare':'data');if(s.names)p.set('nume','exacte');if(s.hall&&s.place.startsWith('uat:'))p.set('doar','primaria');if(s.domain&&s.q)p.set('domeniu',s.domain);return p;
}
/** The same selection without the domain kept alone: what the lists search, and a search for another subject. */
export const withoutDomain=(s:TopicScope):TopicScope=>{const {domain:_domain,...rest}=s;return rest;};
export const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
/** The documents request for a selection. Only the Documents tab pages through
 * documents; elsewhere the first hits and the count do not depend on the open
 * tab, page or entity role, so switching those reuses the documents already loaded. */
export function documentScope(s:TopicScope):TopicScope{
 return s.tab==='documents'?{...s,role:''}:{...s,tab:'all',page:1,role:''};
}
/** The hero of "Pe scurt": never "0 lei" for an empty selection (owner decision 6). */
export function answerShape(total:{value:number;count:number}|null):'none'|'empty'|'count-only'|'value'{
 if(!total)return 'none';
 if(!total.count)return 'empty';
 return total.value>0?'value':'count-only';
}
