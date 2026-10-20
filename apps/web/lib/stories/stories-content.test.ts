import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateStory } from './validation';
import { sumExact,storyTotal,splitCitations } from './shared';
import { readPreviewStories } from './preview-files';
import type { Story } from './types';

/** Editorial checks of the unpublished reporting, which is not in the public
 * repository. Point STORIES_PREVIEW_DIR at the server-only story files to run them
 * (local copy: ../seap-research/docs/research/20261012-claude-stories/preview-stories). */
const dir=process.env.STORIES_PREVIEW_DIR;
const load=(slug:string)=>JSON.parse(readFileSync(join(dir!,`${slug}.json`),'utf8')) as Story;
describe.skipIf(!dir)('editorial preview content',()=>{
 const scoala311Story=dir?load('scoala-311-sapte-achizitii'):null!,aquaparkBuzauStory=dir?load('aquapark-buzau-banii-si-vara-ratata'):null!;
 const antigrindinaStory=dir?load('antigrindina-unitatile-la-firme-de-paza'):null!,aeroclubStory=dir?load('aeroclubul-romaniei-pompieri-de-doua-ori'):null!,a7BuzauStory=dir?load('a7-buzau-curatenie-49-milioane'):null!;
 const example=()=>structuredClone(scoala311Story);
 it('loads every server preview through the same validation as the site',async()=>{
  const logs:string[]=[];expect((await readPreviewStories(dir,m=>logs.push(m))).length).toBeGreaterThanOrEqual(5);expect(logs).toEqual([]);
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
 it('keeps the 12 October previews tied to the production records, with ceilings separate from context',()=>{
  // Snapshot read from production on 12 October 2026: contract id, award notice id, stored timestamp (UTC), amount.
  const records:Record<string,[string,string,string,string]>={
   'cadru-maramures':['107816316','100640464','2026-07-01T21:00:00Z','17000639.44'],'cadru-oltenia':['107816308','100640459','2026-07-01T21:00:00Z','9305892.82'],
   'cadru-vrancea-2026':['107816307','100640457','2026-07-01T21:00:00Z','9934523.80'],'cadru-iasi':['107816306','100640456','2026-07-01T21:00:00Z','8214018.69'],
   'cadru-prahova':['107816304','100640455','2026-07-01T21:00:00Z','5982230.34'],'cadru-timis':['107816312','100640460','2026-07-01T21:00:00Z','5194815.64'],
   'cadru-mures':['107816313','100640462','2026-07-01T21:00:00Z','5032012.74'],'cadru-gc-sud':['107816315','100640463','2026-07-01T21:00:00Z','4839108.35'],
   'cadru-vrancea-2025':['106787907','100576044','2025-09-14T21:00:00Z','11390700'],
   'cadru-90':['107798317','100639377','2026-04-29T21:00:00Z','14619654.72'],'contract-181':['107891460','100644936','2026-07-14T21:00:00Z','14783123.50'],
   'cadru-paza-159':['107797347','100639307','2026-06-25T21:00:00Z','24225190.60'],
   'cadru-a7':['108065116','100654428','2026-09-07T21:00:00Z','49462662.10'],'contract-velstand':['107534726','100623199','2026-04-16T21:00:00Z','357825.26'],
   'cadru-a2-a4':['107779497','100638274','2024-07-15T21:00:00Z','31483826.63'],
   'da-decembrie':['121289388','','2025-12-19T05:22:16Z','242699'],'da-februarie':['121503914','','2026-02-06T06:54:43Z','242699'],
  };
  const stories=[antigrindinaStory,aeroclubStory,a7BuzauStory];
  for(const story of stories){
   expect(()=>validateStory(story)).not.toThrow();expect(story.status).toBe('preview');
   for(const source of story.sources)if(source.kind==='procurement'){
    const r=records[source.id];expect(r,source.id).toBeDefined();const [id,award,stored,amount]=r!;
    expect(source.record?.id).toBe(id);if(source.record?.type==='contract')expect(source.record.awardNoticeId).toBe(award);
    expect(source.amount).toBe(amount);
    // SEAP stores Romanian midnight as 21:00 UTC on the previous day; the calendar date is Romanian.
    expect(new Date(stored).toLocaleDateString('sv-SE',{timeZone:'Europe/Bucharest'})).toBe(source.date);
   }
  }
  expect(storyTotal(antigrindinaStory)).toBe('65503241.82');expect(antigrindinaStory.finding.sourceIds).not.toContain('cadru-vrancea-2025');
  expect(sumExact(antigrindinaStory.sources.filter(s=>s.kind==='procurement'&&antigrindinaStory.finding.sourceIds.includes(s.id)&&!s.suppliers[0]!.startsWith('ELECTROMECANICA')).map(s=>s.kind==='procurement'?s.amount:'0'))).toBe('59521011.48');
  expect(storyTotal(aeroclubStory)).toBe('29402778.22');expect(aeroclubStory.finding.sourceIds).not.toContain('cadru-paza-159');
  expect(storyTotal(a7BuzauStory)).toBe('49462662.10');expect(a7BuzauStory.finding.sourceIds).toEqual(['cadru-a7']);
 });
 it('validates inline citations, figures and supplier profiles against the story sources',()=>{
  const a=structuredClone(antigrindinaStory);a.intro[0]+='[[missing]]';expect(()=>validateStory(a)).toThrow('unknown source');
  const b=structuredClone(antigrindinaStory);if(b.visual?.kind==='map')b.visual.regions[0]!.group='nobody';expect(()=>validateStory(b)).toThrow('visual');
  const c=structuredClone(antigrindinaStory);if(c.visual?.kind==='map')c.visual.regions[0]!.sourceId='missing';expect(()=>validateStory(c)).toThrow('unknown source');
  const d=structuredClone(aeroclubStory);d.actors!.items[0]!.won='29,4';expect(()=>validateStory(d)).toThrow('actors');
  const e=structuredClone(a7BuzauStory);e.keyFacts=[];expect(()=>validateStory(e)).toThrow('key facts');
  expect(splitCitations('A[[x-1]] b.[[y]]')).toEqual([{text:'A'},{ref:'x-1'},{text:' b.'},{ref:'y'}]);
  // Profile totals restate the finding; they must not drift from the records.
  expect(antigrindinaStory.actors!.items.map(x=>x.won)).toEqual(['27227467.82','22359019.86','9934523.80']);
  expect(aeroclubStory.actors!.items[0]!.won).toBe(storyTotal(aeroclubStory));expect(a7BuzauStory.actors!.items[0]!.won).toBe(storyTotal(a7BuzauStory));
 });
 it('keeps the reader-flow text short and gives every story its own scene',()=>{
  const all=[scoala311Story,aquaparkBuzauStory,antigrindinaStory,aeroclubStory,a7BuzauStory];
  for(const s of all){
   expect(s.summary.length,s.slug).toBeLessThanOrEqual(330);expect((s.summary.match(/[.!?](?:\s|$)/g)??[]).length,s.slug).toBeLessThanOrEqual(3);
   if(s.teaser)expect(s.teaser.length,s.slug).toBeLessThanOrEqual(200);
   // A key fact adds a number the standfirst does not already state.
   for(const f of s.keyFacts??[])expect(new RegExp(`(?<![\\d.,])${f.value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\d,])`).test(s.summary),`${s.slug}: ${f.value}`).toBe(false);
   expect(s.brief?.known.length,s.slug).toBeGreaterThan(0);expect(s.patterns?.length,s.slug).toBeGreaterThan(0);
  }
  expect(all.every(s=>s.scene),'scene').toBe(true);expect(new Set(all.map(s=>s.scene)).size).toBe(all.length);
 });
 it('excludes the context purchase from the seven-record total',()=>{
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
});
