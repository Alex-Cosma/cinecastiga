import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { visibleStories,validateStory } from './validation';
import { readView,sumExact,sourceLinks,safeExternalUrl,countStories,storyTotal } from './shared';
import { readPreviewStories } from './preview-files';
import { gapLabel,plural,questionGroups,relatedStories,scopeLabel,sourceGroups,timelineStrip,valueNote } from './editorial';
import { glossaryPlan,markTerms } from './glossary';
import { getStories } from './catalog';
import { canSeeStoryPreviews } from './access';
import type { Story } from './types';

const mocks=vi.hoisted(()=>({session:vi.fn()}));
vi.mock('@/lib/auth',()=>({auth:{api:{getSession:mocks.session}}}));
vi.mock('next/headers',()=>({headers:async()=>new Headers()}));

/** Synthetic structure only: placeholder records, never loaded by the application. */
const example=():Story=>({
 slug:'poveste-de-test',status:'preview',title:'Titlu de test',summary:'Rezumat de test.',counties:['cluj'],topic:'Test',illustration:'road',
 author:'Redacția de test',publishedAt:'2026-10-01',minutes:3,period:'2026',intro:['Introducere [[achizitie-a]].'],
 sections:[{id:'context',title:'Context',paragraphs:['Paragraf.'],sourceIds:['achizitie-a']}],
 finding:{title:'Total',sourceIds:['achizitie-a','achizitie-b'],explanation:'Explicație.',after:'După.'},
 timeline:[{id:'t1',date:'2026-09-01',title:'Moment',text:'Text.',sourceIds:['achizitie-b']}],
 questions:['Întrebare?'],reply:null,methodology:'Metodologie.',corrections:[],
 sources:[
  {id:'achizitie-a',title:'Achiziția A',observedAt:'2026-10-01',kind:'procurement',record:{type:'direct',id:'1001'},date:'2026-09-01',amount:'0.10',currency:'RON',authority:'Instituția A',suppliers:['Furnizor A']},
  {id:'achizitie-b',title:'Achiziția B',observedAt:'2026-10-01',kind:'procurement',record:{type:'contract',id:'2002',awardNoticeId:'3003'},date:'2026-09-02',amount:'0.2',currency:'RON',authority:'Instituția A',suppliers:['Furnizor B']},
  {id:'context-c',title:'Context C',observedAt:'2026-10-01',kind:'procurement',record:{type:'direct',id:'4004'},date:'2026-09-03',amount:'5',currency:'RON',authority:'Instituția A',suppliers:['Furnizor C']},
  {id:'presa',title:'Articol',observedAt:'2026-10-01',kind:'external',url:'https://example.org/articol',publisher:'Publicație',summary:'Rezumat.'},
 ],
});
let dir='';
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'stories-'));});
afterEach(()=>{rmSync(dir,{recursive:true,force:true});vi.unstubAllEnvs();mocks.session.mockReset();});
const write=(name:string,value:unknown)=>writeFileSync(join(dir,name),typeof value==='string'?value:JSON.stringify(value));

