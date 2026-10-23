import {createDb,type DbSql} from '@seap/db';
import {daUrl,awardUrl} from '../elicitatie';
import {aliasQueries} from '../ask/entity-alias';
import {entityIntent} from './entity-intent';
import {rankPlaces,type UatRow} from './places';
import {COUNTIES} from '../counties';
import {fold,PAGE_SIZE,excerpt,type TopicScope,type Place,type TopicResult,type TopicDocumentsResult,type AcquisitionHit,type DocumentHit,type EntityHit} from './shared';
export class TopicInputError extends Error {}
export function topicFailure(e:unknown,slow:string){
 if(e instanceof TopicInputError)return Response.json({error:e.message},{status:400});
 const code=(e as {code?:string}).code;console.error('Topic search failed',code??'query');
 return Response.json({error:code==='57014'?slow:'Căutarea nu este disponibilă momentan. Încearcă din nou în câteva momente.'},{status:503});
}
const globalSql=globalThis as unknown as {topicSql?:DbSql};
const db=()=>globalSql.topicSql??=createDb().sql;
export const countyPlaces:Place[]=COUNTIES.map(name=>({id:`county:${fold(name)}`,name,detail:name==='București'?'Municipiul București':'Județ',kind:'county'}));
const local=(r:Record<string,any>):Place=>({id:`uat:${r.siruta}`,name:r.name,detail:`${({1:'Municipiu',2:'Oraș',3:'Comună',4:'Municipiu',9:'Municipiu'} as Record<string,string>)[r.tip]??'Localitate'} · ${r.county}`,kind:'locality'});
// The locality catalogue (about 3,200 rows) is matched in memory: typos and missing diacritics (lib/topic-search/places).
const uatCache=globalThis as unknown as {topicUats?:{at:number;rows:Promise<UatRow[]>}};
const UAT_CACHE_MS=60*60*1000;
function uatRows():Promise<UatRow[]>{
 const hit=uatCache.topicUats;if(hit&&Date.now()-hit.at<UAT_CACHE_MS)return hit.rows;
 const rows=db()<UatRow[]>`select siruta,name,county,tip,population from reference.uat`.then(r=>[...r]);
 uatCache.topicUats={at:Date.now(),rows};rows.catch(()=>{if(uatCache.topicUats?.rows===rows)delete uatCache.topicUats;});
 return rows;
}
export async function topicPlaces(term:string):Promise<Place[]> {
 const word=fold(term.trim()).slice(0,100);
 if(word.length<2)return rankPlaces(word,countyPlaces,[]);
 return rankPlaces(word,countyPlaces,await uatRows());
}
export async function resolvePlace(id:string):Promise<Place|null>{
 if(!id)return null;if(id.startsWith('county:'))return countyPlaces.find(p=>p.id===id)??null;
 const rows=await db()`select siruta,name,county,tip from reference.uat where siruta=${Number(id.slice(4))}`;return rows[0]?local(rows[0]):null;
}
function scopeSql(q:DbSql,s:TopicScope){
 let where=q`true`;
 if(s.place.startsWith('county:'))where=q`${where} and a.county=${s.place.slice(7)}`;
 if(s.place.startsWith('uat:'))where=q`${where} and a.uat_siruta=${Number(s.place.slice(4))}`;
 if(s.from)where=q`${where} and a.year between ${Number(s.from)} and ${Number(s.to)}`;
 if(s.type!=='all')where=q`${where} and a.kind=${s.type}`;
 return where;
}
async function bounded<T>(fn:(q:DbSql)=>Promise<T>):Promise<T>{
 return await db().begin(async tx=>{const q=tx as unknown as DbSql;await q`set local statement_timeout='15000'`;return fn(q);}) as T;
}
async function acquisitions(s:TopicScope):Promise<TopicResult['acquisitions']>{return bounded(async q=>{
 const ts=s.match==='phrase'?q`phraseto_tsquery('simple',unaccent(${s.q}))`:q`plainto_tsquery('simple',unaccent(${s.q}))`;
 const where=q`${scopeSql(q,s)} and a.search @@ ${ts}`;
 const [count]=await q`select count(*)::int total from marts.topic_acquisitions a where ${where}`;
 const limit=s.tab==='all'?3:PAGE_SIZE,offset=s.tab==='all'?0:(s.page-1)*PAGE_SIZE;
 const rows=await q`with selected as (select a.* from marts.topic_acquisitions a where ${where} order by a.date desc nulls last,a.id limit ${limit} offset ${offset})
 select a.*,e.name_display authority_name,
  array(select x.name_display from core.entities x where x.id=any(a.supplier_ids) order by x.name_display) suppliers,
  case when a.kind='da' then d.da_code else c.contract_no end code,c.ca_notice_contract_id::text nid,c.ca_notice_id::text notice_id
 from selected a left join core.entities e on e.id=a.authority_id
 left join core.contracts c on a.kind='contracts' and c.id=a.ref_id
 left join core.direct_acquisitions d on a.kind='da' and d.sicap_da_id=a.ref_id
 order by a.date desc nulls last,a.id`;
 const hits:AcquisitionHit[]=rows.map(r=>{const sourceUrl=r.kind==='da'?daUrl(String(r.ref_id)):awardUrl(String(r.notice_id));
 return {id:r.id,kind:r.kind,title:r.title||'Titlu neprecizat în sursă',date:r.date,value:r.value,authorityId:r.authority_id?.toString()??null,authorityName:r.authority_name,suppliers:r.suppliers,county:r.county,code:r.code,href:r.kind==='da'?`/achizitii/${r.ref_id}`:`/contracte/${r.nid}`,sourceUrl};});
 return {total:Number(count!.total),hits};
 });}
