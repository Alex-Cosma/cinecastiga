'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import DiscoveryIcon from '../DiscoveryIcon';
import {cleanName,formatInt,formatRon,formatRonFull} from '@/lib/format';
import type {AskSpec} from '@/lib/ask/spec';
import type {SuggestResponse} from '@/app/api/suggest/route';
import type {TopicInterpretation} from '@/lib/topic-search/interpretation';
import {topicParams,type Place,type TopicScope} from '@/lib/topic-search/shared';

const capital=(s:string)=>s.charAt(0).toLocaleUpperCase('ro-RO')+s.slice(1);
/** A /cauta link for the same selection with some parts changed. */
export const searchHref=(scope:TopicScope,patch:Partial<TopicScope>,literal=false)=>{const p=topicParams({...scope,tab:'all',page:1,role:'',...patch});if(literal)p.set('literal','1');return `/cauta?${p}`;};
const periodLabel=(from:string,to:string)=>from===to?from:`${from}–${to}`;

/**
 * "Am înțeles": what /cauta took from the words, as chips the person can
 * remove or change. Explicit filters chosen on the page are shown as well,
 * so the line always says what is searched.
 */
export function Understood({scope,effective,t,place}:{scope:TopicScope;effective:TopicScope;t:TopicInterpretation;place:Place|null}){
 const fromWords=t.fromWords,placeChip=fromWords.place??(t.explicitPlace?.id===effective.place?t.explicitPlace:null)??(effective.place&&place?.id===effective.place?{id:place.id,label:place.kind==='county'?(place.name==='București'?'Municipiul București':`Județul ${place.name}`):place.name,kind:place.kind}:null);
 const removePlace=fromWords.place?searchHref(scope,{q:t.applied.q,place:'',from:effective.from,to:effective.to}):searchHref(scope,{place:''});
 const period=fromWords.period??(effective.from?{from:effective.from,to:effective.to}:null);
 const removePeriod=fromWords.period?searchHref(scope,{q:t.applied.q,place:effective.place,from:'',to:''}):searchHref(scope,{from:'',to:''});
 const literal=searchHref(scope,{},true);
 if(!t.subject&&!placeChip&&!period&&!t.placeAmbiguous){
  // Nothing applied: a reading that needs a choice (same-named firms or persons) is chosen in Întreabă.
  return t.problem&&t.askHref?<p className="topic-help topic-understood-note">{t.problem} <Link prefetch={false} href={t.askHref}>Alege în Întreabă</Link></p>:null;
 }
 return <section className="topic-understood" aria-label="Cum am înțeles căutarea">
  <div className="topic-understood-line"><span className="topic-understood-label">Am înțeles:</span>
   <ul className="topic-chips">
    {t.subject&&<li className="topic-chip"><span>Subiect:</span> <strong title={t.subject.cpvName??undefined}>{capital(t.subject.label)}</strong>
     <details className="topic-chip-menu"><summary aria-label={`Schimbă subiectul „${t.subject.label}”`}><DiscoveryIcon name="chevronDown"/></summary><div>
      {t.otherSubjects.map(s=><Link prefetch={false} key={s.label} href={searchHref(scope,{q:s.label,place:effective.place,from:effective.from,to:effective.to})}>Subiect: {capital(s.label)}</Link>)}
      <Link prefetch={false} href={literal}>Nu e un subiect: caută exact cuvintele scrise</Link>
     </div></details></li>}
    {placeChip&&<li className="topic-chip"><span>Loc:</span> <strong>{placeChip.label}</strong>
     {t.placeChoices.length>0&&<details className="topic-chip-menu"><summary aria-label={`Schimbă locul „${placeChip.label}”`}><DiscoveryIcon name="chevronDown"/></summary><div>
      {t.placeChoices.map(c=><Link prefetch={false} key={c.id} href={searchHref(scope,{q:c.q,place:c.id,from:effective.from,to:effective.to})}>{c.choice}</Link>)}
     </div></details>}
     <Link prefetch={false} className="topic-chip-remove" href={removePlace} aria-label={`Scoate locul „${placeChip.label}”: caută în toată țara`}><DiscoveryIcon name="close"/></Link></li>}
    {period&&<li className="topic-chip"><span>Perioada:</span> <strong>{periodLabel(period.from,period.to)}</strong><Link prefetch={false} className="topic-chip-remove" href={removePeriod} aria-label="Scoate perioada: toți anii"><DiscoveryIcon name="close"/></Link></li>}
   </ul>
  </div>
  {t.placeAmbiguous&&t.placeChoices.length>0&&<div className="topic-understood-choose"><p>Mai multe localități au acest nume. Pe care o cauți?</p><div>{t.placeChoices.map(c=><Link prefetch={false} className="topic-control" key={c.id} href={searchHref(scope,{q:c.q,place:c.id})}>{c.choice}<DiscoveryIcon name="arrow"/></Link>)}</div></div>}
  {fromWords.place||fromWords.period?<p className="topic-help">Căutăm „{t.applied.q}” în titluri, cu {[fromWords.place?'locul':null,fromWords.period?'perioada':null].filter(Boolean).join(' și ')} din cuvintele tale ca filtru. <Link prefetch={false} href={literal}>Caută exact ce ai scris</Link></p>
   :t.subject?<p className="topic-help"><Link prefetch={false} href={literal}>Caută exact ce ai scris, fără interpretare</Link></p>:null}
 </section>;
}

