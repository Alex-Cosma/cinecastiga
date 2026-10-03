import { countyMap, foldCounty } from '../map';
import { daUrl, awardUrl } from '../elicitatie';
import type { Story, StorySource, StoryView } from './types';
export const STORIES_BASE = '/ce-bate-la-ochi';
const names: Record<string,string> = {arges:'Argeș',bacau:'Bacău','bistrita-nasaud':'Bistrița-Năsăud',botosani:'Botoșani',brasov:'Brașov',braila:'Brăila',bucuresti:'București',buzau:'Buzău',calarasi:'Călărași','caras-severin':'Caraș-Severin',constanta:'Constanța',dambovita:'Dâmbovița',galati:'Galați',iasi:'Iași',ialomita:'Ialomița',mehedinti:'Mehedinți',mures:'Mureș',neamt:'Neamț',salaj:'Sălaj',timis:'Timiș'};
export const counties = countyMap.shapes.map(s=>({...s,label:names[s.key]??s.label}));
export const countyLabel = (key:string) => counties.find(c=>c.key===key)?.label ?? key;
export const countyHref = (key:string) => `${STORIES_BASE}/judet/${encodeURIComponent(key.replaceAll(' ','-'))}`;
export const storyHref = (slug:string) => `${STORIES_BASE}/poveste/${encodeURIComponent(slug)}`;
export const sourceHref = (slug:string,id:string) => `${storyHref(slug)}/surse/${encodeURIComponent(id)}`;
export const matchingCounties = (q:string) => [...counties].filter(c=>foldCounty(c.label).includes(foldCounty(q))).sort((a,b)=>a.label.localeCompare(b.label,'ro'));
export const countStories = (stories:Story[],county:string) => stories.filter(s=>s.counties.includes(county)).length;
export const storyCount = (n:number) => `${n} ${n===1?'poveste':'povești'}`;
export const storyBucket = (n:number) => n===0?0:n===1?1:n<=3?2:n<=7?3:4;
export const dateLabel = (date:string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('ro-RO',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Bucharest'});
/** Decimal arithmetic: stored precision survives editorial totals, without floating point. */
export function sumExact(values:string[]):string {
  if(values.some(v=>!/^\d+(?:\.\d+)?$/.test(v))) throw new Error('Invalid decimal amount');
  const scale=Math.max(2,...values.map(v=>v.split('.')[1]?.length??0));
  const sum=values.reduce((n,v)=>{const [whole='0',fraction='']=v.split('.');return n+BigInt(whole+fraction.padEnd(scale,'0'));},0n).toString().padStart(scale+1,'0');
  return sum.slice(0,-scale)+'.'+sum.slice(-scale);
}
export function safeExternalUrl(value:string|null):string|null {
  if(!value) return null;
  try { const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null; } catch { return null; }
}
export function sourceLinks(source:StorySource):{detail:string|null;official:string|null} {
  if(source.kind==='external') return {detail:safeExternalUrl(source.url),official:null};
  if(source.kind!=='procurement'||!source.record) return {detail:null,official:null};
  const r=source.record;
  return r.type==='direct'?{detail:`/achizitii/${r.id}`,official:daUrl(r.id)}:{detail:`/contracte/${r.id}`,official:awardUrl(r.awardNoticeId)};
}
export function readView(path:string[],stories:Story[]):StoryView|null {
  if(!path.length) return {kind:'atlas'};
  if(path.length===2&&path[0]==='judet') {const c=counties.find(c=>c.key.replaceAll(' ','-')===path[1]);return c?{kind:'county',county:c.key}:null;}
  if(path[0]==='poveste') {const s=stories.find(s=>s.slug===path[1]);if(!s)return null;
    if(path.length===2)return{kind:'story',slug:s.slug};
    if(path.length===4&&path[2]==='surse'&&s.sources.some(v=>v.id===path[3]))return{kind:'source',slug:s.slug,sourceId:path[3]!};
  }
  return null;
}
export function storyTotal(story:Story) {return sumExact(story.finding.sourceIds.flatMap(id=>{const s=story.sources.find(s=>s.id===id);return s?.kind==='procurement'?[s.amount]:[];}));}
