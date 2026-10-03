import type { Story } from './types';
import { counties, safeExternalUrl } from './shared';
const slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function visibleStories(stories:Story[],environment:string|undefined):Story[] {
  return stories.filter(s=>s.status==='published'||(environment==='development'&&s.status==='preview')).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
}
/** Fail closed on invalid references. No HTML, private dossier links, or executable URLs. */
export function validateStory(s:Story):void {
  const fail=(reason:string):never=>{throw new Error(`Invalid editorial story ${s.slug}: ${reason}`);};
  if(!slug.test(s.slug)||!s.title.trim()||!s.summary.trim()||!s.author.trim())fail('identity');
  if(!date(s.publishedAt)||(s.updatedAt&&!date(s.updatedAt)))fail('publication date');
  if(s.counties.length===0||new Set(s.counties).size!==s.counties.length||s.counties.some(k=>!counties.some(c=>c.key===k)))fail('county');
  if(s.sources.length===0||new Set(s.sources.map(v=>v.id)).size!==s.sources.length)fail('sources');
  for(const source of s.sources){
    if(!slug.test(source.id)||!source.title.trim()||!date(source.observedAt))fail('source identity');
    if(source.kind==='procurement'){
      if(!/^\d+(?:\.\d+)?$/.test(source.amount)||!date(source.date)||!source.authority.trim()||!source.suppliers.length||source.currency!=='RON')fail('record snapshot');
      if(!source.record)fail('missing public record');
      if([source.publishedAt,source.finalizedAt].some(v=>v!==undefined&&(!/^\d{4}-\d{2}-\d{2}T/.test(v)||Number.isNaN(Date.parse(v)))))fail('record timestamp');
      if(source.record&&(!/^[1-9]\d{0,17}$/.test(source.record.id)||(source.record.type==='contract'&&!/^[1-9]\d{0,17}$/.test(source.record.awardNoticeId))))fail('record reference');
    }
    if(source.kind==='external'&&((source.url&&!safeExternalUrl(source.url))||!source.url))fail('external source');
  }
  const references=[...s.finding.sourceIds,...(s.sections?.flatMap(v=>v.sourceIds)??[]),...s.timeline.flatMap(e=>e.sourceIds),...(s.reply?.sourceIds??[])];
  if(references.some(id=>!s.sources.some(v=>v.id===id)))fail('unknown source');
  if(new Set(s.finding.sourceIds).size!==s.finding.sourceIds.length||s.finding.sourceIds.some(id=>s.sources.find(v=>v.id===id)?.kind!=='procurement'))fail('total selection');
  const records=s.sources.filter(v=>v.kind==='procurement'&&v.record).map(v=>v.kind==='procurement'&&v.record?`${v.record.type}:${v.record.id}`:'');
  if(new Set(records).size!==records.length)fail('duplicate procurement');
  if(s.timeline.some(e=>e.date&&!date(e.date))||new Set(s.timeline.map(e=>e.id)).size!==s.timeline.length)fail('timeline');
}