describe('editorial publication and evidence',()=>{
 it('keeps previews and drafts out of the public catalog, including direct links',async()=>{
  vi.stubEnv('STORIES_PREVIEW_DIR',dir);write('a.json',example());
  expect(await getStories()).toEqual([]);
  expect(visibleStories([example(),{...example(),slug:'ciorna',status:'draft'}],false)).toEqual([]);
  expect(visibleStories([{...example(),status:'draft'}],true)).toEqual([]);
  expect(readView(['poveste',example().slug],await getStories())).toBeNull();
  expect(readView(['poveste',example().slug,'surse','achizitie-a'],await getStories())).toBeNull();
  expect(visibleStories([{...example(),status:'published'}],false)).toHaveLength(1);
 });
 it('reads only valid preview files from the server directory and skips the rest',async()=>{
  vi.stubEnv('STORIES_PREVIEW_DIR',dir);const logs:string[]=[];
  write('a.json',example());write('b.json',{...example(),slug:'publicata-din-fisier',status:'published'});
  write('c.json',{...example(),slug:'fara-surse',sources:[]});write('d.json','{nu e json');write('note.txt','ignorat');
  expect((await readPreviewStories(dir,m=>logs.push(m))).map(s=>s.slug)).toEqual(['poveste-de-test']);
  expect(logs).toHaveLength(3);expect(logs.join('\n')).toContain('status must be preview');
  const quiet=vi.spyOn(console,'error').mockImplementation(()=>{});
  expect((await getStories({previews:true})).map(s=>s.slug)).toEqual(['poveste-de-test']);
  expect(await readPreviewStories(join(dir,'lipsa'),()=>{})).toEqual([]);
  vi.stubEnv('STORIES_PREVIEW_DIR','');expect(await getStories({previews:true})).toEqual([]);
  quiet.mockRestore();
 });
 it('shows previews only to admins outside local development',async()=>{
  vi.stubEnv('NODE_ENV','production');
  mocks.session.mockResolvedValue(null);expect(await canSeeStoryPreviews()).toBe(false);
  mocks.session.mockResolvedValue({user:{role:'watchdog'}});expect(await canSeeStoryPreviews()).toBe(false);
  mocks.session.mockResolvedValue({user:{role:'admin'}});expect(await canSeeStoryPreviews()).toBe(true);
  vi.stubEnv('NODE_ENV','development');mocks.session.mockResolvedValue(null);expect(await canSeeStoryPreviews()).toBe(true);
 });
 it('preserves high precision and excludes context purchases from the total',()=>{
  expect(sumExact(['0.1','0.2'])).toBe('0.30');expect(sumExact(['9007199254740993.12345','0.00006'])).toBe('9007199254740993.12351');
  expect(storyTotal(example())).toBe('0.30');expect(()=>sumExact(['NaN'])).toThrow();
 });
 it('rejects phantom citations in the narrative and duplicate procurement references',()=>{
  const s=example();s.sections![0]!.sourceIds.push('missing');expect(()=>validateStory(s)).toThrow('unknown source');
  const i=example();i.intro[0]+='[[missing]]';expect(()=>validateStory(i)).toThrow('unknown source');
  const q=example();q.finding.sourceIds.push(q.finding.sourceIds[0]!);expect(()=>validateStory(q)).toThrow('total selection');
  const r=example();for(const source of r.sources)if(source.kind==='procurement')source.record={type:'direct',id:'123'};expect(()=>validateStory(r)).toThrow('duplicate procurement');
 });
 it('requires real record references even for previews',()=>{
  expect(()=>validateStory(example())).not.toThrow();
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

describe('reader flow',()=>{
 it('accepts only drawn scenes that exist',()=>{
  expect(()=>validateStory({...example(),scene:'scoala-bazin'})).not.toThrow();
  expect(()=>validateStory({...example(),scene:'inventata'})).toThrow('scene');expect(()=>validateStory({...example(),scene:'toString'})).toThrow('scene');
 });
 it('relates stories by shared pattern before county, and labels the reason',()=>{
  const a={...example(),slug:'a',patterns:['fara-anunt']},b={...example(),slug:'b',counties:['buzau'],patterns:['fara-anunt']},c={...example(),slug:'c',topic:'Altceva'},d={...example(),slug:'d',counties:['iasi'],topic:'Altceva'};
  expect(relatedStories(a,[a,b,c,d]).map(r=>[r.story.slug,r.reason])).toEqual([['b','Același tipar: Fără anunț public'],['c','Tot în Cluj']]);
  expect(()=>validateStory({...example(),patterns:['inventat']})).toThrow('patterns');
  expect(()=>validateStory({...example(),sections:[{id:'surse',title:'x',paragraphs:[],sourceIds:[]}]})).toThrow('sections');
 });
 it('speaks Romanian counts and gaps',()=>{
  expect([plural(1,'zi','zile'),plural(2,'zi','zile'),plural(20,'zi','zile'),plural(101,'zi','zile')]).toEqual(['1 zi','2 zile','20 de zile','101 zile']);
  expect(gapLabel('2026-07-02','2026-07-29')).toBe('27 de zile');expect(gapLabel('2025-04-28','2026-07-02')).toBe('1 an și 2 luni');
  expect(scopeLabel({...example(),counties:['bucuresti','iasi','timis']})).toBe('București și 2 județe');expect(scopeLabel({...example(),counties:['cluj','buzau']})).toBe('Cluj, Buzău');
 });
 it('groups questions by addressee and the dossier by kind',()=>{
  const s={...example(),questions:['CNAIR: câte oferte?','Și contestații?','Primăriei: ce sume?'],requests:[{to:'CNAIR',status:'pregatita' as const}]};
  expect(questionGroups(s).map(g=>[g.to,g.items.length,g.request?.status])).toEqual([['CNAIR',2,'pregatita'],['Primăriei',1,undefined]]);expect(questionGroups(s)[0]!.items[0]).toBe('Câte oferte?');
  const day=example();for(const x of day.sources)if(x.kind==='procurement')x.date='2026-09-01';
  const groups=sourceGroups(day);expect(groups[0]!.clusters).toHaveLength(1);expect(groups[0]!.clusters[0]!.total).toBe('5.30');expect(groups[0]!.items).toEqual([]);expect(groups[1]!.items.map(x=>x.n)).toEqual([4]);
  const f=example();for(const x of f.sources)if(x.kind==='procurement')x.title='Acord-cadru nr. 1';expect(valueNote(f).ceiling).toBe(true);expect(valueNote(example())).toMatchObject({ceiling:false,anyCeiling:false});
  expect(timelineStrip(example())).toBeNull();
 });
 it('explains each glossary term once, at its first use, without touching citations',()=>{
  const plan=glossaryPlan(['Un acord-cadru [[a]] și SEAP.','Alt acord-cadru, negociere fără publicare prealabilă.']);
  expect(plan.get(0)).toEqual(['acord-cadru','seap']);expect(plan.get(1)).toEqual(['negociere-fara-publicare']);
  expect(markTerms('Acordurile-cadru din SEAP',['acord-cadru','seap'])).toEqual([{term:'acord-cadru',text:'Acordurile-cadru'},{text:' din '},{term:'seap',text:'SEAP'}]);
  expect(markTerms('reacord-cadrul',['acord-cadru'])).toEqual([{text:'reacord-cadrul'}]);
 });
});

