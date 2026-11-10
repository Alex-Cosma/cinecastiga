'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import DiscoveryIcon from '../DiscoveryIcon';
import Term from '@/components/Term';
import {G,Ghost} from '@/components/ghost/Ghost';
import {cleanName,formatInt,formatRon,formatRonFull} from '@/lib/format';
import type {AskSpec} from '@/lib/ask/spec';
import type {SuggestResponse} from '@/app/api/suggest/route';
import type {TopicInterpretation} from '@/lib/topic-search/interpretation';
import {answerShape,topicParams,type Place,type TopicScope} from '@/lib/topic-search/shared';
import {relatedSubjects,relatedWord} from '@/lib/topic-search/related';

const capital=(s:string)=>s.charAt(0).toLocaleUpperCase('ro-RO')+s.slice(1);
/** A /cauta link for the same selection with some parts changed. */
export const searchHref=(scope:TopicScope,patch:Partial<TopicScope>,literal=false)=>{const p=topicParams({...scope,tab:'all',page:1,role:'',...patch});if(literal)p.set('literal','1');return `/cauta?${p}`;};
const periodLabel=(from:string,to:string)=>from===to?from:`${from}–${to}`;

/** What the reading dropped or narrowed, said under it (a place that cannot be left out, the first of two years…). */
function ReadingNotes({notes}:{notes:string[]}){
 return notes.length?<>{notes.map(n=><p key={n} className="topic-help topic-reading-note">{n}</p>)}</>:null;
}

/**
 * "Am înțeles": what /cauta took from the words, as chips the person can
 * remove or change. Explicit filters chosen on the page are shown as well,
 * so the line always says what is searched.
 */
export function Understood({scope,effective,t,place}:{scope:TopicScope;effective:TopicScope;t:TopicInterpretation;place:Place|null}){
 const fromWords=t.fromWords,placeChip=fromWords.place??(t.explicitPlace?.id===effective.place?t.explicitPlace:null)??(effective.place&&place?.id===effective.place?{id:place.id,label:place.kind==='county'?(place.name==='București'?'Municipiul București':`Județul ${place.name}`):place.name,kind:place.kind}:null);
 const removePlace=fromWords.place?searchHref(scope,{q:t.applied.q,place:'',from:effective.from,to:effective.to}):searchHref(scope,{place:''});
 const period=fromWords.period??(effective.from?{from:effective.from,to:effective.to,label:periodLabel(effective.from,effective.to)}:null);
 const removePeriod=fromWords.period?searchHref(scope,{q:t.applied.q,place:effective.place,from:'',to:''}):searchHref(scope,{from:'',to:''});
 const literal=searchHref(scope,{},true);
 // A whole question: the interpreter's sentence is what is answered; the words are searched as written below.
 if(t.question)return <section className="topic-understood topic-question" aria-label="Cum am înțeles întrebarea">
  <p className="topic-question-line"><span className="topic-understood-label">Am înțeles:</span> <strong>{t.question.sentence}</strong></p>
  <ReadingNotes notes={t.notes}/>
  {!t.answer&&<div className="topic-question-actions">{t.askHref&&<Link prefetch={false} className="topic-primary" href={t.askHref}>Vezi răspunsul complet <DiscoveryIcon name="arrow"/></Link>}<Link prefetch={false} className="topic-control" href={literal}>Caută exact ce ai scris</Link></div>}
 </section>;
 if(!t.subject&&!placeChip&&!period&&!t.placeAmbiguous&&!t.note&&!t.notes.length){
  // Nothing applied: a reading that needs a choice of person is chosen in Întreabă. Same-named firms and
  // institutions are listed first in the results, so they need no line of their own.
  return t.problem&&t.askHref&&!t.entityChoice?<p className="topic-help topic-understood-note">{t.problem} <Link prefetch={false} href={t.askHref}>Alege în Întreabă</Link></p>:null;
 }
 // Only a note („primăria” without its locality, „la noi”): the note alone, without an empty „Am înțeles” line.
 if(!t.subject&&!placeChip&&!period&&!t.kind&&!t.placeAmbiguous&&!t.note)return <section className="topic-understood" aria-label="Cum am înțeles căutarea"><ReadingNotes notes={t.notes}/></section>;
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
    {t.kind&&<li className="topic-chip"><span>Cine cumpără:</span> <strong>{t.kind.label}</strong><small className="topic-chip-scope">doar în „Pe scurt”</small><Link prefetch={false} className="topic-chip-remove" href={searchHref(scope,{q:t.kind.withoutQ,place:effective.place,from:effective.from,to:effective.to})} aria-label={`Scoate „${t.kind.label}”: toate instituțiile`}><DiscoveryIcon name="close"/></Link></li>}
    {period&&<li className="topic-chip"><span>Perioada:</span> <strong>{period.label}</strong><Link prefetch={false} className="topic-chip-remove" href={removePeriod} aria-label="Scoate perioada: toți anii"><DiscoveryIcon name="close"/></Link></li>}
   </ul>
  </div>
  {(!t.answer||scope.tab!=='all')&&t.subject?.notes.map(n=><p key={n} className="topic-subject-note">{n}</p>)}
  <ReadingNotes notes={t.notes}/>
  {t.note&&<p className="topic-help">{t.note}{t.askHref&&<> <Link prefetch={false} href={t.askHref}>Deschide în Întreabă</Link></>}</p>}
  {(t.placeAmbiguous||(t.note&&!placeChip))&&t.placeChoices.length>0&&<div className="topic-understood-choose"><p>{t.placeAmbiguous?'Mai multe localități au acest nume. Pe care o cauți?':'Poți căuta în titluri:'}</p><div>{t.placeChoices.map(c=><Link prefetch={false} className="topic-control" key={c.id} href={searchHref(scope,{q:c.q,place:c.id})}>{c.choice}<DiscoveryIcon name="arrow"/></Link>)}</div></div>}
  {(fromWords.place||fromWords.period||t.subject)&&<p className="topic-help"><Link prefetch={false} href={literal}>Caută exact ce ai scris</Link></p>}
 </section>;
}

