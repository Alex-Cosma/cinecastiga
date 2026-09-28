export type SearchTab='all'|'acquisitions'|'documents'|'entities';
export type TopicScope={q:string;place:string;from:string;to:string;type:'all'|'da'|'contracts';match:'words'|'phrase';tab:SearchTab;page:number;role:''|'authority'|'supplier'};
export type Place={id:string;name:string;detail:string;kind:'county'|'locality'};
export type AcquisitionHit={id:string;kind:'da'|'contracts';title:string;date:string|null;value:string|null;authorityId:string|null;authorityName:string|null;suppliers:string[];county:string|null;code:string|null;href:string;sourceUrl:string};
export type DocumentHit={id:string;filename:string;page:number;pages:number[];text:string;method:string;noticeNo:string;noticeTitle:string;sourceUrl:string;contractId:string|null};
export type EntityHit={id:string;name:string;cui:string|null;roles:string[];county:string|null};
export type TopicResult={scope:TopicScope;place:Place|null;acquisitions:{total:number;hits:AcquisitionHit[]};documents:{total:number;hits:DocumentHit[]};entities:{total:number;hits:EntityHit[]};coverage:{known:number;ready:number;pages:number};builtAt:string|null;titleCoverage:{total:number;searchable:number}};
export const PAGE_SIZE=10;
export function parseTopicScope(p:URLSearchParams):TopicScope {
 const q=(p.get('q')??'').trim().replace(/\s+/g,' ');
 if(q.length>150)throw Error('Căutarea poate avea cel mult 150 de caractere.');
 if(q&&q.length<2)throw Error('Scrie cel puțin două caractere.');
 const from=p.get('from')??'',to=p.get('to')??'';
 const year=(v:string)=>/^\d{4}$/.test(v)&&Number(v)>=1900&&Number(v)<=new Date().getFullYear()+1;
 if((from||to)&&(!year(from)||!year(to)||from>to))throw Error('Alege un interval valid: anul de început nu poate depăși anul de sfârșit.');
 const place=p.get('place')??'';
 if(place&&!/^(county:[a-z -]{2,40}|uat:\d{1,7})$/.test(place))throw Error('Alege o localitate sau un județ din sugestii.');
 const type=p.get('type')??'all',match=p.get('match')??'words',tab=p.get('tab')??'all';
 if(!['all','da','contracts'].includes(type)||!['words','phrase'].includes(match)||!['all','acquisitions','documents','entities'].includes(tab))throw Error('Filtre de căutare invalide.');
 const rawPage=p.get('page')??'1';
 if(!/^\d{1,4}$/.test(rawPage)||Number(rawPage)<1||Number(rawPage)>1000)throw Error('Pagina nu este validă. Restrânge căutarea pentru rezultate mai precise.');
 const role=p.get('rol')==='furnizor'?'supplier':p.get('rol')==='autoritate'?'authority':'';
 return {q,place,from,to,type:type as TopicScope['type'],match:match as TopicScope['match'],tab:role?'entities':tab as SearchTab,page:Number(rawPage),role};
}
export function topicParams(s:TopicScope):URLSearchParams {
 const p=new URLSearchParams();
 if(s.q)p.set('q',s.q);if(s.place)p.set('place',s.place);
 if(s.from){p.set('from',s.from);p.set('to',s.to);}
 if(s.type!=='all')p.set('type',s.type);if(s.match!=='words')p.set('match',s.match);
 if(s.tab!=='all')p.set('tab',s.tab);if(s.page>1)p.set('page',String(s.page));
 if(s.role)p.set('rol',s.role==='supplier'?'furnizor':'autoritate');return p;
}
export const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function excerpt(text:string,q:string){const needle=fold(q).split(/\s+/)[0]??'',pos=fold(text).indexOf(needle),start=Math.max(0,pos-100);return `${start?'…':''}${text.slice(start,start+380)}${text.length>start+380?'…':''}`;}
