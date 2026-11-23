'use client';
import {Fragment,useEffect,useId,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import DiscoveryIcon from '../DiscoveryIcon';
import Term from '@/components/Term';
import InfoMark from '@/components/InfoMark';
import EntityName from '@/components/EntityName';
import {G,Ghost} from '@/components/ghost/Ghost';
import {cleanName,formatInt,formatRon,formatRonFull} from '@/lib/format';
import {titleName} from '../../lib/tidy-name';
import {countWords} from '@/lib/ask/answer-text';
import {countyName} from '@/lib/counties';
import {countyHref,countyRows,entityNouns,mapTotal,type MapData} from '@/lib/topic-search/short-answer';
import type {AskSpec} from '@/lib/ask/spec';
import type {SuggestResponse} from '@/app/api/suggest/route';
import type {TopicInterpretation} from '@/lib/topic-search/interpretation';
import {answerShape,fold,periodText,topicParams,withoutDomain,type Place,type TopicScope} from '@/lib/topic-search/shared';
import {relatedSubjects,relatedWord} from '@/lib/topic-search/related';
import {markParts,placeSentence,placeTexts} from '@/lib/topic-search/sentence';
import {TownHallPicker} from '../TownHallTile';
import {scrollMotion} from '../../components/motion/scroll';

const capital=(s:string)=>s.charAt(0).toLocaleUpperCase('ro-RO')+s.slice(1);
/** A /cauta link for the same selection with some parts changed. */
export const searchHref=(scope:TopicScope,patch:Partial<TopicScope>,literal=false)=>{const p=topicParams({...scope,tab:'all',page:1,role:'',...patch});if(literal)p.set('literal','1');return `/cauta?${p}`;};
const periodLabel=periodText;

/** The words name „my” town hall or locality: which one is not known (lib/intent notes). */
export const OWN_PLACE_NOTE=/nu știm ce localitate/;
/** The unit prices' note (lib/intent/rules.ts unitPriceNote): /preturi is linked beside it. */
const UNIT_PRICE_NOTE=/pagina Prețuri/;
/**
 * What the reading dropped or narrowed, said under it (a place that cannot be left out, the first of two years…). A
 * town hall not named („primăria mea”) gets the home page's town hall picker beside its note (UX audit Z1-33).
 */
function ReadingNotes({notes,priceHref=null}:{notes:string[];priceHref?:string|null}){
 return notes.length?<>{notes.map(n=><Fragment key={n}><p className="topic-help topic-reading-note">{n}{priceHref&&UNIT_PRICE_NOTE.test(n)&&<> <Link prefetch={false} href={priceHref}>Vezi prețurile pe unitate →</Link></>}</p>{OWN_PLACE_NOTE.test(n)&&<TownHallPicker trigger={show=><button type="button" className="topic-control topic-pick-hall" aria-haspopup="dialog" onClick={show}><DiscoveryIcon name="pin"/>Alege primăria ta</button>}/>}</Fragment>)}</>:null;
}

/** One part of the sentence the person can change: its words, underlined, open a short menu of what else it can be. */
function Part({text,what,children}:{text:string;what:string;children:React.ReactNode}){
 return <details className="topic-part"><summary><span>{text}</span><DiscoveryIcon name="chevronDown"/><span className="d-sr-only"> ({what})</span></summary><div className="topic-part-menu">{children}</div></details>;
}

type Subject=NonNullable<TopicInterpretation['subject']>;
type PartStat={value:number;count:number}|null;
// What each domain holds in the selection, asked once per tab when the word's menu is first opened.
const partStats=new Map<string,Promise<PartStat>>();
function partStat(spec:AskSpec):Promise<PartStat>{
 const key=JSON.stringify(spec),hit=partStats.get(key);
 if(hit)return hit;
 const asked=fetch('/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({spec})}).then(r=>r.json() as Promise<{ok?:boolean;data?:{block?:string;stat?:{value:number|string;count:number|string}}}>)
  .then(r=>r.ok&&r.data?.block==='stat'&&r.data.stat?{value:Number(r.data.stat.value),count:Number(r.data.stat.count)}:null,()=>null);
 partStats.set(key,asked);void asked.then(v=>{if(!v)partStats.delete(key);});
 if(partStats.size>80)partStats.delete(partStats.keys().next().value!);
 return asked;
}
/** Whether the word of a subject has anything to say when opened: its domains, the subjects around it, another reading. */
export const subjectHasMenu=(subject:Subject,others:number)=>Boolean(subject.parts?.length||subject.related?.length||others);

/**
 * The subject's word in „Am înțeles” (owner, 16 November 2026, „varianta B”): opened, it says which CPV domains the
 * subject counts, each with its value and records in the selection (asked when the menu first opens, „…” until then)
 * and a thin bar of its share; one domain can be kept alone, and „Toate cele N domenii” brings the subject back. Under
 * them: the curated subjects inside it or beside it, and the other subjects read in the words. It never says „Nu e un
 * subiect”: „Caută exact ce ai scris” on the same row is that way out. On a phone it is a sheet from the bottom.
 */
function SubjectWord({text,scope,effective,subject,others,total}:{text:string;scope:TopicScope;effective:TopicScope;subject:Subject;others:TopicInterpretation['otherSubjects'];total:AskSpec|null}){
 const box=useRef<HTMLDetailsElement>(null),[opened,setOpened]=useState(false),[stats,setStats]=useState<Record<string,PartStat|undefined>>({});
 const parts=subject.parts??[],related=subject.related??[],choose=parts.length>1&&parts.some(x=>x.pick);
 const specOf=(cpvTerm:string):AskSpec|null=>total?{...total,filters:{...total.filters,cpvTerm}}:null;
 const keys=opened&&total?[subject.term,...parts.map(x=>x.code)].join('|'):'';
 useEffect(()=>{if(!keys)return;let alive=true;
  for(const cpvTerm of keys.split('|')){const spec=specOf(cpvTerm);if(spec)void partStat(spec).then(v=>{if(alive)setStats(now=>({...now,[cpvTerm]:v}));});}
  return()=>{alive=false;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[keys,JSON.stringify(total)]);
 const sum=parts.reduce((n,x)=>n+(stats[x.code]?.value??0),0);
 const figure=(key:string)=>{const v=stats[key];return v===undefined?(total?<span className="topic-domain-fig topic-count-wait" aria-hidden="true">…</span>:null):v?<span className="topic-domain-fig"><b>{v.count?formatRon(v.value):'nimic'}</b>{v.count>0&&<small>{countWords(v.count,'înregistrare','înregistrări')}</small>}</span>:null;};
 const bar=(key:string)=>{const v=stats[key];return v&&sum>0?<span className="topic-domain-bar" aria-hidden="true"><i style={{width:`${Math.max(1,Math.round(v.value/sum*100))}%`}}/></span>:null;};
 const here={place:effective.place,from:effective.from,to:effective.to};
 const close=()=>{if(box.current){box.current.open=false;box.current.querySelector('summary')?.focus();}};
 const label=subject.label,n=parts.length;
 return <details ref={box} className="topic-part topic-part-subject" onToggle={e=>{const el=e.currentTarget as HTMLDetailsElement;if(!el.open)return;setOpened(true);
   // a tall menu opened low on the screen is brought into view (not the phone's sheet, which is fixed)
   el.querySelector('.topic-domain-menu')?.scrollIntoView({block:'nearest',behavior:scrollMotion()});}}>
  <summary><span>{text}</span><DiscoveryIcon name="chevronDown"/><span className="d-sr-only"> (ce numărăm la acest subiect)</span></summary>
  <div className="topic-part-menu topic-domain-menu">
   <div className="topic-domain-head">
    <div>{n>0?<p className="topic-domain-title">La „{label}” numărăm {n===1?'un domeniu\u00a0CPV':`${countWords(n,'domeniu','domenii')}\u00a0CPV`}</p>:subject.cpvName?<p className="topic-domain-title">Domeniul CPV: {subject.cpvName}</p>:<p className="topic-domain-title">„{capital(label)}”</p>}
     {n>0&&<p className="topic-domain-note">După încadrarea oficială a achiziției, nu după titlu.{choose&&' Alege unul ca să vezi doar acel domeniu.'}</p>}</div>
    <button type="button" className="topic-domain-close" onClick={close} aria-label="Închide"><DiscoveryIcon name="close"/></button>
   </div>
   {choose&&<Link prefetch={false} scroll={false} className="topic-domain" aria-current={subject.chosen?undefined:'true'} href={searchHref(withoutDomain(scope),{})} onClick={close}>
    <span className="topic-domain-mark" aria-hidden="true"/><span className="topic-domain-name"><span>Toate cele {countWords(n,'domeniu','domenii')}</span><small>tot ce numărăm la „{label}”</small></span>{figure(subject.term)}</Link>}
   {parts.map(x=>{const inner=<><span className="topic-domain-mark" aria-hidden="true"/><span className="topic-domain-name"><span>{x.name}</span><code>{x.code}</code>{bar(x.code)}</span>{figure(x.code)}</>;
    return choose&&x.pick?<Link prefetch={false} scroll={false} key={x.code} className="topic-domain" aria-current={subject.chosen===x.code?'true':undefined} href={searchHref(scope,{domain:x.code})} onClick={close}>{inner}</Link>
     :<div key={x.code} className={`topic-domain is-plain${choose?'':' is-only'}`}>{inner}</div>;})}
   {(['narrower','near'] as const).map(kind=>{const list=related.filter(r=>r.kind===kind);return list.length?<div className="topic-domain-more" key={kind}>
    <p>{kind==='narrower'?'Mai îngust, în același domeniu':'Subiecte apropiate'}</p>
    <div>{list.map(r=><Link prefetch={false} key={r.term} href={searchHref(withoutDomain(scope),{q:r.label,...here})}>{r.label}{"\u00a0→"}</Link>)}</div></div>:null;})}
   {others.length>0&&<div className="topic-domain-more"><p>Alt subiect citit în cuvinte</p>
    <div>{others.map(o=><Link prefetch={false} key={o.label} href={searchHref(withoutDomain(scope),{q:o.label,...here})}>{capital(o.label)}{"\u00a0→"}</Link>)}</div></div>}
  </div>
 </details>;
}

type Around=NonNullable<TopicInterpretation['placeAround']>;
const wholeCounty=(county:string)=>county==='București'?'Tot Bucureștiul':`Tot județul ${county}`;
const inCounty=(county:string)=>county==='București'?'București':`județul ${county}`;
/**
 * The place's word in „Am înțeles” (owner, 17 November 2026, „varianta B”): opened on `/cauta?q=Cluj` it offered only
 * „Caută „Cluj” în toată țara”, though it is announced as „schimbă locul”. It now offers the places around: for a county
 * its largest localities and the counties beside it, for a locality its whole county and the other localities of it
 * (lib/topic-search/around.ts), and a search for any other place; typing replaces the suggestions with what was found.
 * The way out („toată țara”) stays last. The same window as the subject's word, a sheet from the bottom on a phone.
 */
function PlaceWord({text,title,choices,around,hrefFor,out}:{text:string;title:string;choices:{id:string;text:string;href:string}[];around:Around|null;hrefFor:(p:Place)=>string;out:{text:string;href:string}}){
 const box=useRef<HTMLDetailsElement>(null),id=useId(),router=useRouter();
 const [term,setTerm]=useState(''),[found,setFound]=useState<{term:string;places:Place[];failed:boolean}|null>(null);
 // Once the field is used the sheet stays tall until the menu closes: a height that followed the focus moved the
 // suggestions from under the finger as it left the field (found on the public site, 17 November 2026).
 const [searching,setSearching]=useState(false);
 const word=term.trim();
 useEffect(()=>{if(word.length<2){setFound(null);return;}
  const abort=new AbortController(),timer=setTimeout(()=>{void fetch(`/api/topic-search/places?q=${encodeURIComponent(word)}`,{signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(!abort.signal.aborted)setFound({term:word,places:(d.places as Place[]).slice(0,6),failed:false});})
   .catch(e=>{if(!abort.signal.aborted&&(e as Error).name!=='AbortError')setFound({term:word,places:[],failed:true});});},180);
  return()=>{clearTimeout(timer);abort.abort();};},[word]);
 const close=()=>{if(box.current)box.current.open=false;setTerm('');setSearching(false);};
 const taken=new Set(choices.map(c=>c.id));
 const offer=(p:Place,shown:string)=><Link prefetch={false} key={p.id} href={hrefFor(p)} onClick={close}>{shown}{"\u00a0→"}</Link>;
 const wider=around?.wider&&!taken.has(around.wider.id)?around.wider:null,inside=(around?.inside??[]).filter(p=>!taken.has(p.id)),beside=(around?.neighbours??[]).filter(p=>!taken.has(p.id));
 const hits=found&&found.term===word?found:null;
 return <details ref={box} className="topic-part topic-part-place" onToggle={e=>{const el=e.currentTarget as HTMLDetailsElement;if(el.open)el.querySelector('.topic-domain-menu')?.scrollIntoView({block:'nearest',behavior:scrollMotion()});else{setTerm('');setSearching(false);}}}>
  <summary><span>{text}</span><DiscoveryIcon name="chevronDown"/><span className="d-sr-only"> (schimbă locul)</span></summary>
  <div className={`topic-part-menu topic-domain-menu topic-place-menu${searching?' is-searching':''}`}>
   <div className="topic-domain-head"><div><p className="topic-domain-title">Locul: {title}</p><p className="topic-domain-note">Alege alt loc sau caută unul.</p></div>
    <button type="button" className="topic-domain-close" onClick={()=>{close();box.current?.querySelector('summary')?.focus();}} aria-label="Închide"><DiscoveryIcon name="close"/></button></div>
   <label className="topic-place-find" htmlFor={id}><DiscoveryIcon name="search"/><span className="d-sr-only">Alt loc</span>
    <input id={id} type="search" value={term} placeholder="Alt județ, oraș sau comună" autoComplete="off" enterKeyHint="search" onFocus={()=>setSearching(true)} onChange={e=>setTerm(e.target.value)}
     onKeyDown={e=>{if(e.key==='Enter'&&hits?.places[0]){e.preventDefault();const to=hrefFor(hits.places[0]);close();router.push(to);}}}/></label>
   {word.length>=2?<div className="topic-place-hits" role="status" aria-busy={!hits}>{!hits?<p>Se caută…</p>:hits.places.length?hits.places.map(p=><Link prefetch={false} key={p.id} href={hrefFor(p)} onClick={close}><span>{p.name}</span><small>{p.detail}</small></Link>)
     :<p>{hits.failed?'Căutarea de locuri nu a răspuns. Încearcă din nou.':`Niciun județ sau localitate numită „${word}”.`}</p>}</div>
   :<>
    {choices.length>0&&<div className="topic-domain-more"><p>Același nume</p><div>{choices.map(c=><Link prefetch={false} key={c.id} href={c.href} onClick={close}>{c.text}{"\u00a0→"}</Link>)}</div></div>}
    {wider&&around&&<div className="topic-domain-more"><p>Mai larg</p><div>{offer(wider,wholeCounty(around.county))}</div></div>}
    {inside.length>0&&around&&<div className="topic-domain-more"><p>{around.wider?`Alte localități din ${inCounty(around.county)}`:`Mai îngust, în ${inCounty(around.county)}`}</p><div>{inside.map(p=>offer(p,p.name))}</div></div>}
    {beside.length>0&&<div className="topic-domain-more"><p>Județe vecine</p><div>{beside.map(p=>offer(p,p.name))}</div></div>}
   </>}
   <div className="topic-domain-more topic-place-out"><div><Link prefetch={false} href={out.href} onClick={close}>{out.text}{"\u00a0→"}</Link></div></div>
  </div>
 </details>;
}

/**
 * "Am înțeles": what /cauta took from the words, as one sentence (UX audit Z1-03, 16 November 2026): the interpreter's
 * own words, with the subject, the buyers, the place and the period marked where it wrote them; each opens what else it
 * can be and how to take it out. Explicit filters chosen on the page are in it as well, so it always says what is
 * searched. A part the sentence does not name is offered after it.
 */
export function Understood({scope,effective,t,place}:{scope:TopicScope;effective:TopicScope;t:TopicInterpretation;place:Place|null}){
 const fromWords=t.fromWords,placeChip=fromWords.place??(t.explicitPlace?.id===effective.place?t.explicitPlace:null)??(effective.place&&place?.id===effective.place?{id:place.id,label:place.kind==='county'?(place.name==='București'?'Municipiul București':`Județul ${place.name}`):place.name,kind:place.kind}:null);
 const literal=searchHref(withoutDomain(scope),{},true);
 // A place named alone is read as the place again: without it, the words are searched as typed.
 const removePlace=t.placeAlone?searchHref(withoutDomain(scope),{place:'',hall:false},true):fromWords.place?searchHref(scope,{q:t.applied.q,place:'',from:effective.from,to:effective.to}):searchHref(scope,{place:''});
 const period=fromWords.period??(effective.from?{from:effective.from,to:effective.to,label:periodLabel(effective.from,effective.to)}:null);
 const removePeriod=fromWords.period?searchHref(scope,{q:t.applied.q,place:effective.place,from:'',to:''}):searchHref(scope,{from:'',to:''});
 const box=useRef<HTMLElement>(null);
 // An open part closes on a click elsewhere or Escape, as the other menus of the page.
 useEffect(()=>{const el=box.current;if(!el)return;
  const outside=(e:PointerEvent)=>el.querySelectorAll<HTMLDetailsElement>('details.topic-part[open]').forEach(d=>{if(!d.contains(e.target as Node))d.open=false;});
  const esc=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;const d=el.querySelector<HTMLDetailsElement>('details.topic-part[open]');if(d){d.open=false;d.querySelector('summary')?.focus();}};
  document.addEventListener('pointerdown',outside);el.addEventListener('keydown',esc);return()=>{document.removeEventListener('pointerdown',outside);el.removeEventListener('keydown',esc);};},[]);
 if(!t.question&&!t.subject&&!placeChip&&!period&&!t.placeAmbiguous&&!t.note&&!t.notes.length){
  // Nothing applied: a reading that needs a choice of person is chosen in Întreabă. Same-named firms and
  // institutions are listed first in the results, so they need no line of their own.
  return t.problem&&t.askHref&&!t.entityChoice?<p className="topic-help topic-understood-note">{t.problem} <Link prefetch={false} href={t.askHref}>Alege în Întreabă</Link></p>:null;
 }
 // Only a note („primăria” without its locality, „la noi”): the note alone, without an empty „Am înțeles” line.
 if(!t.question&&!t.subject&&!placeChip&&!period&&!t.kind&&!t.placeAmbiguous&&!t.note)return <section className="topic-understood" aria-label="Cum am înțeles căutarea"><ReadingNotes notes={t.notes} priceHref={t.priceHref}/></section>;
 // The sentence: the question, the place's own statement, what „Pe scurt” answers; else what the lists search.
 const answered=t.answer?(t.answer.top?.sentence??t.answer.total.sentence):null;
 const sentence=t.question?.sentence??(t.placeAlone&&t.answer?placeSentence(t.answer.total.sentence):null)??answered
  ??(t.subject||placeChip||period||t.kind?`Căutăm „${effective.q}”${placeChip?` în ${placeTexts(placeChip.label)[0]}`:''}${period?`, în ${period.label}`:''}.`:null);
 type Key='subject'|'kind'|'place'|'period';
 const menus:Partial<Record<Key,{what:string;label:string;body:React.ReactNode}>>={};
 // The subject's word opens what it counts (SubjectWord); with nothing to say it is plain text, never a one-line menu.
 const chosenPart=t.subject?.chosen?t.subject.parts?.find(x=>x.code===t.subject!.chosen):undefined;
 if(t.subject&&subjectHasMenu(t.subject,t.otherSubjects.length))menus.subject={what:'ce numărăm la acest subiect',label:`Subiect: ${capital(chosenPart?.name??t.subject.label)}`,body:null};
 if(t.kind)menus.kind={what:'doar în „Pe scurt”',label:`Cine cumpără: ${t.kind.label}`,body:<>
  <p>Doar „Pe scurt” se restrânge la {t.kind.label}; titlurile sunt de la toate instituțiile.</p>
  <Link prefetch={false} href={searchHref(scope,{q:t.kind.withoutQ,place:effective.place,from:effective.from,to:effective.to})}>Scoate „{t.kind.label}”: toate instituțiile</Link></>};
 // The place's word opens the places around it (PlaceWord).
 if(placeChip)menus.place={what:'schimbă locul',label:`Loc: ${placeChip.label}`,body:null};
 // Another place for the same search: a place named alone is named again by its own name (a locality with its id, as
 // several localities may share the name); a place read beside a subject or chosen on the page is swapped in the filter.
 const placeHref=(p:Place)=>t.placeAlone?searchHref(scope,{q:p.name,place:p.kind==='county'?'':p.id,from:effective.from,to:effective.to,hall:false})
  :fromWords.place?searchHref(scope,{q:t.applied.q,place:p.id,from:effective.from,to:effective.to,hall:false}):searchHref(scope,{place:p.id,hall:false});
 if(period)menus.period={what:'schimbă perioada',label:`Perioada: ${period.label}`,body:<Link prefetch={false} href={removePeriod}>Scoate perioada: toți anii</Link>};
 const keys=(Object.keys(menus) as Key[]);
 const texts:Record<Key,string[]>={subject:t.subject?[...(chosenPart?[`„${chosenPart.name}”`,chosenPart.name]:[]),`„${t.subject.label}”`,t.subject.label]:[],kind:t.kind?[t.kind.label]:[],place:placeChip?placeTexts(placeChip.label):[],period:period?[period.label]:[]};
 const marked=sentence?markParts(sentence,keys.map(key=>({key,texts:texts[key]}))):{segments:[],missing:keys};
 const part=(key:Key,text:string)=>{const m=menus[key]!;
  if(key==='place'&&placeChip)return <PlaceWord key={key} text={text} title={/^(?:Județul|Municipiul|Orașul|Comuna)\s/.test(placeChip.label)&&placeChip.label!=='Municipiul București'?placeChip.label.charAt(0).toLocaleLowerCase('ro-RO')+placeChip.label.slice(1):placeChip.label} around={t.placeAround??null} hrefFor={placeHref}
   choices={t.placeChoices.map(c=>({id:c.id,text:c.choice,href:searchHref(scope,{q:c.q,place:c.id,from:effective.from,to:effective.to})}))}
   out={{text:t.placeAlone?`Caută „${scope.q}” în toată țara`:'Toată țara',href:removePlace}}/>;
  return key==='subject'&&t.subject?<SubjectWord key={key} text={text} scope={scope} effective={effective} subject={t.subject} others={t.otherSubjects} total={t.answer?.total.spec??null}/>:<Part key={key} text={text} what={m.what}>{m.body}</Part>;};
 // A question's „Caută exact ce ai scris” is in „Pe scurt” (or beside its question when it has none).
 const showLiteral=!t.question&&Boolean(fromWords.place||fromWords.period||t.subject||t.placeAlone);
 return <section ref={box} className="topic-understood topic-question" aria-label={t.question?'Cum am înțeles întrebarea':'Cum am înțeles căutarea'}>
  {sentence&&<div className="topic-question-line"><span className="topic-understood-label">Am înțeles:</span> <span className="topic-sentence">{marked.segments.map((x,i)=>x.key?part(x.key,x.text):<Fragment key={i}>{x.text}</Fragment>)}{marked.missing.map(key=><Fragment key={key}> · {part(key,menus[key]!.label)}</Fragment>)}</span>
   {showLiteral&&<Link prefetch={false} className="topic-understood-literal" data-only="complet" href={literal}>Caută exact ce ai scris{"\u00a0→"}</Link>}</div>}
  {chosenPart&&t.subject?.parts&&<p className="topic-domain-chosen">Un domeniu din {t.subject.parts.length} · <Link prefetch={false} scroll={false} href={searchHref(withoutDomain(scope),{})}>Arată-le pe toate</Link> <InfoMark title="Un domeniu" text={`„Pe scurt” numără doar domeniul ales, unul din cele ${t.subject.parts.length} numărate la „${t.subject.label}”. Listele de mai jos caută în continuare cuvântul, în toate domeniile.`}/></p>}
  {t.question&&!t.answer&&<div className="topic-question-actions">{t.askHref&&<Link prefetch={false} className="topic-primary" href={t.askHref}>Vezi răspunsul complet <DiscoveryIcon name="arrow"/></Link>}<Link prefetch={false} className="topic-control" href={literal}>Caută exact ce ai scris</Link></div>}
  {(!t.answer||scope.tab!=='all')&&t.subject?.notes.map(n=><p key={n} className="topic-subject-note">{n}</p>)}
  <ReadingNotes notes={t.notes} priceHref={t.priceHref}/>
  {t.note&&<p className="topic-help">{t.note}{t.askHref&&<> <Link prefetch={false} href={t.askHref}>Deschide în Întreabă</Link></>}</p>}
  {(t.placeAmbiguous||(t.note&&!placeChip))&&t.placeChoices.length>0&&<div className="topic-understood-choose"><p>{t.placeAmbiguous?'Mai multe localități au acest nume. Pe care o cauți?':'Poți căuta în titluri:'}</p><div>{t.placeChoices.map(c=><Link prefetch={false} className="topic-control" key={c.id} href={searchHref(scope,{q:c.q,place:c.id})}>{c.choice}<DiscoveryIcon name="arrow"/></Link>)}</div></div>}
 </section>;
}

type Side={entityId:string|null;name:string;value:number;count:number};
type AskData={block:'stat';stat:{value:number;count:number}}|{block:'table';rows:Side[];totals?:{value:number;count:number;entities:number}}|{block:'timeseries';series:{year:number;value:number;count:number}[]}|{block:'compare';entities:Side[]}|MapData;
/** One record of /api/ask/rows: the largest records of the selection. */
type RecordRow={title:string|null;cpvName:string|null;date:string|null;authorityId?:string|null;authority:string|null;supplierId?:string|null;supplier:string|null;value:number|null;src:'da'|'contracts';refId:string|null;contractValueFull?:string|null;nWinners?:number|null};
/** A party of a record: its name, linked to its page when the registry identifies it. */
type Party={id:string|null;name:string};
/**
 * The largest records, one per contract: /api/ask/rows lists a contract once per winner with its equal share, so a
 * contract of three winners would rank at a third of its value (re-judging, 10 November 2026). The rows of one page are
 * grouped by record, valued whole and ranked again.
 */
function largestRecords(rows:RecordRow[]):{row:RecordRow;value:number|null;suppliers:Party[]}[]{
 const byRecord=new Map<string,{row:RecordRow;value:number|null;suppliers:Party[]}>();
 const party=(r:RecordRow):Party[]=>r.supplier?[{id:r.supplierId??null,name:r.supplier}]:[];
 rows.forEach((r,n)=>{const key=r.refId?`${r.src}:${r.refId}`:`row:${n}`,whole=r.contractValueFull!=null?Number(r.contractValueFull):r.value;
  const hit=byRecord.get(key);if(hit){if(r.supplier&&!hit.suppliers.some(x=>x.name===r.supplier))hit.suppliers.push(...party(r));return;}
  byRecord.set(key,{row:r,value:whole!=null&&Number.isFinite(whole)?whole:null,suppliers:party(r)});});
 return [...byRecord.values()].sort((a,b)=>(b.value??-1)-(a.value??-1)).slice(0,3);
}
type AskOk={ok:true;data?:AskData;rows?:RecordRow[];caveats?:string[];partialYears?:{year:number;note:string}[]};
type AskReply=AskOk|{ok:false;error?:string};
type Pair={total:AskReply|null;top:AskReply|null;failed:boolean};
async function ask(spec:AskSpec):Promise<AskReply>{
 const r=await fetch('/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({spec})});
 return await r.json() as AskReply;
}
/**
 * The largest records the total counts (the list of „Vezi toate”), by the whole purchase: a contract of several winners
 * has one row per winner, so a second page is read when the first holds fewer than three purchases.
 */
async function largest(spec:AskSpec):Promise<AskReply>{
 const page=async(n:number)=>await (await fetch('/api/ask/rows',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({spec,page:n,sort:'whole',dir:'desc'})})).json() as AskReply;
 const first=await page(0);
 if(!first.ok||!first.rows||first.rows.length<10||largestRecords(first.rows).length>=3)return first;
 const second=await page(1);
 return second.ok&&second.rows?{...first,rows:[...first.rows,...second.rows]}:first;
}
type Answer=NonNullable<TopicInterpretation["answer"]>;
export const answerKey=(answer:Answer)=>JSON.stringify([answer.total.spec,answer.top?.kind??null,answer.top?.spec??null]);
// Short answers already asked in this tab (10 minutes): a search starts its answer as soon as its words are read, and
// the same subject after a tab switch, Back or a new search shows at once instead of waiting again.
const asked=new Map<string,{at:number;pair:Promise<Pair>;done?:Pair}>(),FRESH_MS=10*60*1000;
export function prefetchAnswer(answer:Answer):Promise<Pair>{
 const key=answerKey(answer),hit=asked.get(key);
 if(hit&&Date.now()-hit.at<FRESH_MS)return hit.pair;
 const entry:{at:number;pair:Promise<Pair>;done?:Pair}={at:Date.now(),pair:Promise.resolve({total:null,top:null,failed:true})};
 // The counties' total and rows are one answer (the map's): asked once.
 const total=ask(answer.total.spec);
 const top=answer.top?(answer.top.kind==='records'?largest(answer.top.spec):answer.top.kind==='counties'?total:ask(answer.top.spec)):Promise.resolve(null);
 entry.pair=Promise.all([total,top]).then(([total,top])=>({total,top,failed:false}),()=>({total:null,top:null,failed:true}));
 void entry.pair.then(pair=>{if(pair.failed)asked.delete(key);else entry.done=pair;});
 asked.delete(key);asked.set(key,entry);if(asked.size>40)asked.delete(asked.keys().next().value!);
 return entry.pair;
}
const settledAnswer=(key:string)=>{const hit=asked.get(key);return hit?.done&&Date.now()-hit.at<FRESH_MS?hit.done:null;};

/** Titles that contain the searched words, offered when the classified total is empty. */
export type TitleMatches={count:number|null;q:string;onShow:()=>void};
/** What "Pe scurt" counted, for the line that reconciles it with the title matches. */
export type AnswerCount={key:string;count:number|null}|null;


/** Where and when „Pe scurt” counted, in the words of the chips of „Am înțeles”: one line beside its title. */
export type AnswerScope={subject:string;kind:string|null;where:string;period:string;named?:boolean;who?:boolean};
/** The label above the rows: what they are, never a question (the question is in „Am înțeles”). */
const LIST_LABEL={records:'Cele mai mari achiziții',suppliers:'Cine a câștigat cel mai mult',authorities:'Cine a contractat cel mai mult',years:'Pe ani',counties:'Județele cu cele mai mari valori'} as const;
type ListKind=keyof typeof LIST_LABEL;
/** The counties' rows are ranked by the measure asked, and their label says which. */
const listLabel=(kind:ListKind,measure?:string)=>kind==='counties'&&measure==='count'?'Județele cu cele mai multe achiziții':kind==='counties'&&measure==='value_per_capita'?'Județele cu cea mai mare valoare pe locuitor':LIST_LABEL[kind];
/**
 * Whether the rows are the answer and the total their context (owner, 10 November 2026: „Pe scurt” arăta foarte prost):
 * the largest purchases, and a question that asked who or which years, whose sentence is the rows' own. A subject and a
 * „cât” question lead with the total. The rows come first in the page's order too, so a phone reads them first.
 */
const rowsLead=(answer:Answer,question:string|undefined,who=false)=>Boolean(answer.top&&!answer.top.counted&&(answer.top.kind==='records'||answer.top.kind==='counties'||(who&&(answer.top.kind==='suppliers'||answer.top.kind==='authorities'))||(question!==undefined&&answer.top.sentence===question)));
/** The first year of the archive: an evolution over all the years has one row per year from it (its ghost too). */
const FIRST_YEAR=2018;
const yearRows=(answer:Answer)=>{const f=answer.top?.spec.filters;return Math.max(2,Math.min(12,(f?.yearTo??new Date().getFullYear())-(f?.yearFrom??FIRST_YEAR)+1));};
/** The years an archive always holds in part: the first (direct acquisitions from 2 April 2018) and the current one. */
const partialLikely=(answer:Answer,i:number)=>{const year=(answer.top?.spec.filters.yearFrom??FIRST_YEAR)+i;return year===FIRST_YEAR||year===new Date().getFullYear();};
const shareText=(n:number)=>n<0.005?'sub 1%':`${Math.round(n*100)}%`;
const recordsWord=(n:number)=>countWords(n,'înregistrare','înregistrări');
/** „Iluminat exterior (31527200-8)”: the class, with its code kept on one line. */
function CpvLine({label}:{label:string}){const m=/^(.*) \((\d{8}-\d)\)$/.exec(label);return m?<>{m[1]} <code>{m[2]}</code></>:<>{label}</>;}
/** A „?” drawn inside a ghost: the same mark, nothing to focus. */
const GhostTip=()=><span className="term term-tip" aria-hidden="true"><span className="term-trigger"><span className="term-mark">?</span></span></span>;

/** „Pe scurt” and what it counted: the subject, the buyers, the place and the period, as one line. */
function AnswerHead({scope,filters,compare,townHall,institutions=false,ghost=false}:{scope:AnswerScope|undefined;filters:Answer['total']['spec']['filters'];compare:boolean;townHall:boolean;institutions?:boolean;ghost?:boolean}){
 // The words are a firm or an institution („cine cumpără de la Siepcofar”): its name, linked, not a subject.
 const party=scope?.named&&scope.subject?(filters.supplierId!==undefined?{id:filters.supplierId,role:'supplier' as const,before:'de la '}:filters.authorityId!==undefined?{id:filters.authorityId,role:'authority' as const,before:''}:null):null;
 const name=scope&&capital(scope.subject);
 const first=scope&&!compare&&name?(party?<>{party.before}{ghost?name:<EntityName id={party.id} role={party.role}>{name}</EntityName>}</>:name):null;
 // The subject, the place and the period are in „Am înțeles” right above (owner, 17 November 2026: less repeated
 // text): the line keeps only what that sentence does not say (a firm's or institution's linked name, a comparison,
 // „toate instituțiile”, „doar primăria”).
 const rest=scope&&compare?['Comparație',scope.period].filter((x):x is string=>Boolean(x)):[];
 const line=[party?first:null,...rest,...(institutions?['toate instituțiile']:[])].filter(Boolean);
 return <div className="topic-answer-head"><h2>Pe scurt</h2>{(line.length>0||townHall)&&<p className="topic-answer-scope">{line.map((x,i)=><Fragment key={i}>{i>0&&' · '}{x}</Fragment>)}{townHall&&<>{line.length>0&&' · '}<span className="topic-answer-nowrap">doar primăria {ghost?<GhostTip/>:<Term tip title="Doar primăria" text="„Pe scurt” numără doar achizițiile primăriei, fără celelalte instituții din localitate."/>}</span></>}</p>}</div>;
}

/**
 * The closing row: how the answer was counted (the CPV classes, what is left out, the limits of the calculation),
 * folded, and the ways on. The summary's words are known before the answer, so its ghost is the same line. The
 * subject's own note („Include și semnalizarea rutieră…") is the first of the limits (owner, 17 November 2026: it was a
 * box under the list). The whole row is Complet's: method, a literal search and a second way into the same records
 * („în N înregistrări” stays) (owner, 18 November 2026).
 */
function AnswerFoot({answer,caveats,literalHref,full,ghost=false}:{answer:Answer;caveats:string[];literalHref?:string|undefined;full:boolean;ghost?:boolean}){
 const n=answer.cpv.length;
 const summary=<><DiscoveryIcon name="chevronDown"/><span>Cum am numărat{n>0&&<small> · {n===1?'un domeniu\u00a0CPV':`${countWords(n,'domeniu','domenii')}\u00a0CPV`}</small>}</span></>;
 return <div className="topic-answer-foot" data-only="complet">
  {ghost?<div className="topic-answer-how"><p className="topic-answer-how-summary">{summary}</p></div>
  :<details className="topic-answer-how"><summary className="topic-answer-how-summary">{summary}</summary><div className="topic-answer-how-body">
   {n>0?<><p>Numărăm achizițiile după încadrarea oficială (CPV), nu după titlu.</p>
    <p className="topic-answer-how-head">Domenii incluse</p><ul>{answer.cpv.map(c=><li key={c}><CpvLine label={c}/></li>)}</ul>
    {answer.cpvExcluded.length>0&&<><p className="topic-answer-how-head">Fără</p><ul>{answer.cpvExcluded.map(c=><li key={c}><CpvLine label={c}/></li>)}</ul></>}</>
   :<p>Valoarea înregistrată a contractelor și a achizițiilor directe din selecție, nu plăți.</p>}
   {caveats.length>0&&<><p className="topic-answer-how-head">Limitele calculului</p><ul>{caveats.map(c=><li key={c}>{c}</li>)}</ul></>}
  </div></details>}
  <div className="topic-answer-actions">
   {literalHref&&(ghost?<a className="topic-answer-quiet"><DiscoveryIcon name="search"/>Caută exact ce ai scris</a>:<Link prefetch={false} className="topic-answer-quiet" href={literalHref}><DiscoveryIcon name="search"/>Caută exact ce ai scris</Link>)}
   {full&&(ghost?<a className="topic-answer-go">Răspunsul complet în Întreabă <DiscoveryIcon name="arrow"/></a>:<Link prefetch={false} className="topic-answer-go" href={answer.href}>Răspunsul complet în Întreabă <DiscoveryIcon name="arrow"/></Link>)}
  </div>
 </div>;
}

/**
 * Short answer through the Ask engine (owner, 10 November 2026: „Pe scurt” arăta foarte prost uneori): what was
 * counted, in one line beside the title; the rows the question asked for (the largest purchases, who won or bought
 * most, the years, the two sides of a comparison), each on one grid row with its value on its first line; the total
 * with its records; how it was counted, folded. `literalHref` (a whole question) adds "Caută exact ce ai scris";
 * `titles` is the alternative offered when nothing is classified there.
 */
export function SubjectAnswer({answer,scope,notes=[],literalHref,titles,onCount,asked:question}:{answer:Answer;scope?:AnswerScope|undefined;asked?:string|undefined;notes?:string[];literalHref?:string|undefined;titles?:TitleMatches|undefined;onCount?:(c:AnswerCount)=>void}){
 const key=answerKey(answer);
 const labelId=useId();
 const [state,setState]=useState<{key:string}&Pair|null>(null);
 useEffect(()=>{let live=true;void prefetchAnswer(answer).then(pair=>{if(live)setState({key,...pair});});return()=>{live=false;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 const done=settledAnswer(key),ready=state?.key===key?state:done?{key,...done}:null;
 const data=(r:AskReply|null|undefined)=>r?.ok?r.data:undefined;
 const totalData=data(ready?.total),topData=data(ready?.top);
 const mapData=topData?.block==='map'?topData:null,measure=answer.top?.spec.measure;
 const total=totalData?.block==='stat'?totalData.stat:answer.top?.kind==='counties'&&mapData?mapTotal(mapData):null;
 // „compară X cu Y”: both sides are the answer, each with its records
 const sides=totalData?.block==='compare'?totalData.entities:null;
 const kind:ListKind|null=answer.top?.kind??null;
 const rows=topData?.block==='table'?topData.rows:null;
 const years=topData?.block==='timeseries'?topData.series.filter(y=>y.count>0):null;
 const records=kind==='records'&&ready?.top?.ok&&ready.top.rows?largestRecords(ready.top.rows):null;
 const counties=kind==='counties'&&mapData?countyRows(mapData,measure):null;
 // „câte firme…”, „câte primării…” (owner, 23 November 2026): the number of them is the figure, the first three under it.
 const entities=answer.top?.counted&&topData?.block==='table'?topData.totals?.entities??null:null;
 const shape=sides?(sides.some(x=>x.count>0)?'value':'empty'):answerShape(total);
 // Reported once answered (null count: no total), so the page knows when to stop waiting for it.
 useEffect(()=>{onCount?.(ready?{key,count:total?.count??null}:null);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,Boolean(ready),total?.count]);
 const filters=answer.total.spec.filters;
 const compare=answer.total.spec.block==='compare';
 const led=rowsLead(answer,question,scope?.who);
 // The answer counts only a town hall, while the titles below cover every institution of the locality.
 const townHall=filters.uatSiruta!==undefined;
 // a locality's institutions, as a precise selection (lib/topic-search/interpretation.ts withLocalityInstitutions)
 const institutions=answer.institutions===true;
 const head=<AnswerHead scope={scope} filters={filters} compare={compare} townHall={townHall} institutions={institutions} ghost={!ready}/>;
 if(!ready)return <AnswerGhost head={head} answer={answer} kind={kind} led={led} compare={compare} notes={notes} literal={Boolean(literalHref)}/>;
 // The same limits /intreaba shows for these specs.
 const caveats=[...new Set([...(ready.total?.ok?ready.total.caveats??[]:[]),...(ready.top?.ok?ready.top.caveats??[]:[])])];
 const titleCount=titles?.count??0;
 const role=kind==='authorities'?'authority':'supplier';
 // A period of one year needs no year on each purchase.
 const oneYear=filters.yearFrom!==undefined&&filters.yearFrom===filters.yearTo;
 const partial=new Map(((ready.top?.ok?ready.top.partialYears:undefined)??(ready.total?.ok?ready.total.partialYears:undefined)??[]).map(p=>[p.year,p.note]));
 const bar=(fraction:number,i:number,extra='')=><span className="topic-answer-bar" aria-hidden="true"><span className={`cm-x${extra}`} style={{width:`${Math.max(0,Math.min(100,fraction*100))}%`,'--i':i} as React.CSSProperties}/></span>;
 const items=kind==='records'?(records?.length?records.map(({row:r,value,suppliers},i)=>{
   const title=r.title||r.cpvName||'Titlu neprecizat în sursă',winners=r.nWinners??1,shown=suppliers.slice(0,Math.max(winners,suppliers.length)>2?1:2),more=Math.max(winners,suppliers.length)-shown.length;
   return <li key={`${r.src}:${r.refId??i}`} className="topic-answer-row is-record">
    <span className="topic-answer-rank" aria-hidden="true">{i+1}</span>
    <span className="topic-answer-what">
     {r.refId?<Link prefetch={false} className="topic-answer-title" title={title} href={r.src==='contracts'?`/contracte/i/${r.refId}`:`/achizitii/${r.refId}`}>{title}</Link>:<span className="topic-answer-title">{title}</span>}
     <small className="topic-answer-parties">{r.authority&&<span className="topic-answer-buyer"><EntityName id={r.authorityId} role="authority" title={titleName(r.authority)}>{cleanName(r.authority)}</EntityName></span>}
      {shown.length>0&&<> → {shown.map((x,k)=><Fragment key={x.name}>{k>0&&', '}<EntityName id={x.id} role="supplier">{cleanName(x.name)}</EntityName></Fragment>)}</>}
      {more>0&&<> și încă {more}</>}{!oneYear&&r.date&&<> · {r.date.slice(0,4)}</>}</small>
    </span>
    <span className="topic-answer-amount">{value!=null?formatRon(value):'–'}{winners>1&&<small><Term hold="line" tip title="Contract întreg" text={`${winners} câștigători. Arătăm valoarea întregului contract, o singură dată, nu partea fiecăruia.`}>contract întreg</Term></small>}</span>
   </li>;}):null)
  :kind==='years'?(years&&years.length>1?(()=>{const max=Math.max(0,...years.map(y=>y.value));return years.map((y,i)=>{const note=partial.get(y.year);
   return <li key={y.year} className="topic-answer-row is-year">
    <span className="topic-answer-year">{y.year}{note&&<small><Term hold="line" tip title="An parțial" text={note}>parțial</Term></small>}</span>
    {bar(max>0?y.value/max:0,i,note?' is-partial':'')}
    <span className="topic-answer-amount">{formatRon(y.value)}</span><span className="topic-answer-n">{recordsWord(y.count)}</span>
   </li>;});})():null)
  :kind==='counties'?(counties?.length?counties.map((c,i)=>{const name=countyName(c.county),href=countyHref(answer.top!.spec,name);
   const whole=total?(measure==='count'?total.count:total.value):0,part=measure!=='value_per_capita'&&whole>0?(measure==='count'?c.count:c.value)/whole:null;
   return <li key={c.county} className="topic-answer-row">
    <span className="topic-answer-rank" aria-hidden="true">{i+1}</span>
    <span className="topic-answer-what">{href?<Link prefetch={false} href={href}>{name}</Link>:name}
     <small data-only="complet">{measure==='count'?formatRon(c.value):recordsWord(c.count)}{part!=null&&<> · {shareText(part)} din total</>}</small></span>
    <span className="topic-answer-amount">{measure==='count'?recordsWord(c.count):measure==='value_per_capita'?<>{formatInt(Math.round(c.metric))} lei<small>pe locuitor</small></>:formatRon(c.value)}</span>
   </li>;}):null)
  :kind&&rows?.length?rows.map((r,i)=>{const part=total&&total.value>0?r.value/total.value:null;
   return <li key={r.entityId??r.name} className="topic-answer-row">
    <span className="topic-answer-rank" aria-hidden="true">{i+1}</span>
    <span className="topic-answer-what"><EntityName id={r.entityId} role={role}>{cleanName(r.name)}</EntityName>
     <small data-only="complet">{recordsWord(r.count)}{part!=null&&<> · {shareText(part)} din total</>}</small></span>
    <span className="topic-answer-amount">{formatRon(r.value)}</span>
   </li>;}):null;
 // `data-answer` below: how „Pe scurt” ended. Under a whole question Esențial hides the word lists unless it failed or
 // found nothing (esential-cauta-domenii.css; owner, 18 November 2026).
 const list=kind&&items?<div className="topic-answer-main"><p className="topic-answer-label" id={labelId}>{listLabel(kind,measure)}</p><ol className={`topic-answer-list is-${kind}`} role="list" aria-labelledby={labelId} data-chart="">{items}</ol></div>:null;
 const rail=total&&<div className="topic-answer-rail">
  {led&&list&&<p className="topic-answer-label">Total</p>}
  {entities!=null&&<p className="topic-answer-value"><strong>{countWords(entities,...entityNouns(role,filters.authorityKind))}</strong></p>}
  {entities==null&&<p className="topic-answer-value">{shape==='value'?<><strong title={formatRonFull(total.value)}>{formatRon(total.value)}</strong><InfoMark title="Valoare înregistrată" text="Valoarea înregistrată a contractelor și achizițiilor directe, nu plăți."/></>:<strong>{recordsWord(total.count)}</strong>}</p>}
  <p className="topic-answer-count">{shape==='value'&&(entities!=null?`${formatRon(total.value)} în `:'în ')}<Link prefetch={false} href={answer.evidenceHref}>{shape==='value'?recordsWord(total.count):total.count===1?'Vezi înregistrarea':'Vezi înregistrările'} <DiscoveryIcon name="arrow"/></Link></p>
  {shape!=='value'&&<p className="topic-answer-sub">fără valoare înregistrată</p>}
 </div>;
 const failed=ready.failed||(!total&&!sides);
 return <section className="topic-answer g-content" aria-label="Răspuns pe scurt" data-answer={failed?'failed':shape}>
  {head}
  {failed?<p className="topic-help" role="status">Răspunsul pe scurt nu este disponibil acum. {ready.total&&!ready.total.ok&&ready.total.error?ready.total.error:''}</p>
   :shape==='empty'?<><div className="topic-answer-empty" role="status"><p className="topic-answer-empty-line">{answer.empty}</p>
     {titles&&titleCount>0&&<p className="topic-answer-alternative"><button type="button" className="topic-text-button" onClick={titles.onShow}>{titleCount===1?`Un titlu conține „${titles.q}”`:`${countWords(titleCount,'titlu','titluri')} conțin „${titles.q}”`}: vezi {titleCount===1?'achiziția':'achizițiile'} <DiscoveryIcon name="arrow"/></button></p>}
     {answer.domains&&<p className="topic-answer-alternative"><Link prefetch={false} href={answer.domains.href}>{answer.domains.label} <DiscoveryIcon name="arrow"/></Link></p>}</div></>
   :sides?(()=>{const max=Math.max(0,...sides.map(x=>x.value));return <><ol className="topic-answer-sides" role="list" data-chart="">{sides.map((x,i)=><li key={x.entityId??x.name}>
     <EntityName id={x.entityId}>{cleanName(x.name)}</EntityName>
     <strong className="topic-answer-side-value">{x.count?formatRon(x.value):'nicio achiziție'}</strong>
     <small>{x.count?`în ${recordsWord(x.count)}`:' '}</small>
     {bar(max>0?x.value/max:0,i)}
    </li>)}</ol></>;})()
   :<><div className={`topic-answer-body${list?' has-list':''}${led&&list?' is-led':''}`}>{led?<>{list}{rail}</>:<>{rail}{list}</>}</div></>}
  <AnswerFoot answer={answer} caveats={[...notes,...caveats]} literalHref={literalHref} full={!failed&&shape!=='empty'}/>
 </section>;
}
/*
 * "Pe scurt" while its two Ask answers load (owner, 6 November 2026: "ghost data loading"): the answer's own shape,
 * with what the words already tell real (the title and its line, the labels, the ranks, the notes, the closing row)
 * and pulsing lines for the values, names and titles. The rows the answer will have are known from its kind: three,
 * or one per year of the period; a purchase keeps its title's and parties' reserved lines. It appears after 120 ms,
 * so an answer already asked never flashes it. Nothing in a ghost takes focus.
 */
function AnswerGhost({head,answer,kind,led,compare,notes,literal}:{head:React.ReactNode;answer:Answer;kind:ListKind|null;led:boolean;compare:boolean;notes:string[];literal:boolean}){
 const widths=[58,46,52,40,54,44,50,38,56,42,48,36];
 const n=kind==='years'?yearRows(answer):3;
 const list=kind&&<div className="topic-answer-main"><p className="topic-answer-label">{listLabel(kind,answer.top?.spec.measure)}</p>
  <ol className={`topic-answer-list is-${kind}`} role="list" aria-hidden="true">{Array.from({length:n},(_,i)=>kind==='years'
   ?<li key={i} className="topic-answer-row is-year"><span className="topic-answer-year"><G.Line inline w="2.4em"/>{partialLikely(answer,i)&&<small><G.Line inline w="4.5em"/></small>}</span><span className="topic-answer-bar"/><span className="topic-answer-amount"><G.Line inline w="5em"/></span><span className="topic-answer-n"><G.Line inline w="7em"/></span></li>
   :<li key={i} className={`topic-answer-row${kind==='records'?' is-record':''}`}><span className="topic-answer-rank">{i+1}</span>
    <span className="topic-answer-what">{kind==='records'
     ?<><span className="topic-answer-title"><G.Line w="96%"/><G.Line w={`${widths[i]}%`}/><G.Line w="30%" only="phone"/></span><small className="topic-answer-parties"><G.Line w="64%"/><G.Line w="40%" only="phone"/></small></>
     :<><span><G.Line w={`${widths[i]}%`}/></span><small data-only="complet"><G.Line inline w="11em"/></small></>}</span>
    <span className="topic-answer-amount"><G.Line inline w="5em"/></span></li>)}</ol></div>;
 const rail=<div className="topic-answer-rail">{led&&list&&<p className="topic-answer-label">Total</p>}
  <p className="topic-answer-value"><strong><G.Line w="5.4em"/></strong></p>
  <p className="topic-answer-count"><G.Line w="9em"/></p></div>;
 return <Ghost as="section" className="topic-answer" name="topic-answer" wait="client" label="Se calculează răspunsul pe scurt…">
  {head}
  {compare?<><ol className="topic-answer-sides" role="list" aria-hidden="true">{[52,44].map(w=><li key={w}><span><G.Line w={`${w}%`}/></span><strong className="topic-answer-side-value"><G.Line inline w="5em"/></strong><small><G.Line inline w="9em"/></small><span className="topic-answer-bar"/></li>)}</ol></>
  :<><div className={`topic-answer-body${list?' has-list':''}${led&&list?' is-led':''}`}>{led?<>{list}{rail}</>:<>{rail}{list}</>}</div></>}
  <AnswerFoot answer={answer} caveats={[]} literalHref={literal?'#':undefined} full ghost/>
 </Ghost>;
}

/**
 * Before the words are read (UX audit Z1-10, 16 November 2026): the places of „Am înțeles” and „Pe scurt”, in their
 * shapes, with lines for every word that depends on the reading, so the tabs stay where they will be when it arrives.
 * A reading without „Pe scurt” gives its place back.
 */
export function ReadingGhost({answer}:{answer:boolean}){
 return <>
  <Ghost as="section" className="topic-understood topic-question" name="topic-understood" wait="client" label="Citim căutarea…"><div className="topic-question-line"><span className="topic-understood-label">Am înțeles:</span> <span className="topic-sentence topic-g-fill"><G.Line w="56%" only="not-phone"/><G.Lines w={[]} phone={['96%','88%','42%']}/></span><span className="topic-understood-literal g-phone" data-only="complet" aria-hidden="true"><G.Line inline w="10em"/></span></div></Ghost>
  {answer&&<Ghost as="section" className="topic-answer" name="topic-answer" wait="client">
   <div className="topic-answer-head"><h2><G.Line inline w="4.2em"/></h2><p className="topic-answer-scope"><G.Line inline w="14em"/></p></div>
   <div className="topic-answer-body has-list"><div className="topic-answer-rail"><p className="topic-answer-label"><G.Line inline w="3em"/></p><p className="topic-answer-value"><strong><G.Line w="5.4em"/></strong></p><p className="topic-answer-count"><G.Line w="9em"/></p></div>
    <div className="topic-answer-main"><p className="topic-answer-label"><G.Line inline w="8em"/></p><ol className="topic-answer-list is-suppliers" role="list" aria-hidden="true">{[58,46,52].map((w,i)=><li key={i} className="topic-answer-row"><span className="topic-answer-rank">{i+1}</span><span className="topic-answer-what"><span><G.Line w={`${w}%`}/></span><small data-only="complet"><G.Line inline w="11em"/></small></span><span className="topic-answer-amount"><G.Line inline w="5em"/></span></li>)}</ol></div></div>
   <div className="topic-answer-foot" data-only="complet"><div className="topic-answer-how"><p className="topic-answer-how-summary"><G.Line inline w="9em"/></p></div><div className="topic-answer-actions"><G.Line inline w="13em"/></div></div>
  </Ghost>}
 </>;
}

/** No title matched: wider selections to try, without guessing. */
export function Broader({scope,effective,t,place,onDocuments}:{scope:TopicScope;effective:TopicScope;t:TopicInterpretation|null;place:Place|null;onDocuments:()=>void}){
 const [related,setRelated]=useState<{q:string;items:string[]}|null>(null);
 // Never from a question or connector word ("cine" → "Porcine"); only names that share a real word.
 const first=relatedWord(effective.q);
 useEffect(()=>{if(!first)return;const abort=new AbortController();
  void fetch(`/api/suggest?q=${encodeURIComponent(first)}`,{signal:abort.signal}).then(r=>r.ok?r.json() as Promise<SuggestResponse>:null).then(d=>{if(!abort.signal.aborted&&d)setRelated({q:first,items:relatedSubjects(first,d.cpv.map(c=>/^\d/.test(c.term)?c.cpvName??'':c.term).filter(Boolean))});}).catch(()=>{});
  return()=>abort.abort();},[first]);
 const county=place?.kind==='locality'?place.detail.split(' · ')[1]:null;
 const subjects=[...(t?.otherSubjects.map(s=>s.label)??[]),...(related?.q===first?related.items:[])].filter((s,i,a)=>a.findIndex(x=>x.toLowerCase()===s.toLowerCase())===i&&s.toLowerCase()!==effective.q.toLowerCase()).slice(0,4);
 const asks=Boolean(t?.trusted&&!t.question&&t.sentence&&t.askHref);
 // Esențial keeps the wider searches and Întreabă; the document search and the related subjects are Complet's, and a
 // list left with nothing is not drawn there (owner, 18 November 2026).
 const kept=Boolean(county||effective.place||effective.from||t?.alsoTry.length||asks);
 return <div className="topic-broader" data-only={kept?undefined:'complet'}><p>Încearcă mai larg:</p><ul>
  {county&&<li><Link prefetch={false} href={searchHref(scope,{q:effective.q,place:`county:${fold(county)}`,from:effective.from,to:effective.to})}>„{effective.q}” în tot județul</Link></li>}
  {effective.place&&<li><Link prefetch={false} href={searchHref(scope,{q:effective.q,place:'',from:effective.from,to:effective.to})}>„{effective.q}” în toată țara</Link></li>}
  {effective.from&&<li><Link prefetch={false} href={searchHref(scope,{q:effective.q,place:effective.place,from:'',to:''})}>„{effective.q}” în toți anii</Link></li>}
  {t?.alsoTry.map(w=><li key={w}><Link prefetch={false} href={searchHref(scope,{q:w,place:effective.place,from:effective.from,to:effective.to})}>Doar „{w}”</Link></li>)}
  {asks&&t?.askHref&&<li><Link prefetch={false} href={t.askHref}>Întreabă: {t.sentence}</Link></li>}
  <li data-only="complet"><button type="button" className="topic-text-button" onClick={onDocuments}>Caută „{effective.q}” în documentele pregătite</button></li>
  {subjects.map(s=><li key={s} data-only="complet"><Link prefetch={false} href={searchHref(scope,{q:s,place:effective.place,from:effective.from,to:effective.to})}>Subiect apropiat: {capital(s)}</Link></li>)}
 </ul></div>;
}