// Only public archive tables. Map document procedures by source identity AND buyer,
// just as the contract reader does; never by a similar title or filename.
// One statement per request: the notice→procedure link is computed once per
// notice (not per file, not once per count/rows/coverage), and the text match
// uses the GIN index on app.document_page_search (migration 0079).
async function documentSearch(s:TopicScope):Promise<Omit<TopicDocumentsResult,'scope'>>{
 // A procedure-document link is always to a contract; direct acquisitions have none.
 if(s.type==='da')return {documents:{total:0,hits:[]},coverage:{known:0,ready:0,pages:0}};
 return bounded(async q=>{
 const ts=s.match==='phrase'?q`phraseto_tsquery('simple',unaccent(${s.q}))`:q`plainto_tsquery('simple',unaccent(${s.q}))`;
 const match=s.q?q`p.search @@ ${ts}`:q`false`;
 const limit=s.tab==='documents'?PAGE_SIZE:2,offset=s.tab==='documents'?(s.page-1)*PAGE_SIZE:0;
 const [r]=await q`with linked as materialized (
  select n.key,n.notice_no,n.title notice_title,n.url,l.ref_id from app.document_notices n
  join core.notices cn on cn.c_notice_id=case when n.notice_id ~ '^[1-9][0-9]{0,17}$' then n.notice_id::bigint end and cn.sys_notice_type_id=n.notice_type
  join raw.raw_documents nr on nr.id=cn.raw_id
  join lateral (select a.ref_id from marts.topic_acquisitions a where a.kind='contracts'
   and a.authority_id=cn.authority_entity_id and a.procedure_id=nr.payload->>'procedureId'
   and ${scopeSql(q,s)} order by a.ref_id limit 1) l on true
  where exists(select 1 from app.procurement_documents d where d.notice_key=n.key)
 ),sources as materialized (
  select d.id,d.filename,d.processed_at is not null and d.pdf_hash is not null ready,l.notice_no,l.notice_title,l.url,l.ref_id
  from app.procurement_documents d join linked l on l.key=d.notice_key
 ),matches as materialized (
  select s.id,p.page from sources s join app.document_page_search p on p.document_id=s.id where s.ready and ${match}
 ),selected as (
  select id,array_agg(page order by page) pages from matches group by id order by id limit ${limit} offset ${offset}
 )
 select (select count(*)::int from sources) known,(select count(*)::int from sources where ready) ready,
  (select count(*)::int from app.document_pages p join sources s on s.id=p.document_id where s.ready) pages,
  (select count(distinct id)::int from matches) total,
  coalesce((select json_agg(h order by h.id) from (
   select x.id,src.filename,x.pages[1] page,x.pages,p.text,p.method,src.notice_no,src.notice_title,src.url,c.ca_notice_contract_id::text contract_id
   from selected x join sources src on src.id=x.id join app.document_pages p on p.document_id=x.id and p.page=x.pages[1]
   join core.contracts c on c.id=src.ref_id) h),'[]'::json) hits`;
 const hits:DocumentHit[]=(r!.hits as Record<string,any>[]).map(h=>({id:h.id,filename:h.filename,page:h.page,pages:h.pages,text:excerpt(h.text,s.q),method:h.method,noticeNo:h.notice_no,noticeTitle:h.notice_title,sourceUrl:h.url,contractId:h.contract_id}));
 return {documents:{total:Number(r!.total),hits},coverage:{known:Number(r!.known),ready:Number(r!.ready),pages:Number(r!.pages)}};
 });
}
async function entities(s:TopicScope):Promise<TopicResult['entities']>{return bounded(async q=>{
 // Existing trigram index on canonical normalized names; all query terms required.
 const terms=fold(s.q).split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0,30);
 if(!terms.length)return {total:0,hits:[],suggestions:[]};
 const intent=entityIntent(s.q);
 let name=q`false`;
 for(const phrase of aliasQueries(fold(s.q))){
  const words=phrase.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  let variant=q`true`;
  if(s.match==='phrase')variant=q`(e.name_normalized like ${'%'+words.join(' ')+'%'} or e.cui_canonical like ${'%'+words.join(' ')+'%'})`;
  else for(const term of words)variant=q`${variant} and (e.name_normalized like ${'%'+term+'%'} or e.cui_canonical like ${'%'+term+'%'})`;
  name=q`${name} or (${variant})`;
 }name=q`(${name})`;
 if(intent.cui)name=q`(${name} or e.cui_canonical=${intent.cui})`;
 // Rank identity relevance before spending. A large unrelated institution must
 // not outrank an exact name/CUI just because it has more procurement.
 let authorityName=q`false`;
 for(const candidate of intent.authorityNames)authorityName=q`${authorityName} or e.name_normalized=${candidate} or e.name_normalized like ${candidate+' %'}`;
 const rank=q`case when e.cui_canonical=${intent.cui} then 100
   when e.name_normalized=${intent.name} then 90
   when ep.role='authority' and (${authorityName}) then 80 else 0 end`;
 let activity=q`true`;
 if(s.place||s.from||s.type!=='all')activity=q`exists(select 1 from marts.topic_acquisitions a where ${scopeSql(q,s)} and
 ((ep.role='authority' and a.authority_id=e.id) or (ep.role='supplier' and a.supplier_ids @> array[e.id])))`;
 const where=q`${name} and ${activity} and (${s.role}='' or ep.role=${s.role})`;
 const [count]=await q`select count(distinct e.id)::int total from core.entities e join marts.entity_profile ep on ep.entity_id=e.id where ${where}`;
 const limit=s.tab==='all'?3:PAGE_SIZE,offset=s.tab==='all'?0:(s.page-1)*PAGE_SIZE;
 const rows=await q`select e.id::text id,e.name_display name,e.cui_canonical cui,e.county,array_agg(distinct ep.role) roles,max(${rank}) match_rank from core.entities e join marts.entity_profile ep on ep.entity_id=e.id
 where ${where} group by e.id order by max(${rank}) desc,max(ep.total_ron_full) desc nulls last,e.id limit ${limit} offset ${offset}`;
 const hits=rows.map(({match_rank,...entity})=>entity) as unknown as EntityHit[];
 return {total:Number(count!.total),hits,suggestions:s.tab==='all'?hits.filter((_,i)=>Number(rows[i]!.match_rank)>0):[]};
 });}
async function checkedPlace(s:TopicScope){
 const place=await resolvePlace(s.place);if(s.place&&!place)throw new TopicInputError('Localitatea sau județul ales nu există în catalog. Alege din sugestii.');return place;
}
/** Titles, institutions and firms. Fast: never waits for document text. */
export async function searchTopics(s:TopicScope):Promise<TopicResult>{
 const place=await checkedPlace(s);
 const [state]=await db()`select built_at,records,titled_records from marts.topic_search_state where id=1`;
 if(!state)throw Error('Indexul de achiziții este în curs de pregătire. Încearcă din nou după finalizarea indexării.');
 const empty={total:0,hits:[]};
 const [a,e]=await Promise.all([s.q?acquisitions(s):empty,s.q?entities(s):empty]);
 return {scope:s,place,acquisitions:a,entities:e,builtAt:new Date(state.built_at).toISOString(),titleCoverage:{total:Number(state.records),searchable:Number(state.titled_records)}};
}
/** Prepared document pages linked to the selection; requested separately by the page. */
export async function searchTopicDocuments(s:TopicScope):Promise<TopicDocumentsResult>{
 await checkedPlace(s);
 return {scope:s,...await documentSearch(s)};
}
