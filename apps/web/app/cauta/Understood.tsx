'use client';
import {Fragment,useEffect,useId,useRef,useState} from 'react';
import Link from 'next/link';
import DiscoveryIcon from '../DiscoveryIcon';
import Term from '@/components/Term';
import EntityName from '@/components/EntityName';
import {G,Ghost} from '@/components/ghost/Ghost';
import {cleanName,formatInt,formatRon,formatRonFull} from '@/lib/format';
import type {AskSpec} from '@/lib/ask/spec';
import type {SuggestResponse} from '@/app/api/suggest/route';
import type {TopicInterpretation} from '@/lib/topic-search/interpretation';
import {answerShape,topicParams,type Place,type TopicScope} from '@/lib/topic-search/shared';
import {relatedSubjects,relatedWord} from '@/lib/topic-search/related';
import {markParts,placeSentence,placeTexts} from '@/lib/topic-search/sentence';
import {TownHallPicker} from '../TownHallTile';

const capital=(s:string)=>s.charAt(0).toLocaleUpperCase('ro-RO')+s.slice(1);
/** A /cauta link for the same selection with some parts changed. */
export const searchHref=(scope:TopicScope,patch:Partial<TopicScope>,literal=false)=>{const p=topicParams({...scope,tab:'all',page:1,role:'',...patch});if(literal)p.set('literal','1');return `/cauta?${p}`;};
const periodLabel=(from:string,to:string)=>from===to?from:`${from}–${to}`;

/** The words name „my” town hall or locality: which one is not known (lib/intent notes). */
export const OWN_PLACE_NOTE=/nu știm ce localitate/;
/**
 * What the reading dropped or narrowed, said under it (a place that cannot be left out, the first of two years…). A
 * town hall not named („primăria mea”) gets the home page's town hall picker beside its note (UX audit Z1-33).
 */
function ReadingNotes({notes}:{notes:string[]}){
 return notes.length?<>{notes.map(n=><Fragment key={n}><p className="topic-help topic-reading-note">{n}</p>{OWN_PLACE_NOTE.test(n)&&<TownHallPicker trigger={show=><button type="button" className="topic-control topic-pick-hall" aria-haspopup="dialog" onClick={show}><DiscoveryIcon name="pin"/>Alege primăria ta</button>}/>}</Fragment>)}</>:null;
}

/** One part of the sentence the person can change: its words, underlined, open a short menu of what else it can be. */
function Part({text,what,children}:{text:string;what:string;children:React.ReactNode}){
 return <details className="topic-part"><summary><span>{text}</span><DiscoveryIcon name="chevronDown"/><span className="d-sr-only"> ({what})</span></summary><div className="topic-part-menu">{children}</div></details>;
}

/**
 * "Am înțeles": what /cauta took from the words, as one sentence (UX audit Z1-03, 16 November 2026): the interpreter's
 * own words, with the subject, the buyers, the place and the period marked where it wrote them; each opens what else it
 * can be and how to take it out. Explicit filters chosen on the page are in it as well, so it always says what is
 * searched. A part the sentence does not name is offered after it.
 */
