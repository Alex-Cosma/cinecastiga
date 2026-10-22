'use client';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import DiscoveryIcon from '../DiscoveryIcon';
import {formatExactDecimal,formatInt,cleanName} from '@/lib/format';
import {parseTopicScope,topicParams,documentScope,fold,PAGE_SIZE,type TopicScope,type TopicResult,type TopicDocumentsResult,type DocumentHit,type Place,type SearchTab,type EntityHit} from '@/lib/topic-search/shared';
import type {TopicInterpretation} from '@/lib/topic-search/interpretation';
import {Broader,SubjectAnswer,Understood,searchHref} from './Understood';

const defaults:TopicScope={q:'',place:'',from:'',to:'',type:'all',match:'words',tab:'all',page:1,role:''};
const TABS:{id:SearchTab;label:string}[]=[{id:'all',label:'Toate'},{id:'entities',label:'Instituții și firme'},{id:'acquisitions',label:'Achiziții'},{id:'documents',label:'Documente'}];
function IdentityMatch({entity:e}:{entity:EntityHit}){
 const role=e.roles.includes('authority')?'autoritate':'furnizor',profile=`/entitati/${e.id}?rol=${role}`;return <div className="topic-identity-row" key={e.id}>
 <div><h3><Link prefetch={false} href={profile}>{cleanName(e.name)}</Link></h3><p>{[e.roles.includes('authority')?'Instituție':'Furnizor',e.county,e.cui?`CUI ${e.cui}`:'CUI neprecizat'].filter(Boolean).join(' · ')}</p></div>
 <div className="topic-identity-actions"><Link prefetch={false} className="topic-control" href={profile}>{e.roles.includes('authority')?'Vezi instituția':'Vezi firma'}</Link><Link prefetch={false} className="topic-primary" href={`${profile}#achizitii`}>Toate achizițiile <DiscoveryIcon name="arrow"/></Link></div>
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
   // Enter before the list was visible: choose only an unambiguous name.
   const ambiguous=places.length>1&&fold(places[1]!.name)===fold(places[0]!.name);
   if(typed&&!ambiguous)choose(places[0]!);}
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
  {open&&<div className="topic-options"><p className="topic-help" role="status">{loading?'Se caută localități…':error||'Alege un județ, oraș sau o comună.'}</p><ul id={`${id}-options`} role="listbox" aria-label="Județe și localități" aria-busy={loading}>
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
 {open&&<div className="topic-period-panel" id={`${id}-panel`}><h3>Alege intervalul</h3><div className="topic-year-pair"><label>Din anul<input type="number" min={1900} max={new Date().getFullYear()+1} value={from} onChange={e=>setFrom(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();apply();}}}/></label><label>Până în anul<input type="number" min={1900} max={new Date().getFullYear()+1} value={to} onChange={e=>setTo(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();apply();}}}/></label></div><p className="topic-help">Sunt incluși ambii ani.</p>{error&&<p role="alert" className="topic-error">{error}</p>}<button type="button" className="topic-primary" onClick={apply}>Aplică intervalul</button><button type="button" className="topic-text-button" onClick={()=>{onChange({from:'',to:''});setOpen(false);button.current?.focus();}}>Toți anii</button></div>}
 </div>;
}
type Loaded<T>={key:string;result:T};
type Failure={key:string;message:string};
/** Placeholder records: the new selection is loading; nothing from the previous one is shown. */
function Waiting({rows=3}:{rows?:number}){return <div className="topic-waiting" aria-hidden="true">{Array.from({length:rows},(_,i)=><div key={i} className="topic-skeleton"><span/><span/><span/></div>)}</div>;}
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
 const [main,setMain]=useState<Loaded<TopicResult>|null>(null),[mainError,setMainError]=useState<Failure|null>(null),[retry,setRetry]=useState(0);
 const [docs,setDocs]=useState<Loaded<TopicDocumentsResult>|null>(null),[docsError,setDocsError]=useState<Failure|null>(null),[docsRetry,setDocsRetry]=useState(0);
 const [filtersExpanded,setFiltersExpanded]=useState(false);
 const resultBox=useRef<HTMLDivElement>(null),[stableHeight,setStableHeight]=useState(400),previous=useRef<TopicResult|null>(null);
 useEffect(()=>{setQuery(parsed.scope.q);setCopied('');},[parsed]);
 useEffect(()=>{if(parsed.error||!mainKey)return;const abort=new AbortController();
  void fetch(`/api/topic-search?${mainKey}`,{signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(!abort.signal.aborted){setMain({key:mainKey,result:d});previous.current=d;setPlace(d.place);}}).catch(e=>{if(!abort.signal.aborted)setMainError({key:mainKey,message:e.message});});
  return()=>abort.abort();
 },[mainKey,retry,parsed.error]);
 useEffect(()=>{if(!docsKey)return;const abort=new AbortController();
  void fetch(`/api/topic-search/documents?${docsKey}`,{signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(!abort.signal.aborted)setDocs({key:docsKey,result:d});}).catch(e=>{if(!abort.signal.aborted)setDocsError({key:docsKey,message:e.message});});
  return()=>abort.abort();
 },[docsKey,docsRetry]);
 // Only what answers the current URL is shown.
 const result=main?.key===mainKey&&!parsed.error?main.result:null;
 const error=parsed.error||(mainError?.key===mainKey?mainError.message:'');
 const loading=!result&&!error;
 const docsResult=docs?.key===docsKey?docs.result:null,docsFailure=docsError?.key===docsKey?docsError.message:'';
 const docsLoading=Boolean(docsKey)&&!docsResult&&!docsFailure;
 useEffect(()=>{if(result&&resultBox.current)setStableHeight(Math.max(400,resultBox.current.offsetHeight));},[result]);
 const update=(patch:Partial<TopicScope>)=>{const next={...scope,...patch,page:patch.page??1},params=topicParams(next);if(literal&&patch.q===undefined)params.set('literal','1');const target=params.toString();
  setMain(null);setMainError(null);
  if(target===url){setRetry(n=>n+1);setDocs(null);setDocsError(null);setDocsRetry(n=>n+1);}else router.push(`/cauta?${target}`,{scroll:false});};
 // Editing a filter keeps what was taken from the words, as explicit filters.
 const refine=(patch:Partial<TopicScope>)=>update({...(t&&(t.fromWords.place||t.fromWords.period)?{q:t.applied.q,place:effective.place,from:effective.from,to:effective.to}:{}),...patch});
 const retryDocs=()=>{setDocsError(null);setDocsRetry(n=>n+1);};
 const tab=(id:SearchTab)=>update({tab:id,role:''});
 // Counts stay visible while only the tab or page changes; a new selection starts empty.
 const selection=(s:TopicScope)=>topicParams({...s,tab:'all',page:1}).toString();
 const counts=result??(previous.current&&selection(previous.current.scope)===selection(effective)?previous.current:null);
 const placeName=effective.place?(place?.id===effective.place?place.name:''):'';
 const where=effective.place?placeName||'locul ales':'toată țara';
 const period=effective.from?effective.from===effective.to?effective.from:`${effective.from}–${effective.to}`:'toți anii';
 // A recognised subject leads with its answer; a name match then moves below the records.
 const subjectFirst=Boolean(t?.subject);
 const suggestions=result&&scope.tab==='all'?result.entities.suggestions??[]:[];
 const identityBlock=suggestions.length>0?<section className={`topic-identity${subjectFirst?' is-secondary':''}`} aria-label="Potriviri de instituții și firme">
 <h2>{subjectFirst?(suggestions[0]!.roles.includes('authority')?'Există și o instituție cu acest nume':'Există și o firmă cu acest nume'):suggestions[0]!.roles.includes('authority')?'Cauți această instituție?':'Cauți această firmă?'}</h2>
 <IdentityMatch entity={suggestions[0]!}/>
 {suggestions.length>1&&<details className="topic-other-identities"><summary>Alte potriviri apropiate ({suggestions.length-1})</summary>{suggestions.slice(1).map(e=><IdentityMatch key={e.id} entity={e}/>)}</details>}
 {(scope.place||scope.from||scope.type!=='all')&&<p className="topic-help">Legăturile deschid profilul complet, fără filtrele acestei căutări.</p>}
 </section>:null;
 const filterSummary=[placeName,effective.from?`${effective.from}–${effective.to}`:'',scope.type==='da'?'Achiziții directe':scope.type==='contracts'?'Contracte':'',scope.match==='phrase'?'Expresia în ordine':''].filter(Boolean).join(' · ');
 const count=(id:SearchTab):number|null=>id==='all'?null:id==='documents'?docsResult?.documents.total??null:counts?.[id]?.total??null;
 const isShown=(id:SearchTab)=>scope.tab==='all'||scope.tab===id;
 const total=scope.tab==='all'?null:count(scope.tab);
 const sectionHead=(id:SearchTab,title:string,n:number|null)=> <div className="topic-section-head"><h2>{title} {n!=null&&<span>{formatInt(n)}</span>}</h2>{scope.tab==='all'&&n!=null&&n>0&&<button type="button" className="topic-text-button" onClick={()=>tab(id)}>Vezi {id==='documents'?'toate documentele':id==='entities'?'toate entitățile':'toate achizițiile'} <DiscoveryIcon name="arrow"/></button>}</div>;
 const copy=async()=>{try{await navigator.clipboard.writeText(new URL(`/cauta?${topicParams(scope)}`,window.location.origin).href);setCopied('Link copiat');}catch{setCopied('Nu am putut copia linkul. Copiază adresa din browser.');}};
 const documentHref=(d:DocumentHit,page:number)=>`/contracte/${d.contractId}?document=${d.id}&page=${page}&highlight=${encodeURIComponent(effective.q)}#fisiere`;
 return <div className="topic-page">
 <nav className="topic-breadcrumb" aria-label="Perspective de explorare"><Link href="/">Descoperă</Link><span aria-hidden="true">/</span><span>Caută</span><Link href="/intreaba">Construiește o întrebare <DiscoveryIcon name="arrow"/></Link></nav>
 <header className="topic-intro"><h1>Caută un fir de urmărit.</h1><p>Un subiect, o instituție, o firmă. De aici ajungi la achiziții și la documentele din spatele lor.</p></header>
 <div className="topic-filter-surface"><form className="topic-query" role="search" onSubmit={e=>{e.preventDefault();update({q:query.trim(),tab:'all',role:''});}}><label className="d-sr-only" htmlFor="topic-query">Ce te interesează?</label><DiscoveryIcon name="search"/><input id="topic-query" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="De exemplu: locuri de joacă, iluminat, o firmă…" minLength={2} maxLength={150} required/><button className="topic-primary" type="submit">Caută <DiscoveryIcon name="arrow"/></button></form>
 <button type="button" className="topic-filter-toggle" aria-expanded={filtersExpanded} aria-controls="topic-filters" onClick={()=>setFiltersExpanded(v=>!v)}><span>Loc, perioadă și alte filtre{filterSummary&&<small>{filterSummary}</small>}</span><DiscoveryIcon name="chevronDown"/></button>
 <div id="topic-filters" className={`topic-filters${filtersExpanded?' is-expanded':''}`}><PlacePicker value={effective.place} selected={place?.id===effective.place?place:null} onChange={p=>{setPlace(p);refine({place:p?.id??''});}}/><PeriodPicker scope={effective} onChange={refine}/><label>Tipul achiziției<select value={scope.type} onChange={e=>update({type:e.target.value as TopicScope['type']})}><option value="all">Toate tipurile</option><option value="da">Achiziții directe</option><option value="contracts">Contracte din proceduri</option></select></label><label>Potrivirea<select value={scope.match} onChange={e=>update({match:e.target.value as TopicScope['match']})}><option value="words">Toate cuvintele</option><option value="phrase">Expresia în ordine</option></select></label></div>
 </div>
 <div className="topic-status" role="status" aria-live="polite">{error?'Căutarea nu s-a încheiat.':!scope.q?'Alege un subiect pentru a începe.':loading?<><span className="topic-spinner" aria-hidden="true"/>{interpReady?<>Căutăm <strong>„{effective.q}”</strong> · {where} · {period}…</>:<>Citim căutarea <strong>„{scope.q}”</strong>…</>}</>:<>Rezultate pentru <strong>„{effective.q}”</strong> · {where} · {period}</>}</div>
 {/* Present before documents load, so their arrival is announced. */}
 <p className="d-sr-only" role="status" aria-live="polite">{!docsKey||error||loading?'':docsLoading?'Căutăm și în documentele procedurilor.':docsFailure?'Căutarea în documente nu s-a încheiat.':docsResult?(docsResult.documents.total===1?'Un document găsit.':`Documente găsite: ${formatInt(docsResult.documents.total)}.`):''}</p>
 {literal&&scope.q&&!error&&<p className="topic-help topic-literal">Cauți exact cuvintele scrise, fără interpretare. <Link prefetch={false} href={searchHref(scope,{})}>Interpretează căutarea</Link></p>}
 {t&&!error&&<Understood scope={scope} effective={effective} t={t} place={place}/>}
 {error&&<div className="topic-error" role="alert"><p>{error}</p><button type="button" className="topic-control" onClick={()=>{setMainError(null);setRetry(n=>n+1);}}>Reîncearcă</button> <Link href="/cauta">Resetează filtrele</Link></div>}
 <div ref={resultBox} className={`topic-results${loading?' is-loading':''}`} style={{minHeight:loading&&scope.q?stableHeight:400}} aria-busy={loading}>
 {scope.q&&!error?<><nav className="topic-tabs" aria-label="Tipuri de rezultate">{TABS.map(t=>{const n=count(t.id),waiting=t.id==='documents'?docsLoading:loading&&n==null;return <button type="button" key={t.id} aria-current={scope.tab===t.id?'page':undefined} disabled={loading} onClick={()=>tab(t.id)}>{t.label}{n!=null?<span>{formatInt(n)}</span>:waiting&&t.id!=='all'?<span className="topic-count-wait"><span aria-hidden="true">…</span><span className="d-sr-only">se numără</span></span>:null}</button>;})}</nav>
 {!result?<div className="topic-result-layout"><div className="topic-records"><Waiting/></div><aside className="topic-context topic-context-waiting" aria-hidden="true"><Waiting rows={1}/></aside></div>:<>
 {t?.answer&&scope.tab==='all'&&<SubjectAnswer answer={t.answer}/>}
 {!subjectFirst&&identityBlock}
 <div className="topic-result-layout"><div className="topic-records">
 {isShown('acquisitions')&&<section aria-label="Achiziții găsite">{sectionHead('acquisitions','În titlurile disponibile',result.acquisitions.total)}<p className="topic-help">Fiecare contract apare o singură dată, inclusiv când are mai mulți furnizori.</p>{result.acquisitions.hits.map(a=><article key={a.id} className="topic-record"><div className="topic-record-meta"><span>{a.kind==='da'?'Achiziție directă':'Contract din procedură'}</span>{a.date&&<span>{a.kind==='da'?'Finalizată':'Semnat'} {a.date.slice(0,10).split('-').reverse().join('.')}</span>}{a.county&&<span>{a.county}</span>}</div><h3><a href={a.href} target="_blank" rel="noopener noreferrer"><Highlight text={a.title} query={effective.q}/></a></h3><div className="topic-parties">{a.authorityId?<Link prefetch={false} href={`/entitati/${a.authorityId}`}>{cleanName(a.authorityName)}</Link>:<span>{a.authorityName??'Instituție neprecizată'}</span>}<span aria-hidden="true"> → </span><span>{a.suppliers.map(cleanName).join(', ')||'Furnizor neprecizat'}</span></div><div className="topic-record-bottom"><span><strong>{formatExactDecimal(a.value)}{a.value!=null?' lei':''}</strong><small>valoare înregistrată · nu plăți</small></span><a href={a.sourceUrl} target="_blank" rel="noopener noreferrer">Verifică în SEAP <DiscoveryIcon name="arrow"/></a></div></article>)}{!result.acquisitions.total&&<><p className="topic-empty">Niciun titlu disponibil nu se potrivește acestor condiții. Unele importuri istorice nu păstrează titlul achiziției; poți continua căutând instituția sau firma.</p><Broader scope={scope} effective={effective} t={t} place={place} onDocuments={()=>tab('documents')}/></>}</section>}
 {isShown('documents')&&<section aria-label="Documente găsite" aria-busy={docsLoading}>{sectionHead('documents','În documentele pregătite',docsResult?.documents.total??null)}
 {docsLoading?<><p className="topic-docs-wait"><span className="topic-spinner" aria-hidden="true"/>Căutăm și în documentele procedurilor{placeName?` din ${placeName}`:''}…{scope.tab==='all'?' Poți citi celelalte rezultate între timp.':''}</p><Waiting rows={scope.tab==='documents'?3:1}/></>
 :docsFailure||!docsResult?<div className="topic-error" role="alert"><p>{docsFailure||'Căutarea în documente nu s-a încheiat.'}</p><button type="button" className="topic-control" onClick={retryDocs}>Reîncearcă documentele</button></div>
 :<><p className="topic-help">Potriviri în textul extras. Documentele aparțin procedurii și pot privi mai multe loturi.</p>{docsResult.documents.hits.map(d=><article className="topic-record topic-document" key={d.id}><div className="topic-record-meta"><DiscoveryIcon name="bookOpen"/><span>{d.method==='ocr'?'Text OCR':'Text extras din PDF'} · pagina {d.page}</span></div><h3><a href={documentHref(d,d.page)} target="_blank" rel="noopener noreferrer">{d.filename}</a></h3><blockquote><Highlight text={d.text} query={effective.q}/></blockquote><p className="topic-help">{d.noticeNo} · {d.noticeTitle}</p><div className="topic-document-pages"><span>Pagini găsite:</span>{d.pages.map(p=><a key={p} aria-label={`Deschide pagina ${p} din ${d.filename}`} href={documentHref(d,p)} target="_blank" rel="noopener noreferrer">{p}</a>)}</div><div className="topic-record-bottom"><a href={documentHref(d,d.page)} target="_blank" rel="noopener noreferrer">Citește și păstrează pasajul <DiscoveryIcon name="arrow"/></a><a href={`/api/documents/${d.id}/file?kind=pdf#page=${d.page}`} target="_blank" rel="noopener noreferrer">PDF la pagina {d.page}</a></div></article>)}{!docsResult.documents.total&&<p className="topic-empty">{docsResult.coverage.ready?'Nu am găsit cuvintele în documentele pregătite din această selecție.':'Nu avem încă documente cu text pregătit în această selecție.'} Absența unui rezultat nu înseamnă că cerința nu există în documentele originale.</p>}</>}
 </section>}
 {isShown('entities')&&<section aria-label="Instituții și firme găsite">{sectionHead('entities','Instituții și firme',result.entities.total)}{scope.tab==='entities'&&<label className="topic-role">Arată<select value={scope.role} onChange={e=>update({role:e.target.value as TopicScope['role'],tab:'entities'})}><option value="">Instituții și firme</option><option value="authority">Doar instituții</option><option value="supplier">Doar furnizori</option></select></label>}<p className="topic-help">{scope.place||scope.from||scope.type!=='all'?'Nume sau CUI, cu activitate în achizițiile din selecție.':'Potriviri după nume sau CUI.'}</p>{result.entities.hits.map(e=><article className="topic-record topic-entity" key={e.id}><div className="topic-record-meta"><span>{e.roles.map(r=>r==='authority'?'Instituție':'Furnizor').join(' · ')}</span>{e.cui&&<span>CUI {e.cui}</span>}{e.county&&<span>{e.county}</span>}</div><h3><Link prefetch={false} href={`/entitati/${e.id}`}><span><Highlight text={cleanName(e.name)} query={effective.q}/></span><DiscoveryIcon name="arrow"/></Link></h3></article>)}{!result.entities.total&&<p className="topic-empty">Nicio instituție sau firmă cu acest nume în selecție.</p>}</section>}
 {total!=null&&scope.page>Math.max(1,Math.ceil(total/PAGE_SIZE))&&<p className="topic-empty">Această pagină nu mai are rezultate. <button type="button" className="topic-text-button" onClick={()=>update({page:1})}>Înapoi la prima pagină</button></p>}
 {total!=null&&total>PAGE_SIZE&&<nav className="topic-pagination" aria-label="Paginarea rezultatelor"><button type="button" className="topic-control" disabled={scope.page<=1} onClick={()=>update({page:scope.page-1})}>Înapoi</button><span>Pagina {scope.page} din {formatInt(Math.ceil(total/PAGE_SIZE))}</span><button type="button" className="topic-control" disabled={scope.page*PAGE_SIZE>=total||scope.page>=1000} onClick={()=>update({page:scope.page+1})}>Înainte</button></nav>}
 {subjectFirst&&identityBlock}
 </div><aside className="topic-context"><h2>Ce poți verifica aici</h2><p>Titlurile te duc la achiziție. Un pasaj te duce la pagina exactă din document.</p><div className="topic-coverage" aria-busy={docsLoading}>{docsResult?<><strong>{formatInt(docsResult.coverage.ready)} din {formatInt(docsResult.coverage.known)}</strong><span>fișiere cunoscute în selecție au text pregătit</span><progress value={docsResult.coverage.ready} max={Math.max(1,docsResult.coverage.known)} aria-label="Acoperirea documentelor pregătite"/><p>{formatInt(docsResult.coverage.pages)} pagini căutabile. Nu sunt toate documentele din SEAP.</p></>:docsLoading?<><strong aria-hidden="true">…</strong><span>Numărăm fișierele cu text pregătit din selecție.</span></>:<span>Acoperirea documentelor nu este disponibilă acum.</span>}</div><p>Poți păstra un pasaj într-o anchetă după ce îl deschizi și îl verifici în original.</p><button type="button" className="topic-control" onClick={()=>void copy()}><DiscoveryIcon name="link"/>Copiază căutarea</button>{copied&&<p role="status">{copied}</p>}<details><summary>Cum funcționează căutarea</summary><p>În arhivă, {formatInt(result.titleCoverage.searchable)} din {formatInt(result.titleCoverage.total)} de achiziții au titlu căutabil. Unele importuri istorice nu păstrează titlul; achizițiile lor rămân accesibile din profilurile instituțiilor și firmelor.</p><p>În titluri și documente căutăm cuvinte complete, fără diferențe între litere mari, mici sau diacritice. „Expresia în ordine” păstrează ordinea cuvintelor; punctuația nu schimbă potrivirea. În nume și CUI sunt acceptate și fragmente.</p><p>Perioada folosește data achiziției sau contractului, inclusiv ambii ani. Geografia folosește instituțiile asociate localității în catalog; instituțiile fără asociere pot lipsi.</p><p>Documentele sunt căutate doar când există o legătură verificată cu o procedură din selecție. Textul OCR poate avea erori. Rezultatele din documente sosesc separat, după titluri, instituții și firme.</p>{result.builtAt&&<p>Index de titluri actualizat la {new Date(result.builtAt).toLocaleString('ro-RO')}.</p>}</details><Link href="/intreaba" className="topic-next">Vrei clasamente sau comparații?<br/><strong>Construiește o întrebare <DiscoveryIcon name="arrow"/></strong></Link></aside></div>
 </>}
 </>:!error?<div className="topic-start"><DiscoveryIcon name="search"/><h2>Ce vrei să urmărești?</h2><p>Caută ce te interesează, apoi restrânge după loc și perioadă. Poți porni și de la numele unei firme sau al unei instituții.</p><div>{['locuri de joacă','iluminat','Municipiul Buzău'].map(q=><button type="button" className="topic-control" key={q} onClick={()=>update({q})}>{q}<DiscoveryIcon name="arrow"/></button>)}</div></div>:null}
 </div></div>;
}
