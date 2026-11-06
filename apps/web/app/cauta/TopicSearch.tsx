'use client';
import {Fragment,useEffect,useId,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import DiscoveryIcon from '../DiscoveryIcon';
import Term from '@/components/Term';
import EntityName from '@/components/EntityName';
import {formatExactDecimal,formatInt,cleanName} from '@/lib/format';
import {parseTopicScope,topicParams,documentScope,fold,PAGE_SIZE,type TopicScope,type TopicResult,type TopicDocumentsResult,type DocumentHit,type Place,type SearchTab,type EntityHit} from '@/lib/topic-search/shared';
import type {TopicInterpretation} from '@/lib/topic-search/interpretation';
import {Broader,SubjectAnswer,Understood,prefetchAnswer,searchHref,type AnswerCount} from './Understood';
import {G,Ghost,rankWidth} from '@/components/ghost/Ghost';
import {FloatStatus} from '@/components/ghost/client';
import {silentChoice} from '@/lib/topic-search/places';
import {roCount} from '@/lib/ro-count';

const defaults:TopicScope={q:'',place:'',from:'',to:'',type:'all',match:'words',tab:'all',page:1,role:''};
const TABS:{id:SearchTab;label:string}[]=[{id:'all',label:'Toate'},{id:'entities',label:'Instituții și firme'},{id:'acquisitions',label:'Achiziții'},{id:'documents',label:'Documente'}];
/** The closest name match, first among the institutions and firms: its profile and all its acquisitions. */
function BestMatch({entity:e,unfiltered}:{entity:EntityHit;unfiltered:boolean}){
 const role=e.roles.includes('authority')?'autoritate':'furnizor',profile=`/entitati/${e.id}${e.roles.length>1?`?rol=${role}`:''}`; // the role only for an entity that both buys and sells
 return <div className="topic-best">
 <div><h3><Link prefetch={false} href={profile}>{cleanName(e.name)}</Link></h3><p>{[e.roles.includes('authority')?'Instituție':'Furnizor',e.county,e.cui?`CUI ${e.cui}`:'CUI neprecizat'].filter(Boolean).join(' · ')}{unfiltered&&' · profil complet, fără filtre'}</p></div>
 <div className="topic-best-actions"><Link prefetch={false} className="topic-control" href={profile}>{e.roles.includes('authority')?'Vezi instituția':'Vezi firma'}</Link><Link prefetch={false} className="topic-primary" href={`${profile}#achizitii`}>Toate achizițiile <DiscoveryIcon name="arrow"/></Link></div>
 </div>;
}
function Highlight({text,query}:{text:string;query:string}){
 const words=fold(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean),normal=fold(text),ranges:[number,number][]=[];
 for(const word of words){let at=normal.indexOf(word);while(at>=0){ranges.push([at,at+word.length]);at=normal.indexOf(word,at+word.length);}}
 ranges.sort((a,b)=>a[0]-b[0]);const merged:[number,number][]=[];for(const r of ranges){const last=merged.at(-1);if(last&&r[0]<=last[1])last[1]=Math.max(last[1],r[1]);else merged.push([...r]);}
 let cursor=0;const parts:React.ReactNode[]=[];for(const [a,b] of merged){parts.push(text.slice(cursor,a),<mark key={a}>{text.slice(a,b)}</mark>);cursor=b;}parts.push(text.slice(cursor));return <>{parts}</>;
}
function PlacePicker({value,selected,onChange}:{value:string;selected:Place|null;onChange:(place:Place|null)=>void}){
 const id=useId(),box=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const [term,setTerm]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[items,setItems]=useState<Place[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 // The text the shown suggestions answer; Enter waits for the ones of the current text.
 const [itemsFor,setItemsFor]=useState<string|null>(null);
 useEffect(()=>{setTerm(selected?.name??'');},[selected?.name,value]);
 // Enter pressed before the suggestions arrived: choose the first one when they do.
 const pendingEnter=useRef(false);
 const edited=(text:string)=>Boolean(text.trim())&&text!==(selected?.name??'');
 useEffect(()=>{if(!open)return;const abort=new AbortController();setLoading(true);setError('');setActive(-1);
 const timer=setTimeout(()=>{void fetch(`/api/topic-search/places?q=${encodeURIComponent(term)}`,{signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(abort.signal.aborted)return;
  const places:Place[]=d.places;setItems(places);setItemsFor(term);
  // After the user edits the text, the best match is highlighted so Enter chooses it.
  // The name already applied is not typed text: names repeat across counties, so
  // only the applied place itself is highlighted then.
  const typed=edited(term)&&places.length>0;
  setActive(typed?1:places.findIndex(p=>p.id===value)+1||-1);
  if(pendingEnter.current){pendingEnter.current=false;
   // Enter before the list was visible: choose only a clear match. Two places with the
   // same name, or a guess at a typo ("oradia"), stay in the list for the person to pick.
   const clear=silentChoice(places);
   if(typed&&clear)choose(clear);}
 }).catch(e=>{if(!abort.signal.aborted){setItems([]);setError(e.message);pendingEnter.current=false;}}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});},160);
 return()=>{abort.abort();clearTimeout(timer);};
 },[term,open]);
 const dismiss=()=>{pendingEnter.current=false;setOpen(false);setTerm(selected?.name??'');};
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(!box.current?.contains(e.target as Node)){setOpen(false);setTerm(selected?.name??'');}};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[selected]);
 useEffect(()=>{if(open&&active>=0)document.getElementById(`${id}-${active}`)?.scrollIntoView({block:'nearest'});},[open,active,id]);
 // Choosing the place already applied only closes the list; it does not search again.
 const choose=(p:Place|null)=>{if((p?.id??'')!==value)onChange(p);setTerm(p?.name??'');setOpen(false);input.current?.focus();};
 return <div className="topic-place" ref={box} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))dismiss();}}>
  <label htmlFor={id}>Unde cauți?</label><div className="topic-place-input"><DiscoveryIcon name="pin"/><input ref={input} id={id} value={term} placeholder="Toată țara" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open&&active>=0?`${id}-${active}`:undefined} onFocus={()=>setOpen(true)} onChange={e=>{setTerm(e.target.value);setOpen(true);}} onKeyDown={e=>{
   if(e.key==='Escape'){e.preventDefault();dismiss();}else if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();setOpen(true);setActive(a=>e.key==='ArrowDown'?Math.min(a+1,loading?0:items.length):Math.max(0,a-1));}else if(e.key==='Enter'&&open){e.preventDefault();if(active===0)choose(null);else if(loading||itemsFor!==term){if(edited(term))pendingEnter.current=true;}else if(active>0&&items[active-1])choose(items[active-1]!);}
  }}/>{value&&<button type="button" aria-label="Șterge filtrul de localitate" onClick={()=>choose(null)}><DiscoveryIcon name="close"/></button>}</div>
  {open&&<div className="topic-options"><p className="topic-help" role="status">{loading?'Se caută localități…':error||(items[0]?.match==='fuzzy'&&itemsFor===term?`Nu am găsit exact „${term.trim()}”. Poate cauți:`:'Alege un județ, oraș sau o comună.')}</p><ul id={`${id}-options`} role="listbox" aria-label="Județe și localități" aria-busy={loading}>
   <li role="option" id={`${id}-0`} aria-selected={active===0} onPointerDown={e=>e.preventDefault()}><button type="button" tabIndex={-1} onClick={()=>choose(null)}>Toată țara</button></li>
   {!loading&&items.map((p,i)=><li role="option" id={`${id}-${i+1}`} key={p.id} aria-selected={active===i+1} onPointerDown={e=>e.preventDefault()}><button type="button" tabIndex={-1} onClick={()=>choose(p)}><strong>{p.name}</strong><small>{p.detail}</small></button></li>)}
  </ul>{!loading&&!items.length&&!error&&<p className="topic-help">Nicio localitate găsită. Încearcă alt nume.</p>}</div>}
 </div>;
}
function PeriodPicker({scope,onChange}:{scope:TopicScope;onChange:(patch:Partial<TopicScope>)=>void}){
 const [open,setOpen]=useState(false),[from,setFrom]=useState(scope.from),[to,setTo]=useState(scope.to),[error,setError]=useState('');const box=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),id=useId();
 useEffect(()=>{setFrom(scope.from);setTo(scope.to);setError('');},[scope.from,scope.to,open]);
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
 const apply=()=>{try{parseTopicScope(new URLSearchParams({from,to}));if(!from||!to)throw Error('Completează ambii ani sau alege „Toți anii”.');onChange({from,to});setOpen(false);button.current?.focus();}catch(e){setError((e as Error).message);}};
 return <div className="topic-period" ref={box} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);button.current?.focus();}}}><label htmlFor={id}>Perioada</label><button ref={button} id={id} type="button" aria-label={`Perioada: ${scope.from?scope.from===scope.to?scope.from:`${scope.from}–${scope.to}`:'Toți anii'}`} className="topic-control" aria-expanded={open} aria-controls={`${id}-panel`} onClick={()=>setOpen(!open)}>{scope.from?scope.from===scope.to?scope.from:`${scope.from}–${scope.to}`:'Toți anii'}<DiscoveryIcon name="calendar"/></button>
 {open&&<div className="topic-period-panel" id={`${id}-panel`}><h3>Alege intervalul</h3><div className="topic-year-pair"><label>Din anul<input type="number" min={1900} max={new Date().getFullYear()+1} value={from} onChange={e=>setFrom(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();apply();}}}/></label><label>Până în anul<input type="number" min={1900} max={new Date().getFullYear()+1} value={to} onChange={e=>setTo(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();apply();}}}/></label></div>{error&&<p role="alert" className="topic-error">{error}</p>}<button type="button" className="topic-primary" onClick={apply}>Aplică intervalul</button><button type="button" className="topic-text-button" onClick={()=>{onChange({from:'',to:''});setOpen(false);button.current?.focus();}}>Toți anii</button></div>}
 </div>;
}
type Loaded<T>={key:string;result:T};
type Failure={key:string;message:string};
/** What an answer was read for: the address, its scope, the scope after the words were read, the reading. */
type View={url:string;scope:TopicScope;effective:TopicScope;t:TopicInterpretation|null;literal:boolean};
type Main=Loaded<TopicResult>&{view:View};
const TAB_PANELS:{id:Exclude<SearchTab,'all'>;icon:'building'|'list'|'document';title:string}[]=[{id:'entities',icon:'building',title:'Instituții și firme'},{id:'acquisitions',icon:'list',title:'Achiziții'},{id:'documents',icon:'document',title:'Documente'}];
const panelSub=(id:SearchTab,q:string):React.ReactNode=>id==='entities'?'după nume și CUI':id==='acquisitions'?<>cu „{q}” în titlu</>:'în textul extras din PDF-uri';
/*
 * Ghosts of the result panels (owner, 6 November 2026: "ghost data loading"): the panels' own heads and rows, in the
 * number the answer will have (3 of each on "Toate", a page of 10 on a tab, fewer when the count is known), so the
 * page keeps its height when the results arrive. Shown after 120 ms; nothing in them takes focus.
 */
