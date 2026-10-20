'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import { STORIES_BASE,countyLabel,countyHref,dateLabel,sourceNumber,storyHref,storyTotal } from '@/lib/stories/shared';
import { chapterSources,citation,isCeiling,isNational,questionGroups,relatedStories,requestLabel,scopeLabel,sourceGroups,timelineStrip,valueNote,type SourceItem } from '@/lib/stories/editorial';
import { glossaryPlan } from '@/lib/stories/glossary';
import type {Story} from '@/lib/stories/types';
import {Icon,money,StoryCard} from './StoryParts';
import {Actors,Cited,KeyFacts,MapFigure,Notes,StoryFigure,supplierGroups} from './StoryVisuals';
import StoryCover from './StoryCover';
import {PeekProvider} from './StoryPeek';
type Open=(id:string)=>void;
type Section=NonNullable<Story['sections']>[number];

/** „Pe scurt”: the established facts and the open ones, before the reader commits to eight minutes. */
function Brief({story}:{story:Story}){
 const b=story.brief!,statuses=[...new Set(story.requests?.map(requestLabel))];
 return <section className="brief" aria-labelledby="pe-scurt"><h2 id="pe-scurt">Pe scurt</h2><div className="brief-grid">
  <div><h3>Ce arată documentele</h3><ul>{b.known.map(t=><li key={t}>{t}</li>)}</ul></div>
  <div className="brief-unknown"><h3>Ce nu știm încă</h3><ul>{b.unknown.map(t=><li key={t}>{t}</li>)}</ul></div>
  <div className="brief-next"><h3>Ce urmează</h3><p><b>{story.questions.length}</b> {story.questions.length===1?'întrebare deschisă':'întrebări deschise'}{statuses.length?` · ${statuses.join(' · ')}`:''}</p><a className="text-link" href="#intrebari">Vezi întrebările <Icon name="arrow"/></a></div>
 </div></section>;
}
/** The chronology on a real time scale: the gaps between key events are part of the story. */
function TimeStrip({story}:{story:Story}){
 const t=timelineStrip(story);if(!t)return null;
 return <section className="time-strip" aria-labelledby="in-timp"><div className="strip-head"><h2 id="in-timp">Povestea în timp</h2><span>{dateLabel(t.from)} – {dateLabel(t.to)}</span></div>
  <div className="strip-axis"><div>{t.years.map(y=><span key={y.label} className="strip-year" style={{left:`${y.at*100}%`}}>{y.label}</span>)}{t.points.map(p=><a key={p.id} href={`#t-${p.id}`} className={p.key?'strip-dot key':'strip-dot'} style={{left:`${p.at*100}%`}} aria-label={`${dateLabel(p.date)}: ${p.title}`} title={`${dateLabel(p.date)} · ${p.title}`}/>)}</div></div>
  <ol className="strip-key">{t.key.map(k=><li key={k.id}>{k.gap&&<span className="strip-gap">după {k.gap}</span>}<time dateTime={k.date}>{dateLabel(k.date)}</time><a href={`#t-${k.id}`}>{k.title}</a></li>)}</ol>
 </section>;
}
function ChapterNav({chapters,current,minutesLeft,sources}:{chapters:{id:string;title:string}[];current:string;minutesLeft:number;sources:number}){
 const [open,setOpen]=useState(false),i=Math.max(0,chapters.findIndex(c=>c.id===current));
 return <nav className="chapter-nav" aria-label="Capitolele poveștii">
  <button type="button" className="chapter-toggle" aria-expanded={open} aria-controls="chapter-list" onClick={()=>setOpen(!open)}><span className="chapter-count">{i+1}/{chapters.length}</span><span className="chapter-current">{chapters[i]?.title}</span><span className="chapter-left">{minutesLeft?`${minutesLeft} min`:'final'}</span></button>
  <div id="chapter-list" className="chapter-list" data-open={open}><span>În această poveste</span>{chapters.map(c=><a key={c.id} href={`#${c.id}`} onClick={()=>setOpen(false)} className={current===c.id?'selected':undefined} aria-current={current===c.id?'location':undefined}>{c.title}{c.id==='surse'&&<span>{sources}</span>}</a>)}
   <p className="time-left">{minutesLeft?`Mai ai ${minutesLeft} min de citit`:'Ai ajuns la final'}</p></div>
 </nav>;
}
function SourceRow({story,item,openSource}:{story:Story;item:SourceItem;openSource:Open}){
 const s=item.source,meta=s.kind==='procurement'?`${s.suppliers[0]} · ${dateLabel(s.date)} · ${money(s.amount)}${story.finding.sourceIds.includes(s.id)?'':' · context, în afara totalului'}`:s.kind==='external'?s.publisher:'Notă de documentare';
 return <button onClick={()=>openSource(s.id)}><span className="source-number">{item.n}</span><span><strong>{s.title}</strong><small>{meta}</small></span><Icon name="arrow"/></button>;
}
function Sources({story,openSource}:{story:Story;openSource:Open}){
 return <section id="surse"><div className="section-head"><h2>Documentele folosite</h2><span>{story.sources.length} surse</span></div><p>Acesta este dosarul poveștii. Fiecare document se deschide fără să pierzi locul în articol.</p>
  {sourceGroups(story).map(g=><div className="source-group" key={g.id}><h3>{g.title}</h3>
   {g.clusters.map(c=>{const first=c.items[0]!.source;return <details className="source-cluster" key={c.key}><summary><span className="source-number">{c.items.length}×</span><span><strong>{c.title}</strong><small>{first.kind==='procurement'?first.authority:''} · {money(c.total)} în total</small></span></summary><div className="source-list">{c.items.map(x=><SourceRow key={x.source.id} story={story} item={x} openSource={openSource}/>)}</div></details>;})}
   {g.items.length>0&&<div className="source-list">{g.items.map(x=><SourceRow key={x.source.id} story={story} item={x} openSource={openSource}/>)}</div>}
  </div>)}
  <details className="methodology"><summary>Cum am documentat povestea</summary><p>{story.methodology}</p></details>
  {story.corrections.length>0&&<details className="methodology"><summary>Istoricul corecturilor</summary>{story.corrections.map((c,i)=><p key={i}><time dateTime={c.date}>{dateLabel(c.date)}</time> — {c.text}</p>)}</details>}
 </section>;
}
function Questions({story,openSource}:{story:Story;openSource:Open}){
 let n=0;
 return <section id="intrebari"><h2>Ce rămâne de aflat</h2>
  {questionGroups(story).map((g,i)=>{const start=n+1;n+=g.items.length;return <div className="question-group" key={i}>{g.to&&<div className="question-to"><b>{g.to}</b>{g.request&&<span className={`request-status s-${g.request.status}`}>{requestLabel(g.request)}</span>}</div>}<ol start={start}>{g.items.map((q,j)=><li key={j}>{q}</li>)}</ol></div>;})}
  {story.reply?<div className="open-question"><h3>{story.reply.title}</h3><p>{story.reply.text}</p><Notes story={story} ids={story.reply.sourceIds} openSource={openSource}/></div>:<details className="right-reply"><summary>Despre răspunsul instituției</summary><p>Dosarul nu include un răspuns al instituției. Absența lui nu demonstrează că instituția a refuzat să răspundă.</p></details>}
 </section>;
}
/** Where the reader can go next: the records' own pages, a tip, a citation. */
function Ending({story}:{story:Story}){
 const [url,setUrl]=useState(storyHref(story.slug)),[copied,setCopied]=useState('');
 useEffect(()=>setUrl(location.origin+storyHref(story.slug)),[story.slug]);
 const authorities=[...new Set(story.sources.flatMap(s=>s.kind==='procurement'&&story.finding.sourceIds.includes(s.id)?[s.authority]:[]))].slice(0,2);
 const firms=story.actors?.items.filter(a=>a.entityId)??[];
 return <div className="story-ending"><h2>Continuă verificarea</h2><ul className="next-steps">
  {firms.map(a=><li key={a.entityId}><a href={`/entitati/${a.entityId}`} target="_blank" rel="noopener noreferrer"><span>Fișa {a.name}</span><small>toate contractele și semnalele firmei</small><Icon name="external"/></a></li>)}
  {authorities.map(a=><li key={a}><a href={`/cauta?q=${encodeURIComponent(a)}`} target="_blank" rel="noopener noreferrer"><span>Alte achiziții ale instituției</span><small>{a}</small><Icon name="external"/></a></li>)}
  <li><a href="/intreaba" target="_blank" rel="noopener noreferrer"><span>Construiește o întrebare</span><small>explorează toate datele publice</small><Icon name="external"/></a></li>
 </ul>
 <div className="ending-actions">
  <div><h3>Ai informații despre această poveste?</h3><p>Scrie-ne anonim, fără cont. Mesajul ajunge doar la administratorii aplicației. Nu include date personale.</p><button type="button" className="button" onClick={()=>document.querySelector<HTMLButtonElement>('.feedback-fab')?.click()}>Trimite o informație</button></div>
  <div><h3>Cum citezi povestea</h3><p className="citation">{citation(story,url)}</p><div className="citation-actions"><button type="button" className="text-link" onClick={async()=>{try{await navigator.clipboard.writeText(citation(story,url));setCopied('Citarea a fost copiată.');}catch{setCopied('Copierea nu a reușit. Selectează textul de mai sus.');}}}><Icon name="link"/> Copiază citarea</button><a className="text-link" href="/metodologie#citare" target="_blank" rel="noopener noreferrer">Reguli de citare <Icon name="external"/></a></div><span className="copy-status" role="status">{copied}</span></div>
 </div></div>;
}