type AskOk={ok:true;data:{block:'stat';stat:{value:number;count:number}}|{block:'table';rows:{entityId:string|null;name:string;value:number;count:number}[]};pills?:string[]};
type AskReply=AskOk|{ok:false;error?:string};
async function ask(spec:AskSpec,signal:AbortSignal):Promise<AskReply>{
 const r=await fetch('/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({spec}),signal});
 return await r.json() as AskReply;
}

/** Short subject answer through the Ask engine: total recorded value and the first three winners. */
export function SubjectAnswer({answer}:{answer:NonNullable<TopicInterpretation['answer']>}){
 const key=JSON.stringify([answer.total.spec,answer.top.spec]);
 const [state,setState]=useState<{key:string;total:AskReply|null;top:AskReply|null;failed:boolean}|null>(null);
 useEffect(()=>{const abort=new AbortController();
  Promise.all([ask(answer.total.spec,abort.signal),ask(answer.top.spec,abort.signal)]).then(([total,top])=>{if(!abort.signal.aborted)setState({key,total,top,failed:false});},()=>{if(!abort.signal.aborted)setState({key,total:null,top:null,failed:true});});
  return()=>abort.abort();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 const ready=state?.key===key?state:null;
 const total=ready?.total?.ok&&ready.total.data.block==='stat'?ready.total.data.stat:null;
 const rows=ready?.top?.ok&&ready.top.data.block==='table'?ready.top.data.rows:null;
 const cpv=ready?.top?.ok?ready.top.pills?.find(p=>/\(\d{8}-\d\)/.test(p))??null:null;
 return <section className="topic-answer" aria-label="Răspuns pe scurt" aria-busy={!ready}>
  <h2>Pe scurt</h2>
  <p className="topic-answer-question">{answer.total.sentence}</p>
  {!ready?<p className="topic-answer-wait" role="status"><span className="topic-spinner" aria-hidden="true"/>Calculăm în Întreabă…</p>
   :ready.failed||!total?<p className="topic-help" role="status">Răspunsul pe scurt nu este disponibil acum. {ready.total&&!ready.total.ok&&ready.total.error?ready.total.error:''}</p>
   :<><p className="topic-answer-value"><strong title={formatRonFull(total.value)}>{formatRon(total.value)}</strong><span>în {formatInt(total.count)} {total.count===1?'achiziție':'achiziții'} · valoare înregistrată, nu plăți</span></p>
    {rows&&rows.length>0&&<><p className="topic-answer-question">{answer.top.sentence}</p><ol className="topic-answer-top">{rows.map(r=><li key={r.entityId??r.name}>{r.entityId?<Link prefetch={false} href={`/entitati/${r.entityId}?rol=furnizor`}>{cleanName(r.name)}</Link>:<span>{cleanName(r.name)}</span>}<span>{formatRon(r.value)}</span></li>)}</ol></>}
    {cpv&&<p className="topic-help">Domenii incluse: {cpv}.</p>}</>}
  <Link prefetch={false} className="topic-answer-link" href={answer.href}>Vezi răspunsul complet în Întreabă <DiscoveryIcon name="arrow"/></Link>
 </section>;
}

/** No title matched: wider selections to try, without guessing. */
export function Broader({scope,effective,t,place,onDocuments}:{scope:TopicScope;effective:TopicScope;t:TopicInterpretation|null;place:Place|null;onDocuments:()=>void}){
 const [related,setRelated]=useState<{q:string;items:string[]}|null>(null);
 const first=effective.q.split(/\s+/).find(w=>w.length>=3)??'';
 useEffect(()=>{if(!first)return;const abort=new AbortController();
  void fetch(`/api/suggest?q=${encodeURIComponent(first)}`,{signal:abort.signal}).then(r=>r.ok?r.json() as Promise<SuggestResponse>:null).then(d=>{if(!abort.signal.aborted&&d)setRelated({q:first,items:d.cpv.map(c=>/^\d/.test(c.term)?c.cpvName??'':c.term).filter(Boolean)});}).catch(()=>{});
  return()=>abort.abort();},[first]);
 const county=place?.kind==='locality'?place.detail.split(' · ')[1]:null;
 const subjects=[...(t?.otherSubjects.map(s=>s.label)??[]),...(related?.q===first?related.items:[])].filter((s,i,a)=>a.findIndex(x=>x.toLowerCase()===s.toLowerCase())===i&&s.toLowerCase()!==effective.q.toLowerCase()).slice(0,4);
 return <div className="topic-broader"><p>Încearcă mai larg:</p><ul>
  {county&&<li><Link prefetch={false} href={searchHref(scope,{q:effective.q,place:`county:${county}`,from:effective.from,to:effective.to})}>„{effective.q}” în tot județul</Link></li>}
  {effective.place&&<li><Link prefetch={false} href={searchHref(scope,{q:effective.q,place:'',from:effective.from,to:effective.to})}>„{effective.q}” în toată țara</Link></li>}
  {effective.from&&<li><Link prefetch={false} href={searchHref(scope,{q:effective.q,place:effective.place,from:'',to:''})}>„{effective.q}” în toți anii</Link></li>}
  {t?.sentence&&t.askHref&&<li><Link prefetch={false} href={t.askHref}>Întreabă: {t.sentence}</Link></li>}
  <li><button type="button" className="topic-text-button" onClick={onDocuments}>Caută „{effective.q}” în documentele pregătite</button></li>
  {subjects.map(s=><li key={s}><Link prefetch={false} href={searchHref(scope,{q:s,place:effective.place,from:effective.from,to:effective.to})}>Subiect apropiat: {capital(s)}</Link></li>)}
 </ul></div>;
}