type Side={entityId:string|null;name:string;value:number;count:number};
type AskData={block:'stat';stat:{value:number;count:number}}|{block:'table';rows:Side[]}|{block:'timeseries';series:{year:number;value:number;count:number}[]}|{block:'compare';entities:Side[]};
/** One record of /api/ask/rows: the largest records of the selection. */
type RecordRow={title:string|null;cpvName:string|null;date:string|null;authority:string|null;supplier:string|null;value:number|null;src:'da'|'contracts';refId:string|null;contractValueFull?:string|null;nWinners?:number};
/**
 * The largest records, one per contract: /api/ask/rows lists a contract once per winner with its equal share, so a
 * contract of three winners would rank at a third of its value (re-judging, 10 November 2026). The rows of one page are
 * grouped by record, valued whole and ranked again.
 */
function largestRecords(rows:RecordRow[]):{row:RecordRow;value:number|null;suppliers:string[]}[]{
 const byRecord=new Map<string,{row:RecordRow;value:number|null;suppliers:string[]}>();
 rows.forEach((r,n)=>{const key=r.refId?`${r.src}:${r.refId}`:`row:${n}`,whole=r.contractValueFull!=null?Number(r.contractValueFull):r.value;
  const hit=byRecord.get(key);if(hit){if(r.supplier&&!hit.suppliers.includes(r.supplier))hit.suppliers.push(r.supplier);return;}
  byRecord.set(key,{row:r,value:whole!=null&&Number.isFinite(whole)?whole:null,suppliers:r.supplier?[r.supplier]:[]});});
 return [...byRecord.values()].sort((a,b)=>(b.value??-1)-(a.value??-1)).slice(0,3);
}
type AskOk={ok:true;data?:AskData;rows?:RecordRow[];caveats?:string[]};
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
 const top=answer.top?(answer.top.kind==='records'?largest(answer.top.spec):ask(answer.top.spec)):Promise.resolve(null);
 entry.pair=Promise.all([ask(answer.total.spec),top]).then(([total,top])=>({total,top,failed:false}),()=>({total:null,top:null,failed:true}));
 void entry.pair.then(pair=>{if(pair.failed)asked.delete(key);else entry.done=pair;});
 asked.delete(key);asked.set(key,entry);if(asked.size>40)asked.delete(asked.keys().next().value!);
 return entry.pair;
}
const settledAnswer=(key:string)=>{const hit=asked.get(key);return hit?.done&&Date.now()-hit.at<FRESH_MS?hit.done:null;};

