'use client';
import { Fragment,type PointerEvent as ReactPointerEvent } from 'react';
import { counties,dateLabel,splitCitations,sourceNumber,sumExact } from '@/lib/stories/shared';
import { glossaryTerm,markTerms } from '@/lib/stories/glossary';
import type { Story,StorySource,StoryVisual } from '@/lib/stories/types';
import { bounds } from './StoryMap';
import { Icon,money } from './StoryParts';
import { usePeek } from './StoryPeek';
type Open=(id:string)=>void;
const title=(story:Story,id:string)=>story.sources.find(s=>s.id===id)?.title??id;
const clip=(text:string,n=190)=>text.length>n?`${text.slice(0,n).replace(/\s+\S*$/,'')}…`:text;
/** Preview of a source: enough to judge it without leaving the paragraph. */
export function sourcePeek(source:StorySource|undefined,n:number){
 if(!source)return {kicker:`Sursa ${n}`,title:'Sursă indisponibilă'};
 if(source.kind==='procurement')return {kicker:`Sursa ${n} · înregistrare de achiziție`,title:source.title,meta:`${money(source.amount)} · ${dateLabel(source.date)}`,text:`${source.authority} → ${source.suppliers.join(', ')}`,hint:'Apasă pentru fișa completă'};
 if(source.kind==='external')return {kicker:`Sursa ${n} · ${source.publisher}`,title:source.title,text:clip(source.summary),hint:'Apasă pentru fișă și link'};
 return {kicker:`Sursa ${n} · observația noastră`,title:source.title,text:clip(source.text),hint:'Apasă pentru nota completă'};
}
const mouse=(e:ReactPointerEvent)=>e.pointerType==='mouse';
function CiteButton({story,id,openSource}:{story:Story;id:string;openSource:Open}){
 const peek=usePeek(),n=sourceNumber(story,id),content=()=>sourcePeek(story.sources.find(s=>s.id===id),n);
 return <button className="cite" onClick={()=>{peek?.hide();openSource(id);}} aria-label={`Sursa ${n}: ${title(story,id)}`}
  onPointerEnter={e=>{if(mouse(e))peek?.show(e.currentTarget,content());}} onPointerLeave={e=>{if(mouse(e))peek?.hide();}}
  onFocus={e=>{if(e.currentTarget.matches(':focus-visible'))peek?.show(e.currentTarget,content());}} onBlur={()=>peek?.hide()}>{n}</button>;
}
/** A procurement term explained in place, at its first use in the story. */
function Term({id,text}:{id:string;text:string}){
 const peek=usePeek(),t=glossaryTerm(id)!,content={kicker:'Pe înțeles',title:t.term,text:t.text,hint:'Mai multe în Metodologie'};
 return <button type="button" className="term" aria-describedby={peek?.id}
  onClick={e=>peek?.toggle(e.currentTarget,content)} onPointerEnter={e=>{if(mouse(e))peek?.show(e.currentTarget,content);}} onPointerLeave={e=>{if(mouse(e))peek?.hide();}}
  onFocus={e=>{if(e.currentTarget.matches(':focus-visible'))peek?.show(e.currentTarget,content);}} onBlur={()=>peek?.hide()}>{text}</button>;
}