export function Understood({scope,effective,t,place}:{scope:TopicScope;effective:TopicScope;t:TopicInterpretation;place:Place|null}){
 const fromWords=t.fromWords,placeChip=fromWords.place??(t.explicitPlace?.id===effective.place?t.explicitPlace:null)??(effective.place&&place?.id===effective.place?{id:place.id,label:place.kind==='county'?(place.name==='București'?'Municipiul București':`Județul ${place.name}`):place.name,kind:place.kind}:null);
 const literal=searchHref(scope,{},true);
 // A place named alone is read as the place again: without it, the words are searched as typed.
 const removePlace=t.placeAlone?literal:fromWords.place?searchHref(scope,{q:t.applied.q,place:'',from:effective.from,to:effective.to}):searchHref(scope,{place:''});
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
 if(!t.question&&!t.subject&&!placeChip&&!period&&!t.kind&&!t.placeAmbiguous&&!t.note)return <section className="topic-understood" aria-label="Cum am înțeles căutarea"><ReadingNotes notes={t.notes}/></section>;
 // The sentence: the question, the place's own statement, what „Pe scurt” answers; else what the lists search.
 const answered=t.answer?(t.answer.top?.sentence??t.answer.total.sentence):null;
 const sentence=t.question?.sentence??(t.placeAlone&&t.answer?placeSentence(t.answer.total.sentence):null)??answered
  ??(t.subject||placeChip||period||t.kind?`Căutăm „${effective.q}”${placeChip?` în ${placeTexts(placeChip.label)[0]}`:''}${period?`, în ${period.label}`:''}.`:null);
 type Key='subject'|'kind'|'place'|'period';
 const menus:Partial<Record<Key,{what:string;label:string;body:React.ReactNode}>>={};
 if(t.subject)menus.subject={what:'schimbă subiectul',label:`Subiect: ${capital(t.subject.label)}`,body:<>
  {t.otherSubjects.map(s=><Link prefetch={false} key={s.label} href={searchHref(scope,{q:s.label,place:effective.place,from:effective.from,to:effective.to})}>Subiect: {capital(s.label)}</Link>)}
  <Link prefetch={false} href={literal}>Nu e un subiect: caută exact cuvintele scrise</Link></>};
 if(t.kind)menus.kind={what:'doar în „Pe scurt”',label:`Cine cumpără: ${t.kind.label}`,body:<>
  <p>Doar „Pe scurt” se restrânge la {t.kind.label}; titlurile sunt de la toate instituțiile.</p>
  <Link prefetch={false} href={searchHref(scope,{q:t.kind.withoutQ,place:effective.place,from:effective.from,to:effective.to})}>Scoate „{t.kind.label}”: toate instituțiile</Link></>};
 if(placeChip)menus.place={what:'schimbă locul',label:`Loc: ${placeChip.label}`,body:<>
  {t.placeChoices.map(c=><Link prefetch={false} key={c.id} href={searchHref(scope,{q:c.q,place:c.id,from:effective.from,to:effective.to})}>{c.choice}</Link>)}
  <Link prefetch={false} href={removePlace}>{t.placeAlone?`Caută „${scope.q}” în toată țara`:'Scoate locul: toată țara'}</Link></>};
 if(period)menus.period={what:'schimbă perioada',label:`Perioada: ${period.label}`,body:<Link prefetch={false} href={removePeriod}>Scoate perioada: toți anii</Link>};
 const keys=(Object.keys(menus) as Key[]);
 const texts:Record<Key,string[]>={subject:t.subject?[`„${t.subject.label}”`,t.subject.label]:[],kind:t.kind?[t.kind.label]:[],place:placeChip?placeTexts(placeChip.label):[],period:period?[period.label]:[]};
 const marked=sentence?markParts(sentence,keys.map(key=>({key,texts:texts[key]}))):{segments:[],missing:keys};
 const part=(key:Key,text:string)=>{const m=menus[key]!;return <Part key={key} text={text} what={m.what}>{m.body}</Part>;};
 // A question's „Caută exact ce ai scris” is in „Pe scurt” (or beside its question when it has none).
 const showLiteral=!t.question&&Boolean(fromWords.place||fromWords.period||t.subject||t.placeAlone);
 return <section ref={box} className="topic-understood topic-question" aria-label={t.question?'Cum am înțeles întrebarea':'Cum am înțeles căutarea'}>
  {sentence&&<div className="topic-question-line"><span className="topic-understood-label">Am înțeles:</span> <span className="topic-sentence">{marked.segments.map((x,i)=>x.key?part(x.key,x.text):<Fragment key={i}>{x.text}</Fragment>)}{marked.missing.map(key=><Fragment key={key}> · {part(key,menus[key]!.label)}</Fragment>)}</span>
   {showLiteral&&<Link prefetch={false} className="topic-understood-literal" href={literal}>Caută exact ce ai scris ›</Link>}</div>}
  {t.question&&!t.answer&&<div className="topic-question-actions">{t.askHref&&<Link prefetch={false} className="topic-primary" href={t.askHref}>Vezi răspunsul complet <DiscoveryIcon name="arrow"/></Link>}<Link prefetch={false} className="topic-control" href={literal}>Caută exact ce ai scris</Link></div>}
  {(!t.answer||scope.tab!=='all')&&t.subject?.notes.map(n=><p key={n} className="topic-subject-note">{n}</p>)}
  <ReadingNotes notes={t.notes}/>
  {t.note&&<p className="topic-help">{t.note}{t.askHref&&<> <Link prefetch={false} href={t.askHref}>Deschide în Întreabă</Link></>}</p>}
  {(t.placeAmbiguous||(t.note&&!placeChip))&&t.placeChoices.length>0&&<div className="topic-understood-choose"><p>{t.placeAmbiguous?'Mai multe localități au acest nume. Pe care o cauți?':'Poți căuta în titluri:'}</p><div>{t.placeChoices.map(c=><Link prefetch={false} className="topic-control" key={c.id} href={searchHref(scope,{q:c.q,place:c.id})}>{c.choice}<DiscoveryIcon name="arrow"/></Link>)}</div></div>}
 </section>;
}