/** Titles that contain the searched words, offered when the classified total is empty. */
export type TitleMatches={count:number|null;q:string;onShow:()=>void};
/** What "Pe scurt" counted, for the line that reconciles it with the title matches. */
export type AnswerCount={key:string;count:number|null}|null;


/**
 * Short answer through the Ask engine: total recorded value and the first
 * three winners. `literalHref` (a whole question) adds "Caută exact ce ai
 * scris"; `titles` is the alternative offered when nothing is classified there.
 */
export function SubjectAnswer({answer,notes=[],literalHref,titles,onCount,asked:question}:{answer:Answer;asked?:string|undefined;notes?:string[];literalHref?:string|undefined;titles?:TitleMatches|undefined;onCount?:(c:AnswerCount)=>void}){
 const key=answerKey(answer);
 const [state,setState]=useState<{key:string}&Pair|null>(null);
 useEffect(()=>{let live=true;void prefetchAnswer(answer).then(pair=>{if(live)setState({key,...pair});});return()=>{live=false;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 const done=settledAnswer(key),ready=state?.key===key?state:done?{key,...done}:null;
 const data=(r:AskReply|null|undefined)=>r?.ok?r.data:undefined;
 const totalData=data(ready?.total),topData=data(ready?.top);
 const total=totalData?.block==='stat'?totalData.stat:null;
 // „compară X cu Y”: both sides are the answer, each with its records
 const sides=totalData?.block==='compare'?totalData.entities:null;
 const kind=answer.top?.kind??null;
 const rows=topData?.block==='table'?topData.rows:null;
 const years=topData?.block==='timeseries'?topData.series.filter(y=>y.count>0):null;
 const records=kind==='records'&&ready?.top?.ok&&ready.top.rows?largestRecords(ready.top.rows):null;
 const shape=sides?(sides.some(x=>x.count>0)?'value':'empty'):answerShape(total);
 // Reported once answered (null count: no total), so the page knows when to stop waiting for it.
 useEffect(()=>{onCount?.(ready?{key,count:total?.count??null}:null);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,Boolean(ready),total?.count]);
 // The same limits /intreaba shows for these specs.
 const caveats=[...new Set([...(ready?.total?.ok?ready.total.caveats??[]:[]),...(ready?.top?.ok?ready.top.caveats??[]:[])])];
 const recordsWord=(n:number)=>`${formatInt(n)} ${n===1?'înregistrare':'înregistrări'}`;
 const titleCount=titles?.count??0;
 // The chips („Am înțeles”) already show the scope. The sentence stays for a whole question, and when
 // the answer counts only a town hall while the titles cover every institution of the locality.
 const sentence=(question!==undefined?answer.total.sentence!==question:answer.total.spec.filters.uatSiruta!==undefined)&&<p className="topic-answer-question">{answer.total.sentence}</p>;
 const topLine=topLineFor(answer,question);
 const domains=(term:React.ReactNode)=>answer.cpv.length>0&&<p className="topic-help topic-answer-domains">Domenii incluse ({answer.cpv.length}): {answer.cpv.join('; ')}{answer.cpvExcluded.length>0&&<>; fără: {answer.cpvExcluded.join('; ')}</>}. {term}</p>;
 if(!ready)return <AnswerGhost sentence={sentence} topLine={topLine} lines={kind==='years'?6:sides||!answer.top?0:3} sides={answer.total.spec.block==='compare'} domains={domains(<span className="term term-tip" aria-hidden="true"><span className="term-trigger"><span className="term-mark">?</span></span></span>)} notes={notes} literal={Boolean(literalHref)}/>;
 const role=kind==='authorities'?'autoritate':'furnizor';
 return <section className="topic-answer g-content" aria-label="Răspuns pe scurt">
  <h2>Pe scurt</h2>
  {sentence}
  {ready.failed||(!total&&!sides)?<p className="topic-help" role="status">Răspunsul pe scurt nu este disponibil acum. {ready.total&&!ready.total.ok&&ready.total.error?ready.total.error:''}</p>
   :shape==='empty'?<div className="topic-answer-empty" role="status"><p><strong>{answer.empty}</strong></p>
     {titles&&titleCount>0&&<p className="topic-answer-alternative"><button type="button" className="topic-text-button" onClick={titles.onShow}>{titleCount===1?`Un titlu conține „${titles.q}”`:`${formatInt(titleCount)} titluri conțin „${titles.q}”`}: vezi {titleCount===1?'achiziția':'achizițiile'} <DiscoveryIcon name="arrow"/></button></p>}
     {answer.domains&&<p className="topic-answer-alternative"><Link prefetch={false} href={answer.domains.href}>{answer.domains.label} <DiscoveryIcon name="arrow"/></Link></p>}</div>
   :sides?<><ol className="topic-answer-top topic-answer-sides">{sides.map(x=><li key={x.entityId??x.name}>{x.entityId?<Link prefetch={false} href={`/entitati/${x.entityId}`}>{cleanName(x.name)}</Link>:<span>{cleanName(x.name)}</span>}<span>{x.count?<>{formatRon(x.value)} <small>în {recordsWord(x.count)}</small></>:'nicio achiziție'}</span></li>)}</ol>
   <p className="topic-help">Valoare înregistrată, nu plăți.</p></>
   :total&&<><p className="topic-answer-value">{shape==='value'?<><strong title={formatRonFull(total.value)}>{formatRon(total.value)}</strong><span>în {recordsWord(total.count)} · valoare înregistrată, nu plăți</span></>:<><strong>{recordsWord(total.count)}</strong><span>fără valoare înregistrată</span></>}</p>
    <p className="topic-answer-records"><Link prefetch={false} href={answer.evidenceHref}>Vezi {total.count===1?'înregistrarea':`toate cele ${recordsWord(total.count)}`} <DiscoveryIcon name="arrow"/></Link></p>
    {rows&&rows.length>0&&<><p className="topic-answer-question">{topLine}</p><ol className="topic-answer-top">{rows.map(r=><li key={r.entityId??r.name}>{r.entityId?<Link prefetch={false} href={`/entitati/${r.entityId}?rol=${role}`}>{cleanName(r.name)}</Link>:<span>{cleanName(r.name)}</span>}<span>{formatRon(r.value)}</span></li>)}</ol></>}
    {years&&years.length>1&&<><p className="topic-answer-question">{topLine}</p><ol className="topic-answer-top topic-answer-years">{years.map(y=><li key={y.year}><span>{y.year}</span><span>{formatRon(y.value)} <small>în {recordsWord(y.count)}</small></span></li>)}</ol></>}
    {records&&records.length>0&&<><p className="topic-answer-question">{topLine}</p><ol className="topic-answer-top topic-answer-records-top">{records.map(({row:r,value,suppliers},n)=><li key={`${r.src}:${r.refId??n}`}><span>{r.refId?<Link prefetch={false} href={r.src==='contracts'?`/contracte/i/${r.refId}`:`/achizitii/${r.refId}`}>{r.title||r.cpvName||'Titlu neprecizat în sursă'}</Link>:<span>{r.title||r.cpvName||'Titlu neprecizat în sursă'}</span>}<small>{[r.authority&&cleanName(r.authority),suppliers.length&&`→ ${suppliers.map(cleanName).join(', ')}`,(r.nWinners??1)>1&&`(${r.nWinners} câștigători, valoarea întregului contract)`,r.date?.slice(0,4)].filter(Boolean).join(' ')}</small></span><span>{value!=null?formatRon(value):'–'}</span></li>)}</ol></>}</>}
  {(shape!=='empty'&&!ready.failed)&&caveats.length>0&&<details className="topic-answer-limits"><summary>Ce include calculul · {caveats.length}</summary><ul>{caveats.map(c=><li key={c}>{c}</li>)}</ul></details>}
  {domains(<Term tip title="Domenii" text="Numărăm după încadrarea oficială (CPV), nu după titlu."/>)}
  {notes.map(n=><p key={n} className="topic-subject-note">{n}</p>)}
  <div className="topic-answer-actions">{shape!=='empty'&&<Link prefetch={false} className={literalHref?'topic-primary':'topic-answer-link'} href={answer.href}>{literalHref?'Vezi răspunsul complet':'Vezi răspunsul complet în Întreabă'} <DiscoveryIcon name="arrow"/></Link>}{literalHref&&<Link prefetch={false} className="topic-control" href={literalHref}>Caută exact ce ai scris</Link>}</div>
 </section>;
}
/** The line above what follows the total: the question's own sentence when it asked for that, else what the rows are. */
function topLineFor(answer:Answer,question:string|undefined):string{
 const top=answer.top;
 if(!top)return '';
 if(top.kind==='years')return 'Pe ani:';
 if(top.kind==='records')return 'Cele mai mari achiziții:';
 if(question!==undefined&&top.sentence!==question)return top.sentence;
 if(top.kind==='authorities')return question===undefined?'Cine cumpără cel mai mult:':'Instituțiile cu cea mai mare valoare înregistrată:';
 return question===undefined?'Cine câștigă cel mai mult:':'Firmele cu cea mai mare valoare înregistrată:';
}
/*
 * "Pe scurt" while its two Ask answers load (owner, 6 November 2026: "ghost data loading"): the answer's own shape,
 * with what the words already tell real (the title, the question, the domains, the notes, the closing links) and
 * pulsing lines for the value, the records link and the three largest firms. It appears after 120 ms, so an answer
 * already asked never flashes it. Links are drawn as anchors without an address: nothing in a ghost takes focus.
 */
function AnswerGhost({sentence,topLine,lines,sides,domains,notes,literal}:{sentence:React.ReactNode;topLine:string;lines:number;sides:boolean;domains:React.ReactNode;notes:string[];literal:boolean}){
 const widths=[52,44,38,48,40,46];
 return <Ghost as="section" className="topic-answer" name="topic-answer" wait="client" label="Se calculează răspunsul pe scurt…">
  <h2>Pe scurt</h2>
  {sentence}
  {sides?<ol className="topic-answer-top topic-answer-sides" aria-hidden="true">{[52,44].map(w=><li key={w}><G.Line inline w={`${w}%`}/><G.Line inline w="9em"/></li>)}</ol>
  :<><p className="topic-answer-value" aria-hidden="true"><strong><G.Line w="5.4em"/></strong><span><G.Line w="21em"/></span></p>
  <p className="topic-answer-records" aria-hidden="true"><a><G.Line w="13em"/></a></p></>}
  {lines>0&&<><p className="topic-answer-question">{topLine}</p>
  <ol className="topic-answer-top" aria-hidden="true">{widths.slice(0,lines).map(w=><li key={w}><G.Line inline w={`${w}%`}/><G.Line inline w="5em"/></li>)}</ol></>}
  <div className="topic-answer-limits" aria-hidden="true"><p className="topic-g-summary"><G.Line w="10em"/></p></div>
  {domains}
  {notes.map(n=><p key={n} className="topic-subject-note">{n}</p>)}
  <div className="topic-answer-actions" aria-hidden="true">{literal?<><a className="topic-primary">Vezi răspunsul complet <DiscoveryIcon name="arrow"/></a><a className="topic-control">Caută exact ce ai scris</a></>
   :<a className="topic-answer-link">Vezi răspunsul complet în Întreabă <DiscoveryIcon name="arrow"/></a>}</div>
 </Ghost>;
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
 return <div className="topic-broader"><p>Încearcă mai larg:</p><ul>
  {county&&<li><Link prefetch={false} href={searchHref(scope,{q:effective.q,place:`county:${county}`,from:effective.from,to:effective.to})}>„{effective.q}” în tot județul</Link></li>}
  {effective.place&&<li><Link prefetch={false} href={searchHref(scope,{q:effective.q,place:'',from:effective.from,to:effective.to})}>„{effective.q}” în toată țara</Link></li>}
  {effective.from&&<li><Link prefetch={false} href={searchHref(scope,{q:effective.q,place:effective.place,from:'',to:''})}>„{effective.q}” în toți anii</Link></li>}
  {t?.alsoTry.map(w=><li key={w}><Link prefetch={false} href={searchHref(scope,{q:w,place:effective.place,from:effective.from,to:effective.to})}>Doar „{w}”</Link></li>)}
  {t?.trusted&&!t.question&&t.sentence&&t.askHref&&<li><Link prefetch={false} href={t.askHref}>Întreabă: {t.sentence}</Link></li>}
  <li><button type="button" className="topic-text-button" onClick={onDocuments}>Caută „{effective.q}” în documentele pregătite</button></li>
  {subjects.map(s=><li key={s}><Link prefetch={false} href={searchHref(scope,{q:s,place:effective.place,from:effective.from,to:effective.to})}>Subiect apropiat: {capital(s)}</Link></li>)}
 </ul></div>;
}