/** Inline [[source-id]] markers rendered as numbered notes that open the source drawer; `terms` are explained here. */
export function Cited({story,text,openSource,terms=[]}:{story:Story;text:string;openSource:Open;terms?:string[]}){
 let pending=terms;
 return <>{splitCitations(text).map((p,i)=>{
  if('ref' in p)return <CiteButton key={i} story={story} id={p.ref} openSource={openSource}/>;
  const parts=pending.length?markTerms(p.text,pending):[{text:p.text}];
  pending=pending.filter(id=>!parts.some(x=>'term' in x&&x.term===id));
  return <Fragment key={i}>{parts.map((x,j)=>'term' in x?<Term key={j} id={x.term} text={x.text}/>:<Fragment key={j}>{x.text}</Fragment>)}</Fragment>;
 })}</>;
}
/** Compact numbered source list, replacing one button per document. */
export function Notes({story,ids,openSource,label='Surse'}:{story:Story;ids:string[];openSource:Open;label?:string}){
 const unique=[...new Set(ids)].sort((a,b)=>sourceNumber(story,a)-sourceNumber(story,b));
 if(!unique.length)return null;
 return <div className="notes"><span>{label}</span>{unique.map(id=><CiteButton key={id} story={story} id={id} openSource={openSource}/>)}</div>;
}
export function KeyFacts({story}:{story:Story}){
 return <dl className="key-facts">{story.keyFacts!.map(f=><div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>;
}
export function MapFigure({story,v,openSource}:{story:Story;v:Extract<StoryVisual,{kind:'map'}>;openSource:Open}){
 const tone=(group:string)=>`tone-${v.groups.findIndex(g=>g.id===group)}`;
 const located=new Map(v.regions.map(r=>[r.county,r])),unlocated=new Set((v.unlocated??[]).map(u=>u.label));
 return <div className="figure-map">
  <svg className="romania story-romania" viewBox="-15 -15 1030 745" role="group" aria-label={v.title}>
   {counties.map(c=>{const r=located.get(c.key);return r?<a key={c.key} href={`#${r.sourceId}`} onClick={e=>{e.preventDefault();openSource(r.sourceId);}} aria-label={`${r.label}: ${v.groups.find(g=>g.id===r.group)?.label}. Deschide sursa`}><path className={`county region ${tone(r.group)}`} d={c.d}/></a>:<path key={c.key} className="county level-0 inert" d={c.d}/>;})}
   {v.regions.map(r=>{const c=counties.find(c=>c.key===r.county)!;const b=bounds(c.d);return <text key={r.county} className="region-label" x={b.x+b.w/2} y={b.y+b.h/2+5} textAnchor="middle" aria-hidden="true">{r.label}</text>;})}
  </svg>
  <ul className="figure-legend">{v.groups.map(g=>{const items=[...v.regions,...(v.unlocated??[])].filter(r=>r.group===g.id);return <li key={g.id}><i className={tone(g.id)}/><div><b>{g.label}</b><span>{items.map((r,i)=><Fragment key={r.label}>{i>0&&', '}<button className="text-button" onClick={()=>openSource(r.sourceId)}>{r.label}</button>{unlocated.has(r.label)&&'*'}</Fragment>)}</span></div></li>;})}</ul>
  {unlocated.size>0&&<p className="figure-note">* Unitate fără localizare verificată; nu apare pe hartă.</p>}
 </div>;
}
function CompareFigure({story,v,openSource}:{story:Story;v:Extract<StoryVisual,{kind:'compare'}>;openSource:Open}){
 const same=v.rows.filter(r=>r.values[0]===r.values[1]).length;
 return <div className="figure-compare">
  <div className="compare-head"><span/>{v.columns.map((c,i)=><button key={c} onClick={()=>openSource(v.sourceIds[i]!)}>{c}<Icon name="arrow"/></button>)}</div>
  {v.rows.map(r=>{const eq=r.values[0]===r.values[1];return <div key={r.label} className={`compare-row ${eq?'same':'diff'}`}><span className="compare-label">{r.label}</span>{eq?<span className="compare-cell compare-both"><em>la fel în ambele</em>{r.values[0]}</span>:r.values.map((x,i)=><span key={i} className="compare-cell"><small>{v.columns[i]}</small>{x}</span>)}</div>;})}
  <p className="compare-total"><b>{same} din {v.rows.length}</b> rânduri identice</p>
 </div>;
}
function BarsFigure({story,v,openSource}:{story:Story;v:Extract<StoryVisual,{kind:'bars'}>;openSource:Open}){
 const max=Math.max(...v.bars.map(b=>b.value),1);
 return <div className="figure-bars">{v.bars.map(b=><div key={b.label} className={b.highlight?'highlight':undefined}><span className="bar-label">{b.label}{b.note&&<small>{b.note}</small>}</span><span className="bar-track"><i style={{width:`${b.value/max*100}%`}}/></span><b>{b.display}</b><Notes story={story} ids={b.sourceIds} openSource={openSource} label=""/></div>)}</div>;
}
export function StoryFigure({story,openSource,inline=false}:{story:Story;openSource:Open;inline?:boolean}){
 const v=story.visual!;
 return <figure className={inline?'story-figure inline':'story-figure'}><figcaption><h2>{v.title}</h2><p>{v.caption}</p></figcaption>
  {v.kind==='map'?<MapFigure story={story} v={v} openSource={openSource}/>:v.kind==='compare'?<CompareFigure story={story} v={v} openSource={openSource}/>:<BarsFigure story={story} v={v} openSource={openSource}/>}
 </figure>;
}
/** Amount won set against the firm's reported size. The ceiling may cover several years; the revenue covers one. */
function ActorScale({won,revenue}:{won:string;revenue:{amount:string;label:string}}){
 const r=Number(revenue.amount),ratio=r>0?Number(won)/r:null;
 return <p className="actor-scale">{ratio===null?<><b>0 lei</b><span>{revenue.label}</span></>:<><b>{ratio>=10?Math.round(ratio).toLocaleString('ro-RO'):ratio.toLocaleString('ro-RO',{maximumFractionDigits:1})}×</b><span>{revenue.label}</span></>}</p>;
}
export function Actors({story,openSource,heading=true}:{story:Story;openSource:Open;heading?:boolean}){
 const a=story.actors!,scaled=a.items.some(x=>x.revenue);
 return <div className="actors">{heading&&<h2>{a.title}</h2>}{a.intro&&<p>{a.intro}</p>}<div className="actor-grid">{a.items.map(x=><article key={x.name} className="actor">
  <h3>{x.entityId?<a href={`/entitati/${x.entityId}`} target="_blank" rel="noopener noreferrer">{x.name} <Icon name="external"/></a>:x.name}</h3>
  <dl>{x.facts.map(f=><div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
  <p className="actor-won"><b>{money(x.won)}</b><span>{x.wonLabel}</span></p>
  {x.revenue&&<ActorScale won={x.won} revenue={x.revenue}/>}
  <Notes story={story} ids={x.sourceIds} openSource={openSource}/>
 </article>)}</div>{scaled&&<p className="actor-note">Raport orientativ: valoarea câștigată poate acoperi mai mulți ani, veniturile raportate acoperă un singur an.</p>}</div>;
}
/** Finding bars aggregated by first supplier, for stories where one firm holds several records. */
export function supplierGroups(story:Story){
 const map=new Map<string,{supplier:string;ids:string[];amounts:string[]}>();
 for(const id of story.finding.sourceIds){const s=story.sources.find(s=>s.id===id);if(s?.kind!=='procurement')continue;const k=s.suppliers[0]!;const g=map.get(k)??{supplier:k,ids:[],amounts:[]};g.ids.push(id);g.amounts.push(s.amount);map.set(k,g);}
 return [...map.values()].map(g=>({...g,total:sumExact(g.amounts)})).sort((a,b)=>Number(b.total)-Number(a.total));
}