type Side={entityId:string|null;name:string;value:number;count:number};
type AskData={block:'stat';stat:{value:number;count:number}}|{block:'table';rows:Side[]}|{block:'timeseries';series:{year:number;value:number;count:number}[]}|{block:'compare';entities:Side[]};
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


/** Where and when „Pe scurt” counted, in the words of the chips of „Am înțeles”: one line beside its title. */
export type AnswerScope={subject:string;kind:string|null;where:string;period:string;named?:boolean;who?:boolean};
/** The label above the rows: what they are, never a question (the question is in „Am înțeles”). */
const LIST_LABEL={records:'Cele mai mari achiziții',suppliers:'Cine a câștigat cel mai mult',authorities:'Cine a contractat cel mai mult',years:'Pe ani'} as const;
type ListKind=keyof typeof LIST_LABEL;
/**
 * Whether the rows are the answer and the total their context (owner, 10 November 2026: „Pe scurt” arăta foarte prost):
 * the largest purchases, and a question that asked who or which years, whose sentence is the rows' own. A subject and a
 * „cât” question lead with the total. The rows come first in the page's order too, so a phone reads them first.
 */
const rowsLead=(answer:Answer,question:string|undefined,who=false)=>Boolean(answer.top&&(answer.top.kind==='records'||(who&&(answer.top.kind==='suppliers'||answer.top.kind==='authorities'))||(question!==undefined&&answer.top.sentence===question)));
/** The first year of the archive: an evolution over all the years has one row per year from it (its ghost too). */
const FIRST_YEAR=2018;
const yearRows=(answer:Answer)=>{const f=answer.top?.spec.filters;return Math.max(2,Math.min(12,(f?.yearTo??new Date().getFullYear())-(f?.yearFrom??FIRST_YEAR)+1));};
/** The years an archive always holds in part: the first (direct acquisitions from 2 April 2018) and the current one. */
const partialLikely=(answer:Answer,i:number)=>{const year=(answer.top?.spec.filters.yearFrom??FIRST_YEAR)+i;return year===FIRST_YEAR||year===new Date().getFullYear();};
const shareText=(n:number)=>n<0.005?'sub 1%':`${Math.round(n*100)}%`;
const recordsWord=(n:number)=>`${formatInt(n)} ${n===1?'înregistrare':'înregistrări'}`;
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
 const rest=scope?(compare?['Comparație',scope.period,'valoare înregistrată, nu plăți']:[scope.kind,scope.where,scope.period]).filter((x):x is string=>Boolean(x)):[];
 const line=[first,...rest,...(institutions?['toate instituțiile']:[])].filter(Boolean);
 return <div className="topic-answer-head"><h2>Pe scurt</h2>{(line.length>0||townHall)&&<p className="topic-answer-scope">{line.map((x,i)=><Fragment key={i}>{i>0&&' · '}{x}</Fragment>)}{townHall&&<>{line.length>0&&' · '}<span className="topic-answer-nowrap">doar primăria {ghost?<GhostTip/>:<Term tip title="Doar primăria" text="„Pe scurt” numără doar achizițiile primăriei, fără celelalte instituții din localitate."/>}</span></>}</p>}</div>;
}

