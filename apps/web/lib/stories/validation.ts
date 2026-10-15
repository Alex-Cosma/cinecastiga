import type { Story } from './types';
import { citedIds, counties, safeExternalUrl } from './shared';
const slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function visibleStories(stories:Story[],previews:boolean):Story[] {
  return stories.filter(s=>s.status==='published'||(previews&&s.status==='preview')).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
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
  const texts=[...s.intro,...(s.sections?.flatMap(v=>v.paragraphs)??[]),...s.timeline.map(e=>e.text)];
  const v=s.visual;
  const visualRefs=!v?[]:v.kind==='map'?[...v.regions,...(v.unlocated??[])].map(r=>r.sourceId):v.kind==='compare'?v.sourceIds:v.bars.flatMap(b=>b.sourceIds);
  const references=[...s.finding.sourceIds,...(s.sections?.flatMap(v=>[...v.sourceIds,...(v.quote?[v.quote.sourceId]:[])])??[]),...s.timeline.flatMap(e=>e.sourceIds),...(s.reply?.sourceIds??[]),
    ...texts.flatMap(citedIds),...visualRefs,...(s.actors?.items.flatMap(a=>a.sourceIds)??[])];
  if(references.some(id=>!s.sources.some(v=>v.id===id)))fail('unknown source');
  if(new Set(s.finding.sourceIds).size!==s.finding.sourceIds.length||s.finding.sourceIds.some(id=>s.sources.find(v=>v.id===id)?.kind!=='procurement'))fail('total selection');
  const records=s.sources.filter(v=>v.kind==='procurement'&&v.record).map(v=>v.kind==='procurement'&&v.record?`${v.record.type}:${v.record.id}`:'');
  if(new Set(records).size!==records.length)fail('duplicate procurement');
  if(s.keyFacts&&(s.keyFacts.length===0||s.keyFacts.some(f=>!f.value.trim()||!f.label.trim())))fail('key facts');
  if(v?.kind==='map'&&([...v.regions,...(v.unlocated??[])].some(r=>!v.groups.some(g=>g.id===r.group))||v.regions.some(r=>!counties.some(c=>c.key===r.county))))fail('visual');
  if(v?.kind==='compare'&&v.rows.some(r=>r.values.length!==2))fail('visual');
  if(v?.kind==='bars'&&v.bars.some(b=>!Number.isFinite(b.value)||b.value<0))fail('visual');
  if(s.actors&&s.actors.items.some(a=>!a.name.trim()||!/^\d+(?:\.\d+)?$/.test(a.won)||(a.entityId!==undefined&&!/^[1-9]\d{0,17}$/.test(a.entityId))))fail('actors');
  if(s.timeline.some(e=>e.date&&!date(e.date))||new Set(s.timeline.map(e=>e.id)).size!==s.timeline.length)fail('timeline');
}