function EntityRowGhost({i}:{i:number}){return <div className="topic-entity-row" aria-hidden="true"><span className="topic-g-fill"><strong><G.Line w={rankWidth(i,74,9,46)}/><G.Line w="40%" only="phone"/></strong><small><G.Line w="52%"/></small></span><DiscoveryIcon name="arrow"/></div>;}
function AcquisitionGhost({i}:{i:number}){
 // Long titles wrap: every other row has a second line (a third on phones), as the loaded lists average.
 return <article className="topic-record topic-acquisition" aria-hidden="true"><div className="topic-record-main"><div className="topic-record-meta"><G.Line inline w="9em"/><G.Line inline w="8em"/><G.Line inline w="4em"/></div>
  <h3><G.Line w="86%"/>{i%2===1&&<G.Line w="44%" only="not-phone"/>}<G.Line w="58%" only="phone"/>{i%2===1&&<G.Line w="36%" only="phone"/>}</h3><div className="topic-parties"><G.Line w="62%"/><G.Line w="44%" only="phone"/></div></div>
  <div className="topic-record-side"><strong><G.Line w="6.5em"/></strong><small>valoare înregistrată · nu plăți</small><a>Verifică în SEAP <DiscoveryIcon name="arrow"/></a></div></article>;
}
function DocumentGhost(){
 return <article className="topic-record topic-document" aria-hidden="true"><div className="topic-record-main"><div className="topic-record-meta"><DiscoveryIcon name="bookOpen"/><G.Line inline w="12em"/><G.Line inline w="6em"/></div>
  <h3><G.Line w="54%"/></h3><p className="topic-help"><G.Line w="82%"/><G.Line w="50%" only="phone"/></p><blockquote><G.Lines w={['96%','90%','94%','84%','92%','70%','88%','58%']} phone={['90%','76%','94%','82%','68%','88%','52%']}/></blockquote></div>
  <div className="topic-record-side"><small>Pagini găsite</small><div className="topic-document-pages"><G.Block w="36px" h="36px" r="6px"/><G.Block w="36px" h="36px" r="6px"/></div><a><G.Line w="12em"/></a><a><G.Line w="7em"/></a></div></article>;
}
/** The documents' own wait: they come from a separate request, after the titles. */
const DocumentsGhost=({rows}:{rows:number})=><Ghost className="topic-docs-ghost" name="topic-documents" wait="client"><DocumentsGhostBody rows={rows}/></Ghost>;
function PanelHeadGhost({id,icon,title,q,n}:{id:SearchTab;icon:'building'|'list'|'document';title:string;q:string;n:number|null}){
 return <div className="topic-panel-head"><DiscoveryIcon name={icon}/><h2>{title}</h2><span className="topic-panel-count">{n!=null?formatInt(n):<G.Line inline w="2.2em"/>}</span><span className="topic-panel-sub">{panelSub(id,q)}</span></div>;
}
/** The line that reconciles „Pe scurt” with the title matches: its words, then its link. */
const UnitsGhost=()=><p className="topic-units" aria-hidden="true"><span className="topic-g-fill"><G.Line w="92%"/><G.Line w="64%" only="phone"/></span><span className="topic-g-link"><G.Line w="13em"/></span></p>;
const FootGhost=()=><div className="topic-panel-foot" aria-hidden="true"><span className="topic-text-button"><G.Line w="14em"/></span></div>;
function PanelsGhost({tab,page,q,counts,units}:{tab:SearchTab;page:number;q:string;counts:(id:SearchTab)=>number|null;units:boolean}){
 // On a tab, a page of 10 (fewer on the last page, when the count is known); on "Toate", the 3 first of each.
 const rows=(id:SearchTab)=>{const n=counts(id);return tab==='all'?Math.min(3,n??3):Math.max(1,Math.min(PAGE_SIZE,n==null?PAGE_SIZE:n-(page-1)*PAGE_SIZE));};
 const shown=TAB_PANELS.filter(p=>tab==='all'||tab===p.id);
 return <Ghost className="topic-panels" name="topic-panels" wait="client">
  {shown.map(p=><section className="topic-panel" key={p.id}><PanelHeadGhost id={p.id} icon={p.icon} title={p.title} q={q} n={counts(p.id)}/>
   {p.id==='entities'?<>{tab==='entities'&&<p className="topic-role" aria-hidden="true">Arată<G.Block w="11em" h="44px" r="7px" className="g-quiet"/></p>}<div className="topic-entities">{Array.from({length:rows('entities')},(_,i)=><EntityRowGhost key={i} i={i}/>)}</div></>
    :p.id==='acquisitions'?<>{units&&<UnitsGhost/>}{Array.from({length:rows('acquisitions')},(_,i)=><AcquisitionGhost key={i} i={i}/>)}</>
    :<DocumentsGhostBody rows={tab==='all'?2:rows('documents')}/>}
   {tab==='all'&&<FootGhost/>}
  </section>)}
 </Ghost>;
}
function DocumentsGhostBody({rows}:{rows:number}){
 return <><div className="topic-coverage" aria-hidden="true"><G.Block w="120px" h="6px" r="3px" className="topic-g-progress"/><span><G.Line w="88%"/><G.Line w="72%" only="phone"/><G.Line w="40%" only="phone"/></span></div>{Array.from({length:rows},(_,i)=><DocumentGhost key={i}/>)}</>;
}
// Titles, institutions and firms answer in about a second; prepared documents
// come from a separate request and never hold back the rest of the page.
export default function TopicSearch(){
 const router=useRouter(),params=useSearchParams(),url=params.toString();
 const parsed=useMemo(()=>{try{return {scope:parseTopicScope(new URLSearchParams(url)),error:''};}catch(e){return {scope:defaults,error:(e as Error).message};}},[url]);
 const scope=parsed.scope,literal=new URLSearchParams(url).get('literal')==='1';
 // The words are read by the rules interpreter first: "iluminat buzau" searches "iluminat" in Buzău.
 const interpKey=!parsed.error&&scope.q&&!literal?new URLSearchParams({q:scope.q,...(scope.place?{place:scope.place}:{}),...(scope.from?{from:scope.from,to:scope.to}:{})}).toString():'';
 const [interp,setInterp]=useState<{key:string;data:TopicInterpretation|null}|null>(null);
 useEffect(()=>{if(!interpKey)return;let slow=false;const abort=new AbortController(),timer=setTimeout(()=>{slow=true;abort.abort();},3500);
  // A failed or slow interpretation never blocks the search: the words are then searched as written.
  void fetch(`/api/topic-search/interpretation?${interpKey}`,{signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);return d.interpretation as TopicInterpretation|null;})
   .then(data=>setInterp({key:interpKey,data}),()=>{if(!abort.signal.aborted||slow)setInterp({key:interpKey,data:null});})
   .finally(()=>clearTimeout(timer));
  return()=>{clearTimeout(timer);abort.abort();};
 },[interpKey]);
 const interpReady=!interpKey||interp?.key===interpKey,t=interpKey&&interp?.key===interpKey?interp.data:null;
 const effective=useMemo<TopicScope>(()=>t?{...scope,...t.applied}:scope,[scope,t]);
 const mainKey=interpReady?topicParams(effective).toString():'',docsKey=interpReady&&!parsed.error&&effective.q?topicParams(documentScope(effective)).toString():'';
 const [query,setQuery]=useState(''),[place,setPlace]=useState<Place|null>(null),[copied,setCopied]=useState('');
 // The last answer read stays (with the reading it answered) until the next one arrives: a new search, a filter or
 // a page dims it in place instead of emptying the page (owner, 6 November 2026).
 const [main,setMain]=useState<Main|null>(null),[mainError,setMainError]=useState<Failure|null>(null),[retry,setRetry]=useState(0),[refetching,setRefetching]=useState(false);
 const [docs,setDocs]=useState<Loaded<TopicDocumentsResult>[]>([]),[docsError,setDocsError]=useState<Failure|null>(null),[docsRetry,setDocsRetry]=useState(0);
 const [filtersExpanded,setFiltersExpanded]=useState(false);
 const previous=useRef<TopicResult|null>(null);
 useEffect(()=>{setQuery(parsed.scope.q);setCopied('');},[parsed]);
 // The start page and an invalid address show no answer: the next search starts from a ghost, not an old answer.
 useEffect(()=>{if(!parsed.scope.q||parsed.error)setMain(null);},[parsed]);
 const view:View={url,scope,effective,t,literal};
 useEffect(()=>{if(parsed.error||!mainKey)return;const abort=new AbortController(),read=view;
  void fetch(`/api/topic-search?${mainKey}`,{signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(!abort.signal.aborted){setMain({key:mainKey,result:d,view:read});previous.current=d;setPlace(d.place);setRefetching(false);}})
   .catch(e=>{if(!abort.signal.aborted){setMainError({key:mainKey,message:e.message});setMain(null);setRefetching(false);}});
  return()=>abort.abort();
 // eslint-disable-next-line react-hooks/exhaustive-deps -- the view is the one this key was read from
 },[mainKey,retry,parsed.error]);
 useEffect(()=>{if(!docsKey)return;const abort=new AbortController();
  void fetch(`/api/topic-search/documents?${docsKey}`,{signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(!abort.signal.aborted)setDocs(list=>[{key:docsKey,result:d},...list.filter(x=>x.key!==docsKey)].slice(0,4));}).catch(e=>{if(!abort.signal.aborted)setDocsError({key:docsKey,message:e.message});});
  return()=>abort.abort();
 },[docsKey,docsRetry]);
 // "Pe scurt" starts as soon as the words are read, alongside the titles.
 useEffect(()=>{if(t?.answer&&scope.tab==='all')void prefetchAnswer(t.answer);},[t,scope.tab]);
 // Only what answers the current URL is shown as the answer; the previous one, dimmed, while it loads.
 const result=main?.key===mainKey&&!parsed.error?main.result:null;
 const error=parsed.error||(mainError?.key===mainKey?mainError.message:'');
 const loading=!result&&!error;
 const docsFor=(key:string)=>{const result=docs.find(d=>d.key===key)?.result??null,failure=docsError?.key===key&&!result?docsError.message:'';return {result,failure,loading:Boolean(key)&&!result&&!failure};};
 const currentDocs=docsFor(docsKey);
 // A new search, a filter or a page keeps the shape: the old answer stays, dimmed. A tab draws another layout, and
 // nothing shown yet (first search, after an error) has nothing to dim: those get the ghost.
 const stale=loading&&scope.q&&main&&main.view.scope.tab===scope.tab?main:null;
 const pending=Boolean(scope.q)&&!error&&(loading||refetching);
 const update=(patch:Partial<TopicScope>)=>{const next={...scope,...patch,page:patch.page??1},params=topicParams(next);if(literal&&patch.q===undefined)params.set('literal','1');const target=params.toString();
  setMainError(null);
  if(target===url){setRefetching(true);setRetry(n=>n+1);setDocsError(null);setDocsRetry(n=>n+1);}else router.push(`/cauta?${target}`,{scroll:false});};
 // Editing a filter keeps what was taken from the words, as explicit filters.
 const refine=(patch:Partial<TopicScope>)=>update({...(t&&(t.fromWords.place||t.fromWords.period)?{q:t.applied.q,place:effective.place,from:effective.from,to:effective.to}:{}),...patch});
 const retryDocs=()=>{setDocsError(null);setDocsRetry(n=>n+1);};
 const tab=(id:SearchTab)=>update({tab:id,role:''});
 const placeName=effective.place?(place?.id===effective.place?place.name:''):'';
 const where=effective.place?placeName||'locul ales':'toată țara';
 const period=effective.from?effective.from===effective.to?effective.from:`${effective.from}–${effective.to}`:'toți anii';
 // What "Pe scurt" counted, to name the units next to the title matches.
 const [answerCount,setAnswerCount]=useState<AnswerCount>(null);
 // A question's words searched as written: when nothing matches, one quiet line instead of empty sections.
 const [literalOpen,setLiteralOpen]=useState('');
 const filterSummary=[placeName,effective.from?`${effective.from}–${effective.to}`:'',scope.type==='da'?'Achiziții directe':scope.type==='contracts'?'Contracte':'',scope.match==='phrase'?'Expresia în ordine':''].filter(Boolean).join(' · ');
 const copy=async()=>{try{await navigator.clipboard.writeText(new URL(`/cauta?${topicParams(scope)}${literal?'&literal=1':''}`,window.location.origin).href);setCopied('Link copiat');}catch{setCopied('Nu am putut copia linkul. Copiază adresa din browser.');}};
 /*
  * The answer area for a view: the status line, „Am înțeles”, „Pe scurt” and the result panels. `result` null draws
  * the panels' ghost under the real reading; `dim` is the previous answer while the next one loads; `reading` is the
  * first moment of a search, before its words are read, when the shape above the results is not known yet.
  */
 const answer=(v:View,result:TopicResult|null,{dim=false,reading=false}:{dim?:boolean;reading?:boolean}={})=>{
  const {scope,effective,t}=v,d=docsFor(v.effective.q?topicParams(documentScope(v.effective)).toString():'');
  const docsResult=d.result,docsFailure=d.failure,docsLoading=d.loading;
  const vPlace=result?.place??(place?.id===effective.place?place:null);
  const placeName=effective.place?(vPlace?.id===effective.place?vPlace.name:''):'';
  const where=effective.place?placeName||'locul ales':'toată țara';
  const period=effective.from?effective.from===effective.to?effective.from:`${effective.from}–${effective.to}`:'toți anii';
  // A recognised subject or a whole question leads with its answer, above the results.
  const question=t?.question??null;
  const answerKey=t?.answer?JSON.stringify([t.answer.total.spec,t.answer.top.spec]):'';
  // undefined while „Pe scurt” is still counting; null when it has no total.
  const counted=answerCount&&answerCount.key===answerKey?answerCount.count:undefined;
  const literalEmpty=Boolean(question&&result&&!result.entities.total&&!result.acquisitions.total&&!(docsResult?.documents.total));
  // A question's results are usually empty: their ghost is the one quiet line they collapse to.
  const collapsed=(literalEmpty||Boolean(question&&!result))&&scope.tab==='all'&&literalOpen!==v.url;
  // Counts stay visible while only the tab or page changes; a new selection starts empty.
  const selection=(s:TopicScope)=>topicParams({...s,tab:'all',page:1}).toString();
  const counts=result??(previous.current&&selection(previous.current.scope)===selection(effective)?previous.current:null);
  // The closest name match leads the institutions and firms, which come first (owner, 3 November 2026).
  const best=result&&scope.page===1?result.entities.suggestions?.[0]??null:null;
  const otherEntities=result?result.entities.hits.filter(e=>e.id!==best?.id):[];
  const count=(id:SearchTab):number|null=>id==='all'?null:id==='documents'?docsResult?.documents.total??null:counts?.[id]?.total??null;
  const isShown=(id:SearchTab)=>scope.tab==='all'||scope.tab===id;
  const total=scope.tab==='all'?null:count(scope.tab);
  // Each kind of result is its own panel: a head with its count, and a closing link to all of them.
  const panelHead=(icon:'building'|'list'|'document',id:SearchTab,title:string,n:number|null,sub:React.ReactNode,tip?:React.ReactNode)=><div className="topic-panel-head"><DiscoveryIcon name={icon}/><h2 id={`topic-panel-${id}`}>{title}{tip&&<> {tip}</>}</h2>{n!=null&&<span className="topic-panel-count">{formatInt(n)}</span>}<span className="topic-panel-sub">{sub}</span></div>;
  const panelFoot=(id:SearchTab,n:number,shown:number,what:string)=>scope.tab==='all'&&n>shown?<div className="topic-panel-foot"><button type="button" className="topic-text-button" onClick={()=>tab(id)}>Vezi toate cele {what} <DiscoveryIcon name="arrow"/></button></div>:null;
  // The words, the place and the period are already in the chips of „Am înțeles”: the line stays for screen readers only.
  const quietStatus=reading||Boolean(question||t?.answer||t?.subject);
  const documentHref=(d:DocumentHit,page:number)=>`/contracte/${d.contractId}?document=${d.id}&page=${page}&highlight=${encodeURIComponent(effective.q)}#fisiere`;
  // "Pe scurt" counts by domain, the list by title: the line that reconciles them waits in place for both.
  const units=Boolean(t?.answer&&!question&&scope.tab==='all');
  return <div className={`topic-answer-area${dim?' g-stale':''}${reading?' is-reading':''}`} aria-busy={dim||undefined}>
  <div className={`topic-status${quietStatus?' is-quiet':''}`} role="status" aria-live="polite">{question?<>Întrebarea ta: <strong>„{scope.q}”</strong></>:<>Rezultate pentru <strong>„{effective.q}”</strong> · {where} · {period}</>}</div>
  {v.literal&&<p className="topic-help topic-literal">Cauți exact cuvintele scrise, fără interpretare. <Link prefetch={false} href={searchHref(scope,{})}>Interpretează căutarea</Link></p>}
  {t&&<Understood scope={scope} effective={effective} t={t} place={vPlace}/>}
  {/* The short answer comes from Ask and does not wait for the titles. */}
  {t?.answer&&scope.tab==='all'&&<SubjectAnswer answer={t.answer} asked={question?.sentence} notes={t.subject?.notes??[]} literalHref={question?searchHref(scope,{},true):undefined} titles={!question&&result?{count:result.acquisitions.total,q:effective.q,onShow:()=>tab('acquisitions')}:undefined} onCount={setAnswerCount}/>}
  <div className={`topic-results${collapsed?' is-collapsed':''}`} style={{minHeight:collapsed||question?0:400}}>
  {collapsed?(result?<p className="topic-literal-quiet">Pentru cuvintele exacte „{scope.q}” nu am găsit titluri sau nume. <button type="button" className="topic-text-button" onClick={()=>setLiteralOpen(v.url)}>Arată</button></p>
   :<Ghost as="p" className="topic-literal-quiet" name="topic-literal" wait="client"><G.Line w="62%"/><G.Line w="30%" only="phone"/></Ghost>)
  :<>{question&&<h2 className="topic-literal-head">Cuvintele exacte „{scope.q}”, căutate ca atare</h2>}<div className="topic-tabbar"><nav className="topic-tabs" aria-label="Tipuri de rezultate">{TABS.map(t=>{const n=count(t.id),waiting=t.id==='documents'?docsLoading:!result&&n==null;return <button type="button" key={t.id} aria-current={scope.tab===t.id?'page':undefined} disabled={!result} onClick={()=>tab(t.id)}>{t.label}{n!=null?<span>{formatInt(n)}</span>:waiting&&t.id!=='all'?<span className="topic-count-wait"><span aria-hidden="true">…</span><span className="d-sr-only">se numără</span></span>:null}</button>;})}</nav><div className="topic-copy"><button type="button" className="topic-control" onClick={()=>void copy()}><DiscoveryIcon name="link"/>Copiază căutarea</button>{copied&&<p role="status">{copied}</p>}</div></div>
  {!result?<PanelsGhost key={reading?'reading':'read'} tab={scope.tab} page={scope.page} q={effective.q} counts={count} units={units}/>:<div className="topic-panels g-content">
  {isShown('entities')&&<section className="topic-panel" aria-labelledby="topic-panel-entities">{panelHead('building','entities','Instituții și firme',result.entities.total,'după nume și CUI')}
  {scope.tab==='entities'&&<label className="topic-role">Arată<select value={scope.role} onChange={e=>update({role:e.target.value as TopicScope['role'],tab:'entities'})}><option value="">Instituții și firme</option><option value="authority">Doar instituții</option><option value="supplier">Doar furnizori</option></select></label>}
  {best&&<BestMatch entity={best} unfiltered={Boolean(scope.place||scope.from||scope.type!=='all')}/>}
  {(scope.place||scope.from||scope.type!=='all')&&otherEntities.length>0&&<p className="topic-panel-note">Cu achiziții în selecție.</p>}
  {otherEntities.length>0&&<div className="topic-entities">{otherEntities.map(e=><Link prefetch={false} className="topic-entity-row" key={e.id} href={`/entitati/${e.id}`}><span><strong><Highlight text={cleanName(e.name)} query={effective.q}/></strong><small>{[e.roles.map(r=>r==='authority'?'Instituție':'Furnizor').join(' · '),e.county,e.cui?`CUI ${e.cui}`:''].filter(Boolean).join(' · ')}</small></span><DiscoveryIcon name="arrow"/></Link>)}</div>}
  {!result.entities.total&&<p className="topic-empty">Nicio instituție sau firmă cu acest nume în selecție.</p>}
  {panelFoot('entities',result.entities.total,result.entities.hits.length,roCount(result.entities.total,'o instituție sau firmă','instituții și firme'))}
  </section>}
  {isShown('acquisitions')&&<section className="topic-panel" aria-labelledby="topic-panel-acquisitions">{panelHead('list','acquisitions','Achiziții',result.acquisitions.total,<>cu „{effective.q}” în titlu</>,result.acquisitions.total>0?<Term id="lista-titluri" tip/>:null)}
  {units&&counted===undefined&&result.acquisitions.total>0&&<UnitsGhost/>}
  {t?.answer&&!question&&counted!=null&&counted>0&&counted!==result.acquisitions.total&&<p className="topic-units"><span><strong>{formatInt(counted)}</strong> după domeniu în „Pe scurt” · {result.acquisitions.total===0?<>niciunul cu „{effective.q}” în titlu</>:<><strong>{formatInt(result.acquisitions.total)}</strong> cu „{effective.q}” în titlu</>} <Term tip title="De ce diferă" text={`„Pe scurt” numără achizițiile încadrate la domeniu (CPV), oricare le-ar fi titlul. Lista de aici are doar titlurile care conțin cuvintele căutate, de la toate instituțiile${t.kind&&result.acquisitions.total>0?`, nu doar ${t.kind.label}`:''}.`}/></span> <Link prefetch={false} href={t.answer.evidenceHref}>Vezi {counted===1?'înregistrarea':`toate cele ${formatInt(counted)}`} <DiscoveryIcon name="arrow"/></Link></p>}
  {result.acquisitions.hits.map(a=><article key={a.id} className="topic-record topic-acquisition"><div className="topic-record-main"><div className="topic-record-meta"><span>{a.kind==='da'?'Achiziție directă':'Contract din procedură'}</span>{a.date&&<span>{a.kind==='da'?'Finalizată':'Semnat'} {a.date.slice(0,10).split('-').reverse().join('.')}</span>}{a.county&&<span>{a.county}</span>}</div><h3><a href={a.href} target="_blank" rel="noopener noreferrer"><Highlight text={a.title} query={effective.q}/></a></h3><div className="topic-parties">{a.authorityId?<Link prefetch={false} href={`/entitati/${a.authorityId}`}>{cleanName(a.authorityName)}</Link>:<span>{a.authorityName??'Instituție neprecizată'}</span>}<span aria-hidden="true"> → </span><span>{a.suppliers.length?a.suppliers.map((s,i)=><Fragment key={a.supplierIds?.[i]??i}>{i>0&&', '}<EntityName id={a.supplierIds?.[i]} role="supplier">{cleanName(s)}</EntityName></Fragment>):'Furnizor neprecizat'}</span></div></div><div className="topic-record-side"><strong>{formatExactDecimal(a.value)}{a.value!=null?' lei':''}</strong><small>valoare înregistrată · nu plăți</small><a href={a.sourceUrl} target="_blank" rel="noopener noreferrer">Verifică în SEAP <DiscoveryIcon name="arrow"/></a></div></article>)}
  {!result.acquisitions.total&&<div className="topic-panel-empty"><p className="topic-empty">Niciun titlu potrivit. <Term id="lista-titluri" tip/></p><Broader scope={scope} effective={effective} t={t} place={vPlace} onDocuments={()=>tab('documents')}/></div>}
  {panelFoot('acquisitions',result.acquisitions.total,result.acquisitions.hits.length,roCount(result.acquisitions.total,'o achiziție','achiziții'))}
  </section>}
  {isShown('documents')&&<section className="topic-panel" aria-labelledby="topic-panel-documents" aria-busy={docsLoading}>{panelHead('document','documents','Documente',docsResult?.documents.total??null,'în textul extras din PDF-uri',<Term tip title="Documente pregătite" text="Căutăm în textul extras din PDF; OCR poate greși. Un document ține de procedură și poate privi mai multe loturi."/>)}
  {docsLoading?<DocumentsGhost rows={scope.tab==='documents'?Math.max(1,Math.min(PAGE_SIZE,(count('documents')??PAGE_SIZE)-(scope.page-1)*PAGE_SIZE)):2}/>
  :<>{docsResult&&docsResult.coverage.known>0&&<div className="topic-coverage"><progress value={docsResult.coverage.ready} max={Math.max(1,docsResult.coverage.known)} aria-label="Acoperirea documentelor pregătite"/><span><strong>{formatInt(docsResult.coverage.ready)} din {formatInt(docsResult.coverage.known)}</strong> fișiere cunoscute au text pregătit · {formatInt(docsResult.coverage.pages)} pagini căutabile. Nu sunt toate documentele din SEAP.</span></div>}
  {!docsResult&&<div className="topic-coverage"><span>Acoperirea documentelor nu este disponibilă acum.</span></div>}
  {docsFailure||!docsResult?<div className="topic-error" role="alert"><p>{docsFailure||'Căutarea în documente nu s-a încheiat.'}</p><button type="button" className="topic-control" onClick={retryDocs}>Reîncearcă documentele</button></div>
  :<>{docsResult.documents.hits.map(d=><article className="topic-record topic-document" key={d.id}><div className="topic-record-main"><div className="topic-record-meta"><DiscoveryIcon name="bookOpen"/><span>{d.method==='ocr'?'Text OCR':'Text extras din PDF'} · pagina {d.page}</span><span>{d.noticeNo}</span></div><h3><a href={documentHref(d,d.page)} target="_blank" rel="noopener noreferrer">{d.filename}</a></h3><p className="topic-help">{d.noticeTitle}</p><blockquote><Highlight text={d.text} query={effective.q}/></blockquote></div><div className="topic-record-side"><small>Pagini găsite</small><div className="topic-document-pages">{d.pages.map(p=><a key={p} aria-label={`Deschide pagina ${p} din ${d.filename}`} href={documentHref(d,p)} target="_blank" rel="noopener noreferrer">{p}</a>)}</div><a href={documentHref(d,d.page)} target="_blank" rel="noopener noreferrer">Citește și păstrează pasajul <DiscoveryIcon name="arrow"/></a><a href={`/api/documents/${d.id}/file?kind=pdf#page=${d.page}`} target="_blank" rel="noopener noreferrer">PDF la pagina {d.page}</a></div></article>)}{!docsResult.documents.total&&<p className="topic-empty">{docsResult.coverage.ready?'Nimic în documentele pregătite.':'Niciun document pregătit în selecție încă.'} Asta nu înseamnă că lipsește din originale.</p>}
  {panelFoot('documents',docsResult.documents.total,docsResult.documents.hits.length,roCount(docsResult.documents.total,'un document','documente'))}</>}</>}
  </section>}
  </div>}
  {result&&total!=null&&scope.page>Math.max(1,Math.ceil(total/PAGE_SIZE))&&<p className="topic-empty">Această pagină nu mai are rezultate. <button type="button" className="topic-text-button" onClick={()=>update({page:1})}>Înapoi la prima pagină</button></p>}
  {/* A tab opened by its link: the count is not known yet, and a tab's list usually has more than one page. */}
  {!result&&total==null&&scope.tab!=='all'&&<Ghost className="topic-pagination" name="topic-pages" wait="client"><span className="topic-control g-quiet" aria-hidden="true">Înapoi</span><span aria-hidden="true"><G.Line inline w="7.5em"/></span><span className="topic-control g-quiet" aria-hidden="true">Înainte</span></Ghost>}
  {total!=null&&total>PAGE_SIZE&&<nav className="topic-pagination" aria-label="Paginarea rezultatelor"><button type="button" className="topic-control" disabled={!result||scope.page<=1} onClick={()=>update({page:scope.page-1})}>Înapoi</button><span>Pagina {scope.page} din {formatInt(Math.ceil(total/PAGE_SIZE))}</span><button type="button" className="topic-control" disabled={!result||scope.page*PAGE_SIZE>=total||scope.page>=1000} onClick={()=>update({page:scope.page+1})}>Înainte</button></nav>}
  <details className="topic-how"><summary>Cum funcționează căutarea</summary>{result&&<p>În arhivă, {formatInt(result.titleCoverage.searchable)} din {formatInt(result.titleCoverage.total)} de achiziții au titlu căutabil. Unele importuri istorice nu păstrează titlul; achizițiile lor rămân accesibile din profilurile instituțiilor și firmelor.</p>}<p>În titluri și documente căutăm cuvinte complete, fără diferențe între litere mari, mici sau diacritice. „Expresia în ordine” păstrează ordinea cuvintelor; punctuația nu schimbă potrivirea. În nume și CUI sunt acceptate și fragmente.</p><p>Perioada folosește data achiziției sau contractului, inclusiv ambii ani. Geografia folosește instituțiile asociate localității în catalog; instituțiile fără asociere pot lipsi.</p><p>Documentele sunt căutate doar când există o legătură verificată cu o procedură din selecție. Textul OCR poate avea erori. Rezultatele din documente sosesc separat, după titluri, instituții și firme.</p>{result?.builtAt&&<p>Index de titluri actualizat la {new Date(result.builtAt).toLocaleString('ro-RO')}.</p>}</details>
  </>}
  </div></div>;
 };
 return <div className="topic-page">
 <nav className="topic-breadcrumb" aria-label="Perspective de explorare"><Link href="/">Descoperă</Link><span aria-hidden="true">/</span><span>Caută</span><Link href="/intreaba">Construiește o întrebare <DiscoveryIcon name="arrow"/></Link></nav>
 {/* After a search, phones show the words as the title so the answer fits in the first screen. */}
 <header className={`topic-intro${scope.q&&!parsed.error?' has-query':''}`}><h1><span className="topic-h1-default">Caută un fir de urmărit.</span>{scope.q&&!parsed.error&&<span className="topic-h1-query">„{scope.q}”</span>}</h1></header>
 <div className="topic-filter-surface"><form className="topic-query" role="search" onSubmit={e=>{e.preventDefault();update({q:query.trim(),tab:'all',role:''});}}><label className="d-sr-only" htmlFor="topic-query">Ce te interesează?</label><DiscoveryIcon name="search"/><input id="topic-query" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="De exemplu: locuri de joacă, iluminat, o firmă…" minLength={2} maxLength={150} required/><button className="topic-primary" type="submit">Caută <DiscoveryIcon name="arrow"/></button></form>
 <button type="button" className="topic-filter-toggle" aria-expanded={filtersExpanded} aria-controls="topic-filters" onClick={()=>setFiltersExpanded(v=>!v)}><span>Loc, perioadă și alte filtre{filterSummary&&<small>{filterSummary}</small>}</span><DiscoveryIcon name="chevronDown"/></button>
 <div id="topic-filters" className={`topic-filters${filtersExpanded?' is-expanded':''}`}><PlacePicker value={effective.place} selected={place?.id===effective.place?place:null} onChange={p=>{setPlace(p);refine({place:p?.id??''});}}/><PeriodPicker scope={effective} onChange={refine}/><label>Tipul achiziției<select value={scope.type} onChange={e=>update({type:e.target.value as TopicScope['type']})}><option value="all">Toate tipurile</option><option value="da">Achiziții directe</option><option value="contracts">Contracte din proceduri</option></select></label><label>Potrivirea<select value={scope.match} onChange={e=>update({match:e.target.value as TopicScope['match']})}><option value="words">Toate cuvintele</option><option value="phrase">Expresia în ordine</option></select></label></div>
 </div>
 {error?<><div className="topic-status" role="status" aria-live="polite">Căutarea nu s-a încheiat.</div><div className="topic-error" role="alert"><p>{error}</p><button type="button" className="topic-control" onClick={()=>{setMainError(null);setRetry(n=>n+1);}}>Reîncearcă</button> <Link href="/cauta">Resetează filtrele</Link></div><div className="topic-results" style={{minHeight:t?.question?0:400}}/></>
  :!scope.q?<div className="topic-results" style={{minHeight:400}}><div className="topic-start"><p>Exemple:</p><div>{['locuri de joacă','iluminat','Municipiul Buzău'].map(q=><button type="button" className="topic-control" key={q} onClick={()=>update({q})}>{q}<DiscoveryIcon name="arrow"/></button>)}</div></div></div>
  :stale?answer(stale.view,stale.result,{dim:true})
  :answer(view,result,{dim:refetching,reading:!interpReady})}
 {/* Present before documents load, so their arrival is announced. */}
 <p className="d-sr-only" role="status" aria-live="polite">{!docsKey||error||loading?'':currentDocs.loading?'Căutăm și în documentele procedurilor.':currentDocs.failure?'Căutarea în documente nu s-a încheiat.':currentDocs.result?(currentDocs.result.documents.total===1?'Un document găsit.':`Documente găsite: ${formatInt(currentDocs.result.documents.total)}.`):''}</p>
 {pending&&<FloatStatus>{interpReady?<>Căutăm „{effective.q}” · {where} · {period}…</>:<>Citim căutarea „{scope.q}”…</>}</FloatStatus>}
 </div>;
}
