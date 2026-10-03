'use client';
import { useEffect,useRef,useState } from 'react';
import { flushSync } from 'react-dom';
import type { Story,StoryView } from '@/lib/stories/types';
import {STORIES_BASE,countyHref,countyLabel,storyHref,readView,storyCount,dateLabel} from '@/lib/stories/shared';
import StoryMap,{CountySilhouette,prepareCountyFlight} from './StoryMap';
import StoryArt from './StoryArt';
import {Icon,StoryTitle,StoryMeta,StoryCard} from './StoryParts';
import StoryArticle from './StoryArticle';
import StoryEvidence,{SourcePage} from './StoryEvidence';
function viewPath(view:StoryView):string {return view.kind==='atlas'?STORIES_BASE:view.kind==='county'?countyHref(view.county):view.kind==='source'?`${storyHref(view.slug)}/surse/${encodeURIComponent(view.sourceId)}`:storyHref(view.slug);}
function Atlas({stories}:{stories:Story[]}){const lead=stories[0];return <><section className="atlas-heading"><div><h1>Ce bate la ochi<span className="punct">.</span></h1><p>Povești despre banii publici. Cu toate firele la vedere.</p></div>{lead&&<a className="text-link" href="#povesti">Vezi toate poveștile <Icon name="arrow"/></a>}</section><div className="atlas-layout"><StoryMap stories={stories}/><aside className="latest">{lead?<><h2>Un fir de la care să începi</h2><a className="cover-link" href={storyHref(lead.slug)} aria-label={lead.title}><StoryArt kind={lead.illustration} transition={`story-cover-${lead.slug}`}/></a><div className="meta"><span>{lead.counties.map(countyLabel).join(', ')} · {lead.topic}</span><span>{lead.minutes} min</span></div><StoryTitle story={lead} className="lead-title"/><p>{lead.summary}</p><a className="text-link" href={storyHref(lead.slug)}>Urmărește povestea <Icon name="arrow"/></a>{stories.slice(1,3).map(s=><div className="next-story" key={s.slug}><span className="meta">{s.counties.map(countyLabel).join(', ')} · {s.topic}</span><StoryTitle story={s}/></div>)}</>:<div className="reading-note"><h2>Primele povești sunt în pregătire.</h2><p>Vor apărea aici după documentare și verificare, împreună cu sursele lor.</p><a className="text-link" href="/intreaba">Explorează datele <Icon name="arrow"/></a></div>}</aside></div>{lead&&<section id="povesti" className="all-stories"><div className="section-head"><h2>Mai multe fire de urmărit</h2><span>{storyCount(stories.length)}</span></div><div className="story-grid">{stories.map(s=><StoryCard key={s.slug} story={s} shared={false}/>)}</div></section>}</>;}
function County({county,stories}:{county:string;stories:Story[]}){
 const [topic,setTopic]=useState('Toate'),ss=stories.filter(s=>s.counties.includes(county)),filtered=topic==='Toate'?ss:ss.filter(s=>s.topic===topic),first=filtered[0];
 return <><a className="back-link" href={STORIES_BASE}><Icon name="back"/> Înapoi la hartă</a><section className="county-masthead"><div><h1>{countyLabel(county)}<span className="punct">.</span></h1><p>{ss.length?`${storyCount(ss.length)}. Pornește de la una și urmărește documentele.`:'Încă nicio poveste publicată în acest județ.'}</p></div><CountySilhouette county={county}/></section>
 {ss.length>0?<><div className="filter-row" role="group" aria-label="Filtrează poveștile">{['Toate',...new Set(ss.map(s=>s.topic))].map(t=><button key={t} onClick={()=>setTopic(t)} aria-pressed={topic===t}>{t}{t==='Toate'&&<span> {ss.length}</span>}</button>)}<span className="quiet">Cele mai noi întâi</span></div>{first&&<section className="county-stories" aria-label="Poveștile județului"><article className="featured"><a className="cover-link" href={storyHref(first.slug)} aria-label={first.title}><StoryArt kind={first.illustration} transition={`story-cover-${first.slug}`}/></a><StoryMeta story={first}/><StoryTitle story={first} className="featured-title"/><p>{first.summary}</p><div className="featured-bottom"><span>{first.author} · {dateLabel(first.publishedAt)}</span><a className="text-link" href={storyHref(first.slug)}>Citește povestea <Icon name="arrow"/></a></div></article><div className="county-secondary">{filtered.slice(1).map(s=><article className="side-story" key={s.slug}><a href={storyHref(s.slug)} className="cover-link" aria-label={s.title}><StoryArt kind={s.illustration} transition={`story-cover-${s.slug}`}/></a><StoryMeta story={s}/><StoryTitle story={s}/><p>{s.summary}</p></article>)}{filtered.length===1&&<div className="reading-note"><h2>Fiecare afirmație are un punct de plecare.</h2><p>În poveste găsești cronologia, înregistrările folosite și întrebările care rămân deschise.</p><a className="text-link" href={STORIES_BASE}>Vezi și alte județe <Icon name="arrow"/></a></div>}</div></section>}</>:<section className="empty-state"><h2>Aici povestea încă nu a început.</h2><p>Lipsa unei povești nu spune că nu există probleme. Înseamnă doar că nu am publicat una aici.</p><a className="button" href={STORIES_BASE}>Alege alt județ <Icon name="arrow"/></a><a className="text-link" href="/intreaba" target="_blank" rel="noopener noreferrer">Explorează tu datele <Icon name="external"/></a></section>}
 <div className="county-close"><span>Povești documentate. Date pe care le poți verifica.</span><a className="text-link" href={STORIES_BASE}>Alt județ <Icon name="arrow"/></a></div></>;
}
export default function StoriesClient({stories,initialView}:{stories:Story[];initialView:StoryView}){
 const [view,setView]=useState(initialView),[sourceId,setSourceId]=useState<string|null>(null),root=useRef<HTMLDivElement>(null),busy=useRef(false),current=useRef(view),scrollPositions=useRef(new Map<string,number>());
 current.current=view;
 const story='slug' in view?stories.find(s=>s.slug===view.slug):undefined;
 const navigate=useRef<(path:string,push?:boolean)=>Promise<void>>(async()=>{});
 navigate.current=async(path,push=true)=>{
  if(busy.current)return;
  const parts=path.slice(STORIES_BASE.length).split('/').filter(Boolean).map(decodeURIComponent),next=readView(parts,stories);if(!next||!root.current)return;
  const previous=current.current;if(viewPath(next)===viewPath(previous))return;
  busy.current=true;scrollPositions.current.set(viewPath(previous),scrollY);let clean=()=>{},updated=false;
  const update=()=>{updated=true;flushSync(()=>{setSourceId(null);if(push)history.pushState(null,'',path);setView(next);});window.scrollTo({top:push?0:scrollPositions.current.get(viewPath(next))??0,behavior:'instant'});root.current?.focus({preventScroll:true});if(next.kind==='atlas'&&previous.kind==='county'&&root.current)clean=prepareCountyFlight(root.current,previous.county);};
  try{
   if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches){if(previous.kind==='atlas'&&next.kind==='county')clean=prepareCountyFlight(root.current,next.county);document.documentElement.dataset.storiesTransition='true';await document.startViewTransition(update).finished;}
   else update();
  }catch{if(!updated)update();}finally{clean();delete document.documentElement.dataset.storiesTransition;busy.current=false;}
 };
 useEffect(()=>{const header=document.querySelector<HTMLElement>('.site-header');if(!header)return;const measure=()=>root.current?.style.setProperty('--stories-header-height',`${header.getBoundingClientRect().height}px`);measure();const observer=new ResizeObserver(measure);observer.observe(header);return()=>observer.disconnect();},[]);
 useEffect(()=>{const pop=()=>{if(location.pathname===STORIES_BASE||location.pathname.startsWith(STORIES_BASE+'/'))void navigate.current(location.pathname,false);};window.addEventListener('popstate',pop);return()=>{window.removeEventListener('popstate',pop);delete document.documentElement.dataset.storiesTransition;};},[]);
 useEffect(()=>{const title=view.kind==='atlas'?'Ce bate la ochi':view.kind==='county'?countyLabel(view.county):view.kind==='source'?story?.sources.find(s=>s.id===view.sourceId)?.title:story?.title;document.title=`${title??'Ce bate la ochi'} — cinecâștigă?`;},[view,story]);
 return <div className="stories-page" ref={root} tabIndex={-1} onClick={event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const a=(event.target as Element).closest('a');if(!a||a.getAttribute('target')==='_blank'||a.hasAttribute('download'))return;const href=a.getAttribute('href');if(!href)return;
  const url=new URL(href,location.href);if(url.origin!==location.origin||!(url.pathname===STORIES_BASE||url.pathname.startsWith(STORIES_BASE+'/'))||url.hash)return;
  event.preventDefault();
  // When entering from the all-stories grid, capture the illustration actually clicked.
  const card=a.closest('.story-card');if(card){const cover=card.querySelector<HTMLElement>('.cover');const slug=url.pathname.split('/').at(-1);if(cover&&slug){root.current?.querySelectorAll<HTMLElement>('.cover').forEach(el=>{if(el.style.viewTransitionName===`story-cover-${slug}`)el.style.viewTransitionName='none';});cover.style.viewTransitionName=`story-cover-${slug}`;}}
  void navigate.current(url.pathname);
 }}>
 {stories.some(s=>s.status==='preview')&&<div className="editorial-banner"><span>În documentare · doar local</span> Date reale. Text în lucru, înainte de publicare.</div>}
 {view.kind==='atlas'?<Atlas stories={stories}/>:view.kind==='county'?<County county={view.county} stories={stories} key={view.county}/>:story&&view.kind==='source'?<SourcePage story={story} source={story.sources.find(s=>s.id===view.sourceId)!}/>:story?<StoryArticle key={story.slug} story={story} stories={stories} openSource={setSourceId}/>:null}
 {story&&sourceId&&<StoryEvidence story={story} sourceId={sourceId} onSelect={setSourceId} onClose={()=>setSourceId(null)}/>}
 </div>;
}
