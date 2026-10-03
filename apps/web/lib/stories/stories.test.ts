import { afterEach,describe,expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { scoala311Story } from './scoala311';
import { aquaparkBuzauStory } from './aquapark-buzau';
import { visibleStories,validateStory } from './validation';
import { readView,sumExact,sourceLinks,safeExternalUrl,countStories,storyTotal } from './shared';
import { getStories } from './catalog';
import type { Story } from './types';
afterEach(()=>vi.unstubAllEnvs());
const example=()=>structuredClone(scoala311Story);
describe('editorial publication and evidence',()=>{
 it('keeps unfinished real reporting and drafts out of production and tests, including direct links',async()=>{
  for(const env of ['production','test']) {
   vi.stubEnv('NODE_ENV',env);expect(await getStories()).toEqual([]);
   expect(visibleStories([example(),aquaparkBuzauStory,{...example(),status:'draft'}],env)).toEqual([]);
   expect(readView(['poveste',scoala311Story.slug],await getStories())).toBeNull();
   expect(readView(['poveste',scoala311Story.slug,'surse','da41081778'],await getStories())).toBeNull();
  }
 });
 it('loads only the real local previews; deleted fictional stories cannot be opened',async()=>{
  vi.stubEnv('NODE_ENV','development');const stories=await getStories();expect(stories.map(s=>s.slug)).toEqual([aquaparkBuzauStory.slug,scoala311Story.slug]);
  for(const s of stories)expect(()=>validateStory(s)).not.toThrow();expect(readView(['poveste','acelasi-drum'],stories)).toBeNull();
  expect(visibleStories([{...example(),status:'published'}],'production')).toHaveLength(1);
 });
 it('keeps the Buzău procurement snapshot separate from payments and the historical contract',()=>{
  const raw=JSON.parse(readFileSync(new URL('../../../../docs/research/20261002-aquapark-buzau/seap-records.json',import.meta.url),'utf8'));
  const story=aquaparkBuzauStory;
  expect(storyTotal(story)).toBe('882174.93');
  expect(story.finding.sourceIds).toEqual(['da41151373']);
  const sources=story.sources.filter(s=>s.kind==='procurement');expect(sources).toHaveLength(2);
  for(const source of sources){
   const r=raw.find((r:{sicapId:string})=>r.sicapId===source.record?.id);expect(r).toBeDefined();
   expect(source.amount).toBe(r.amount);expect(source.code).toBe(r.code);expect(source.authority).toBe(r.authority);
   expect(r.authorityCui).toBe('4233874');
   if(source.record?.type==='direct'){
    expect(source.title).toBe(r.payload.directAcquisitionName);expect(source.suppliers).toEqual([r.supplier]);
    expect(r.supplierCui).toBe('36486492');expect(r.state).toBe('Oferta acceptata');
    expect(source.publishedAt).toBe(r.payload.publicationDate);expect(source.finalizedAt).toBe(r.payload.finalizationDate);
    expect(source.date).toBe('2026-09-11');expect(source.cpv).toBe(r.cpv);
   }else{
    expect(source.record?.awardNoticeId).toBe(r.awardNoticeId);expect(source.title).toBe(r.title);
    expect(source.suppliers).toEqual(r.suppliers.map((s:{name:string})=>s.name));
    expect(r.suppliers.map((s:{cui:string})=>s.cui)).toEqual(['24031012']);
    expect(r.archivedPayloadAvailable).toBe(false);expect(r.awardArchivedPayloadAvailable).toBe(false);
    expect(source.date).toBe('2024-11-05');
    expect(new Date(r.contractDate).toLocaleDateString('sv-SE',{timeZone:'Europe/Bucharest'})).toBe(source.date);
    expect(story.finding.sourceIds).not.toContain(source.id);
   }
  }
  expect((Date.parse('2026-09-11')-Date.parse('2026-06-01'))/86400000).toBe(102);
  // Amount correction from audit includes 19% VAT; these are not separate contracts to sum.
  expect((4814242200n-4790726600n)*119n/100n).toBe(27983564n);
  expect(story.sources.find(s=>s.id==='audit-conformitate')?.title).toContain('7–10');
 });
 it('preserves high precision and excludes the context purchase from the seven-record total',()=>{
  expect(sumExact(['0.1','0.2'])).toBe('0.30');expect(sumExact(['9007199254740993.12345','0.00006'])).toBe('9007199254740993.12351');
  expect(storyTotal(example())).toBe('919661.16');expect(example().finding.sourceIds).not.toContain('da41159391');expect(()=>sumExact(['NaN'])).toThrow();
 });
 it('matches each published fact sheet to the archived public record, including exact timestamps and identity',()=>{
  const raw=JSON.parse(readFileSync(new URL('../../../../docs/research/20261002-scoala311/seap-records.json',import.meta.url),'utf8'));
  const records=example().sources.filter(s=>s.kind==='procurement').filter(s=>!['da38610396','da39350427'].includes(s.id));expect(records).toHaveLength(8);
  for(const source of records) {
   const r=raw.find((v:{sicapId:string})=>v.sicapId===source.record?.id);expect(r).toBeDefined();
   expect(source.amount).toBe(r.amount);expect(source.title).toBe(r.payload.directAcquisitionName);
   expect(source.code).toBe(r.code);expect(source.cpv).toBe(r.cpv);expect(source.publishedAt).toBe(r.payload.publicationDate);expect(source.finalizedAt).toBe(r.payload.finalizationDate);
   expect(r.state).toBe('Oferta acceptata');expect(r.authorityCui).toBe('32167245');expect(source.suppliers).toEqual([r.supplier]);
  }
  const included=records.filter(s=>example().finding.sourceIds.includes(s.id));expect(included).toHaveLength(7);
  const times=included.map(s=>Date.parse(s.finalizedAt!));expect((Math.max(...times)-Math.min(...times))/1000).toBe(99);
  expect(sumExact(records.filter(s=>['da41081898','da41081882','da41081842'].includes(s.id)).map(s=>s.amount))).toBe('511594.44');
 });
 it('preserves the separate M&M evidence and discloses its missing original payloads',()=>{
  const raw=JSON.parse(readFileSync(new URL('../../../../docs/research/20261002-scoala311/mm-records.json',import.meta.url),'utf8'));
  const records=example().sources.filter(s=>s.kind==='procurement').filter(s=>['da38610396','da39350427'].includes(s.id));
  expect(records).toHaveLength(2);expect(sumExact(records.map(s=>s.amount))).toBe('161436.39');
  for(const source of records){
   const r=raw.find((v:{sicapId:string})=>v.sicapId===source.record?.id);expect(r).toBeDefined();
   expect(source.amount).toBe(r.amount);expect(source.code).toBe(r.code);expect(source.cpv).toBe(r.cpv);
   expect(source.suppliers).toEqual([r.supplier]);expect(r.authorityCui).toBe('32167245');expect(r.supplierCui).toBe('16617020');
   expect(Date.parse(source.finalizedAt!)).toBe(Date.parse(r.finalizedAt));expect(Date.parse(source.publishedAt!)).toBe(Date.parse(r.publishedAt));
   expect(r.archivedPayloadAvailable).toBe(false);expect(r.title).toBeNull();expect(source.title).toContain('titlu indisponibil');
   expect(example().finding.sourceIds).not.toContain(source.id);
  }
  expect(storyTotal(example())).toBe('919661.16');
 });
 it('rejects phantom citations in the narrative and duplicate procurement references',()=>{
  const s=example();s.sections![0]!.sourceIds.push('missing');expect(()=>validateStory(s)).toThrow('unknown source');
  const q=example();q.finding.sourceIds.push(q.finding.sourceIds[0]!);expect(()=>validateStory(q)).toThrow('total selection');
  const r=example();for(const source of r.sources)if(source.kind==='procurement')source.record={type:'direct',id:'123'};expect(()=>validateStory(r)).toThrow('duplicate procurement');
 });
 it('requires real record references even for local previews',()=>{
  const s=example();const record=s.sources.find(s=>s.kind==='procurement')!;if(record.kind==='procurement')record.record=null;
  expect(()=>validateStory(s)).toThrow('missing public record');
  const q=example(),external=q.sources.find(s=>s.kind==='external')!;if(external.kind==='external')external.url=null;expect(()=>validateStory(q)).toThrow('external source');
 });
 it('uses canonical public detail and official routes',()=>{
  const d=example().sources[0]!;if(d.kind!=='procurement')throw new Error('fixture');
  expect(sourceLinks({...d,record:{type:'direct',id:'123'}})).toEqual({detail:'/achizitii/123',official:'https://e-licitatie.ro/pub/direct-acquisition/view/123'});
  expect(sourceLinks({...d,record:{type:'contract',id:'456',awardNoticeId:'789'}})).toEqual({detail:'/contracte/456',official:'https://e-licitatie.ro/pub/notices/ca-notices/view-c/789'});
 });
 it('rejects executable URLs, credentials and invalid dates',()=>{
  for(const u of ['javascript:alert(1)','data:text/html,x','https://user:secret@example.org/x','/anchete/private'])expect(safeExternalUrl(u)).toBeNull();
  const s=example();s.sources.push({id:'unsafe',title:'Unsafe',observedAt:'2026-10-02',kind:'external',url:'javascript:alert(1)',publisher:'Publisher',summary:'Text'});expect(()=>validateStory(s)).toThrow('external source');
  const q=example();q.publishedAt='2026-02-31';expect(()=>validateStory(q)).toThrow('publication date');
 });
 it('counts a multi-county story once per county and rejects missing sources',()=>{
  const s=example();s.counties=['cluj','buzau'];expect(countStories([s],'cluj')).toBe(1);expect(countStories([s],'buzau')).toBe(1);
  expect(readView(['judet','satu-mare'],[s])).toEqual({kind:'county',county:'satu mare'});expect(readView(['poveste',s.slug],[s])).toEqual({kind:'story',slug:s.slug});expect(readView(['poveste',s.slug,'surse','unknown'],[s])).toBeNull();
 });
});