export default function StoryArticle({story,stories,openSource}:{story:Story;stories:Story[];openSource:Open}){
 const [chapter,setChapter]=useState(''),[copied,setCopied]=useState(''),[left,setLeft]=useState(story.minutes);const body=useRef<HTMLDivElement>(null),progress=useRef<HTMLDivElement>(null);
 const lead=story.sections?.filter(s=>s.lead)??[],rest=story.sections?.filter(s=>!s.lead)??[],actorsIn=story.sections?.find(s=>s.actors)?.id;
 const chapters=[...lead.map(s=>({id:s.id,title:s.title})),{id:'firul',title:'Ce arată achizițiile'},...rest.map(s=>({id:s.id,title:s.title})),{id:'cronologie',title:'Cronologia'},{id:'intrebari',title:'Ce rămâne de aflat'},{id:'surse',title:'Toate sursele'}];
 useEffect(()=>{const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)setChapter(e.target.id);}),{rootMargin:'-15% 0px -65% 0px'});body.current?.querySelectorAll(':scope > section').forEach(s=>observer.observe(s));
  const scroll=()=>{if(!body.current||!progress.current)return;const max=body.current.getBoundingClientRect().bottom+scrollY-innerHeight,f=Math.min(1,Math.max(0,scrollY/Math.max(1,max)));progress.current.style.width=`${f*100}%`;setLeft(Math.ceil(story.minutes*(1-f)-.05));};
  addEventListener('scroll',scroll,{passive:true});scroll();return()=>{observer.disconnect();removeEventListener('scroll',scroll);};},[story.slug,story.minutes]);
 // Glossary terms are explained once, at their first use in reading order.
 const terms=useMemo(()=>{const keys:string[]=[],texts:string[]=[];const push=(k:string,t:string)=>{keys.push(k);texts.push(t);};
  lead.forEach(s=>s.paragraphs.forEach((p,i)=>push(`${s.id}:${i}`,p)));story.intro.forEach((p,i)=>push(`intro:${i}`,p));push('after',story.finding.after);rest.forEach(s=>s.paragraphs.forEach((p,i)=>push(`${s.id}:${i}`,p)));
  const plan=glossaryPlan(texts);return new Map([...plan].map(([i,ids])=>[keys[i]!,ids]));},[story]);
 const cite=(text:string,key?:string)=><Cited story={story} text={text} openSource={openSource} terms={(key&&terms.get(key))||[]}/>;
 const note=valueNote(story),groups=story.finding.groupBySupplier?supplierGroups(story):null;
 const records=story.sources.filter(s=>story.finding.sourceIds.includes(s.id)&&s.kind==='procurement');
 const max=Math.max(...records.map(s=>s.kind==='procurement'?Number(s.amount):0),1);
 const mapInFinding=story.visual?.kind==='map'&&Boolean(groups);
 const related=relatedStories(story,stories);
 const procurementCount=story.sources.filter(s=>s.kind==='procurement').length;
 const railIds=chapterSources(story)[chapter]??[],railTitle=chapters.find(c=>c.id===chapter)?.title;
 const national=isNational(story),home=national?STORIES_BASE:countyHref(story.counties[0]!),homeLabel=national?'Toate poveștile':`Povești din ${countyLabel(story.counties[0]!)}`;
 const narrative=(s:Section)=><section id={s.id} key={s.id} className="narrative-section"><h2>{s.title}</h2>
  {s.quote&&<figure className="pull-quote"><blockquote>„{s.quote.text}”</blockquote><figcaption>{s.quote.attribution} <Notes story={story} ids={[s.quote.sourceId]} openSource={openSource} label=""/></figcaption></figure>}
  {s.actors&&story.actors&&<Actors story={story} openSource={openSource} heading={false}/>}
  {s.paragraphs.map((p,i)=><p key={i}>{cite(p,`${s.id}:${i}`)}</p>)}<Notes story={story} ids={s.sourceIds} openSource={openSource} label="Vezi și"/></section>;
 return <PeekProvider><div className="reading-progress" aria-hidden="true"><i ref={progress}/></div><div className="article-topline"><a className="back-link" href={home}><Icon name="back"/> {homeLabel}</a><button className="text-link" aria-label="Copiază linkul poveștii" onClick={async()=>{try{await navigator.clipboard.writeText(location.href.split('#')[0]!);setCopied('Linkul poveștii a fost copiat.');}catch{setCopied('Copierea nu a reușit. Poți copia adresa din browser.');}}}><Icon name="link"/> Copiază linkul</button></div><span className="copy-status" role="status">{copied}</span>
 <article><header className="article-hero"><div><div className="article-meta">{national?<span className="scope" title={story.counties.map(countyLabel).join(', ')}>{scopeLabel(story)}</span>:story.counties.map(c=><a key={c} href={countyHref(c)}>{countyLabel(c)}</a>)}<span>{story.topic}</span><span>{story.minutes} min de citit</span></div><h1>{story.title}</h1><p className="article-dek">{story.summary}</p><div className="byline"><strong>{story.author}</strong><span>{story.status==='preview'?'Documentat la ':''}{dateLabel(story.publishedAt)}{story.updatedAt?` · Actualizat ${dateLabel(story.updatedAt)}`:''}</span></div></div><StoryCover story={story} transition={`story-cover-${story.slug}`}/></header>
 {story.keyFacts&&<KeyFacts story={story}/>}
 {story.brief&&<Brief story={story}/>}
 <TimeStrip story={story}/>
 <div className="article-layout"><ChapterNav chapters={chapters} current={chapter||chapters[0]!.id} minutesLeft={left} sources={story.sources.length}/>
 <div className="reading-body" ref={body}>
 {lead.map(narrative)}
 <section id="firul"><h2>Ce arată achizițiile</h2>{story.intro.map((p,i)=><p key={i}>{cite(p,`intro:${i}`)}</p>)}
 {story.visual&&!mapInFinding&&<StoryFigure story={story} openSource={openSource} inline/>}
 {records.length>0&&<div className="finding"><span>{story.finding.title}</span><h3>{records.length} {records.length===1?'înregistrare':'înregistrări'}. {money(storyTotal(story))} în total.</h3><p>{story.finding.explanation}</p>
  {records.length<2&&!mapInFinding?null:mapInFinding&&story.visual?.kind==='map'?<><p className="finding-figure-title">{story.visual.title}</p><MapFigure story={story} v={story.visual} openSource={openSource}/><p className="finding-caption">{story.visual.caption}</p></>:
  <div className="value-bars">{groups?groups.map(g=><button key={g.supplier} className={g.ids.every(id=>{const x=story.sources.find(s=>s.id===id);return x&&isCeiling(x);})?'ceiling':undefined} onClick={()=>openSource('all')} aria-label={`${g.supplier}: ${money(g.total)}, ${g.ids.length} înregistrări. Deschide dosarul`}><span>{g.supplier} · {g.ids.length} {g.ids.length===1?'acord':'acorduri'}</span><i style={{width:`${Number(g.total)/Number(groups[0]!.total)*100}%`}}/><b>{money(g.total)}</b></button>):records.map(s=>s.kind==='procurement'&&<button key={s.id} className={isCeiling(s)?'ceiling':undefined} onClick={()=>openSource(s.id)} aria-label={`${s.title}: ${money(s.amount)}. Deschide sursa`}><span>{s.title}</span><i style={{width:`${Number(s.amount)/max*100}%`}}/><b>{money(s.amount)}</b></button>)}</div>}
  {note.anyCeiling&&!mapInFinding&&records.length>1&&<p className="ceiling-key"><i/>Bară hașurată: plafon maxim, nu sumă plătită.</p>}
  <button className="text-link" onClick={()=>openSource('all')}>{records.length===1?'Verifică înregistrarea':`Verifică cele ${records.length} înregistrări`} <Icon name="arrow"/></button></div>}
 <p>{cite(story.finding.after,'after')}</p>{story.actors&&!actorsIn&&<Actors story={story} openSource={openSource}/>}</section>
 {rest.map(narrative)}
 <section id="cronologie"><div className="section-head"><h2>Cronologie</h2><span>{story.period}</span></div><ol className="timeline">{story.timeline.map(event=><li id={`t-${event.id}`} className={[!event.date?'context-event':'',event.highlight?'key-event':''].join(' ').trim()||undefined} key={event.id}>{event.gapBefore&&<span className="gap-before">{event.gapBefore}</span>}{event.date?<time dateTime={event.date}>{dateLabel(event.date)}</time>:<span className="quiet">Contextul din afara achizițiilor</span>}<h3>{event.title}</h3><p>{cite(event.text)}</p><div className="event-source">{event.sourceIds.length===1&&(()=>{const s=story.sources.find(s=>s.id===event.sourceIds[0]);return s?.kind==='procurement'?<b>{money(s.amount)}</b>:null;})()}<Notes story={story} ids={event.sourceIds} openSource={openSource}/></div></li>)}</ol></section>
 <Questions story={story} openSource={openSource}/>
 <Sources story={story} openSource={openSource}/>
 <Ending story={story}/></div>
 <aside className="evidence-rail"><div><span>Dosarul, la îndemână</span><h3>{procurementCount} {procurementCount===1?'achiziție':'achiziții'}<br/>{story.sources.length-procurementCount} surse de context</h3><button className="text-link" onClick={()=>openSource('all')}>Deschide dosarul <Icon name="arrow"/></button>
  {railIds.length>0&&<><hr/><div className="rail-chapter"><b>Surse în „{railTitle}”</b>{[...railIds].sort((a,b)=>sourceNumber(story,a)-sourceNumber(story,b)).slice(0,6).map(id=><button key={id} className="rail-source" onClick={()=>openSource(id)}><span>{sourceNumber(story,id)}</span>{story.sources.find(s=>s.id===id)?.title}</button>)}{railIds.length>6&&<small>și încă {railIds.length-6} în dosar</small>}</div></>}
  <hr/><p><b>Perioada urmărită</b>{story.period}</p><p><b>Ce arată cifrele</b>{note.text}</p></div></aside></div></article>
 {related.length>0&&<section className="related"><div className="section-head"><h2>Alte povești</h2><a className="text-link" href={home}>{national?'Toate poveștile':`Toate poveștile din ${countyLabel(story.counties[0]!)}`} <Icon name="arrow"/></a></div><div className="story-grid">{related.map(r=><StoryCard key={r.story.slug} story={r.story} reason={r.reason}/>)}</div></section>}</PeekProvider>;
}