/**
 * The closing row: how the answer was counted (the CPV classes, what is left out, the limits of the calculation),
 * folded, and the ways on. The summary's words are known before the answer, so its ghost is the same line.
 */
function AnswerFoot({answer,caveats,literalHref,full,ghost=false}:{answer:Answer;caveats:string[];literalHref?:string|undefined;full:boolean;ghost?:boolean}){
 const n=answer.cpv.length;
 const summary=<><DiscoveryIcon name="chevronDown"/><span>Cum am numărat{n>0&&<small> · {n===1?'un domeniu CPV':`${n} domenii CPV`}</small>}</span></>;
 return <div className="topic-answer-foot">
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
 const total=totalData?.block==='stat'?totalData.stat:null;
 // „compară X cu Y”: both sides are the answer, each with its records
 const sides=totalData?.block==='compare'?totalData.entities:null;
 const kind:ListKind|null=answer.top?.kind??null;
 const rows=topData?.block==='table'?topData.rows:null;
 const years=topData?.block==='timeseries'?topData.series.filter(y=>y.count>0):null;
 const records=kind==='records'&&ready?.top?.ok&&ready.top.rows?largestRecords(ready.top.rows):null;
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
 const noteList=notes.map(n=><p key={n} className="topic-subject-note">{n}</p>);
 const bar=(fraction:number,i:number,extra='')=><span className="topic-answer-bar" aria-hidden="true"><span className={`cm-x${extra}`} style={{width:`${Math.max(0,Math.min(100,fraction*100))}%`,'--i':i} as React.CSSProperties}/></span>;
 const items=kind==='records'?(records?.length?records.map(({row:r,value,suppliers},i)=>{
   const title=r.title||r.cpvName||'Titlu neprecizat în sursă',winners=r.nWinners??1,shown=suppliers.slice(0,Math.max(winners,suppliers.length)>2?1:2),more=Math.max(winners,suppliers.length)-shown.length;
   return <li key={`${r.src}:${r.refId??i}`} className="topic-answer-row is-record">
    <span className="topic-answer-rank" aria-hidden="true">{i+1}</span>
    <span className="topic-answer-what">
     {r.refId?<Link prefetch={false} className="topic-answer-title" title={title} href={r.src==='contracts'?`/contracte/i/${r.refId}`:`/achizitii/${r.refId}`}>{title}</Link>:<span className="topic-answer-title">{title}</span>}
     <small className="topic-answer-parties">{r.authority&&<span className="topic-answer-buyer"><EntityName id={r.authorityId} role="authority" title={cleanName(r.authority)}>{cleanName(r.authority)}</EntityName></span>}
      {shown.length>0&&<> → {shown.map((x,k)=><Fragment key={x.name}>{k>0&&', '}<EntityName id={x.id} role="supplier">{cleanName(x.name)}</EntityName></Fragment>)}</>}
      {more>0&&<> și încă {more}</>}{!oneYear&&r.date&&<> · {r.date.slice(0,4)}</>}</small>
    </span>
    <span className="topic-answer-amount">{value!=null?formatRon(value):'–'}{winners>1&&<small><Term tip title="Contract întreg" text={`${winners} câștigători. Arătăm valoarea întregului contract, o singură dată, nu partea fiecăruia.`}>contract întreg</Term></small>}</span>
   </li>;}):null)
  :kind==='years'?(years&&years.length>1?(()=>{const max=Math.max(0,...years.map(y=>y.value));return years.map((y,i)=>{const note=partial.get(y.year);
   return <li key={y.year} className="topic-answer-row is-year">
    <span className="topic-answer-year">{y.year}{note&&<small><Term tip title="An parțial" text={note}>parțial</Term></small>}</span>
    {bar(max>0?y.value/max:0,i,note?' is-partial':'')}
    <span className="topic-answer-amount">{formatRon(y.value)}</span><span className="topic-answer-n">{recordsWord(y.count)}</span>
   </li>;});})():null)
  :kind&&rows?.length?rows.map((r,i)=>{const part=total&&total.value>0?r.value/total.value:null;
   return <li key={r.entityId??r.name} className="topic-answer-row">
    <span className="topic-answer-rank" aria-hidden="true">{i+1}</span>
    <span className="topic-answer-what"><EntityName id={r.entityId} role={role}>{cleanName(r.name)}</EntityName>
     <small>{recordsWord(r.count)}{part!=null&&<> · {shareText(part)} din total</>}</small></span>
    <span className="topic-answer-amount">{formatRon(r.value)}</span>
   </li>;}):null;
 const list=kind&&items?<div className="topic-answer-main"><p className="topic-answer-label" id={labelId}>{LIST_LABEL[kind]}</p><ol className={`topic-answer-list is-${kind}`} role="list" aria-labelledby={labelId} data-chart="">{items}</ol></div>:null;
 const rail=total&&<div className="topic-answer-rail">
  {led&&list&&<p className="topic-answer-label">Total</p>}
  <p className="topic-answer-value">{shape==='value'?<strong title={formatRonFull(total.value)}>{formatRon(total.value)}</strong>:<strong>{recordsWord(total.count)}</strong>}</p>
  <p className="topic-answer-count">{shape==='value'&&'în '}<Link prefetch={false} href={answer.evidenceHref}>{shape==='value'?recordsWord(total.count):total.count===1?'Vezi înregistrarea':'Vezi înregistrările'} <DiscoveryIcon name="arrow"/></Link></p>
  <p className="topic-answer-sub">{shape==='value'?'valoare înregistrată, nu plăți':'fără valoare înregistrată'}</p>
 </div>;
 const failed=ready.failed||(!total&&!sides);
 return <section className="topic-answer g-content" aria-label="Răspuns pe scurt">
  {head}
  {failed?<p className="topic-help" role="status">Răspunsul pe scurt nu este disponibil acum. {ready.total&&!ready.total.ok&&ready.total.error?ready.total.error:''}</p>
   :shape==='empty'?<><div className="topic-answer-empty" role="status"><p className="topic-answer-empty-line">{answer.empty}</p>
     {titles&&titleCount>0&&<p className="topic-answer-alternative"><button type="button" className="topic-text-button" onClick={titles.onShow}>{titleCount===1?`Un titlu conține „${titles.q}”`:`${formatInt(titleCount)} titluri conțin „${titles.q}”`}: vezi {titleCount===1?'achiziția':'achizițiile'} <DiscoveryIcon name="arrow"/></button></p>}
     {answer.domains&&<p className="topic-answer-alternative"><Link prefetch={false} href={answer.domains.href}>{answer.domains.label} <DiscoveryIcon name="arrow"/></Link></p>}</div>{noteList}</>
   :sides?(()=>{const max=Math.max(0,...sides.map(x=>x.value));return <><ol className="topic-answer-sides" role="list" data-chart="">{sides.map((x,i)=><li key={x.entityId??x.name}>
     <EntityName id={x.entityId}>{cleanName(x.name)}</EntityName>
     <strong className="topic-answer-side-value">{x.count?formatRon(x.value):'nicio achiziție'}</strong>
     <small>{x.count?`în ${recordsWord(x.count)}`:' '}</small>
     {bar(max>0?x.value/max:0,i)}
    </li>)}</ol>{noteList}</>;})()
   :<><div className={`topic-answer-body${list?' has-list':''}${led&&list?' is-led':''}`}>{led?<>{list}{rail}</>:<>{rail}{list}</>}</div>{noteList}</>}
  <AnswerFoot answer={answer} caveats={caveats} literalHref={literalHref} full={!failed&&shape!=='empty'}/>
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
 const list=kind&&<div className="topic-answer-main"><p className="topic-answer-label">{LIST_LABEL[kind]}</p>
  <ol className={`topic-answer-list is-${kind}`} role="list" aria-hidden="true">{Array.from({length:n},(_,i)=>kind==='years'
   ?<li key={i} className="topic-answer-row is-year"><span className="topic-answer-year"><G.Line inline w="2.4em"/>{partialLikely(answer,i)&&<small><G.Line inline w="4.5em"/></small>}</span><span className="topic-answer-bar"/><span className="topic-answer-amount"><G.Line inline w="5em"/></span><span className="topic-answer-n"><G.Line inline w="7em"/></span></li>
   :<li key={i} className={`topic-answer-row${kind==='records'?' is-record':''}`}><span className="topic-answer-rank">{i+1}</span>
    <span className="topic-answer-what">{kind==='records'
     ?<><span className="topic-answer-title"><G.Line w="96%"/><G.Line w={`${widths[i]}%`}/><G.Line w="30%" only="phone"/></span><small className="topic-answer-parties"><G.Line w="64%"/><G.Line w="40%" only="phone"/></small></>
     :<><span><G.Line w={`${widths[i]}%`}/></span><small><G.Line inline w="11em"/></small></>}</span>
    <span className="topic-answer-amount"><G.Line inline w="5em"/></span></li>)}</ol></div>;
 const notesList=notes.map(x=><p key={x} className="topic-subject-note">{x}</p>);
 const rail=<div className="topic-answer-rail">{led&&list&&<p className="topic-answer-label">Total</p>}
  <p className="topic-answer-value"><strong><G.Line w="5.4em"/></strong></p>
  <p className="topic-answer-count"><G.Line w="9em"/></p>
  <p className="topic-answer-sub">valoare înregistrată, nu plăți</p></div>;
 return <Ghost as="section" className="topic-answer" name="topic-answer" wait="client" label="Se calculează răspunsul pe scurt…">
  {head}
  {compare?<><ol className="topic-answer-sides" role="list" aria-hidden="true">{[52,44].map(w=><li key={w}><span><G.Line w={`${w}%`}/></span><strong className="topic-answer-side-value"><G.Line inline w="5em"/></strong><small><G.Line inline w="9em"/></small><span className="topic-answer-bar"/></li>)}</ol>{notesList}</>
  :<><div className={`topic-answer-body${list?' has-list':''}${led&&list?' is-led':''}`}>{led?<>{list}{rail}</>:<>{rail}{list}</>}</div>{notesList}</>}
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
  <Ghost as="section" className="topic-understood topic-question" name="topic-understood" wait="client" label="Citim căutarea…"><div className="topic-question-line"><span className="topic-understood-label">Am înțeles:</span> <span className="topic-sentence topic-g-fill"><G.Line w="56%" only="not-phone"/><G.Lines w={[]} phone={['96%','88%','42%']}/></span><span className="topic-understood-literal g-phone" aria-hidden="true"><G.Line inline w="10em"/></span></div></Ghost>
  {answer&&<Ghost as="section" className="topic-answer" name="topic-answer" wait="client">
   <div className="topic-answer-head"><h2><G.Line inline w="4.2em"/></h2><p className="topic-answer-scope"><G.Line inline w="14em"/></p></div>
   <div className="topic-answer-body has-list"><div className="topic-answer-rail"><p className="topic-answer-label"><G.Line inline w="3em"/></p><p className="topic-answer-value"><strong><G.Line w="5.4em"/></strong></p><p className="topic-answer-count"><G.Line w="9em"/></p><p className="topic-answer-sub"><G.Line w="9em"/></p></div>
    <div className="topic-answer-main"><p className="topic-answer-label"><G.Line inline w="8em"/></p><ol className="topic-answer-list is-suppliers" role="list" aria-hidden="true">{[58,46,52].map((w,i)=><li key={i} className="topic-answer-row"><span className="topic-answer-rank">{i+1}</span><span className="topic-answer-what"><span><G.Line w={`${w}%`}/></span><small><G.Line inline w="11em"/></small></span><span className="topic-answer-amount"><G.Line inline w="5em"/></span></li>)}</ol></div></div>
   <div className="topic-answer-foot"><div className="topic-answer-how"><p className="topic-answer-how-summary"><G.Line inline w="9em"/></p></div><div className="topic-answer-actions"><G.Line inline w="13em"/></div></div>
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
