import {describe,it,expect} from 'vitest';
import {parseTopicScope,topicParams,documentScope,answerShape,cleanTopicParams,periodBounds,periodText,periodWindow} from './shared';
describe('subject search URLs',()=>{
 it('defaults to all years and all sources',()=>{expect(parseTopicScope(new URLSearchParams('q=iluminat'))).toMatchObject({from:'',to:'',type:'all',place:'',page:1});});
 it('round-trips a shared selection, including a county with accents folded',()=>{const s=parseTopicScope(new URLSearchParams('q=locuri+de+joacă&place=county:buzau&from=2022&to=2024&type=contracts&match=phrase&tab=documents&page=2'));expect(parseTopicScope(topicParams(s))).toEqual(s);});
 it('rejects partial, inverted, and injected years',()=>{for(const p of ['from=2024','from=2024&to=2022','from=2020%27&to=2024','from=0&to=2024'])expect(()=>parseTopicScope(new URLSearchParams(p))).toThrow();});
 it('validates selectors and pagination instead of silently widening selection',()=>{for(const p of ['place=unknown','type=secret','match=ai','tab=private','page=-1','page=1.3','page=1001'])expect(()=>parseTopicScope(new URLSearchParams(p))).toThrow();});
 it('keeps historical entity role URLs meaningful',()=>{expect(parseTopicScope(new URLSearchParams('q=buzau&rol=autoritate'))).toMatchObject({tab:'entities',role:'authority'});});
 it('requests documents once per selection, paging them only in the Documents tab',()=>{
  const key=(p:string)=>topicParams(documentScope(parseTopicScope(new URLSearchParams(p)))).toString();
  expect(key('q=iluminat&place=uat:44818&tab=acquisitions&page=3')).toBe('q=iluminat&place=uat%3A44818');
  expect(key('q=iluminat&tab=entities&rol=furnizor')).toBe(key('q=iluminat'));
  expect(key('q=iluminat&tab=documents&page=2')).toBe('q=iluminat&tab=documents&page=2');
  expect(key('q=iluminat&match=phrase&type=contracts')).not.toBe(key('q=iluminat'));
 });
 it('reads a month window in the address, both bounds as months (owner, 23 November 2026)',()=>{
  const s=parseTopicScope(new URLSearchParams('q=iluminat&from=2024-12&to=2024-12'));
  expect(s).toMatchObject({from:'2024-12',to:'2024-12'});
  expect(topicParams(s).toString()).toBe('q=iluminat&from=2024-12&to=2024-12');
  expect(parseTopicScope(new URLSearchParams('q=iluminat&from=2025-12&to=2026-02'))).toMatchObject({from:'2025-12',to:'2026-02'});
  for(const p of ['from=2024-12&to=2024','from=2024&to=2024-12','from=2024-13&to=2024-13','from=2024-00&to=2024-01','from=2024-1&to=2024-2','from=2024-12&to=2024-11','from=2024-12-01&to=2024-12-31','from=1800-01&to=1800-02'])
   expect(()=>parseTopicScope(new URLSearchParams(p))).toThrow();
  // an unreadable month window leaves the address, the words stay
  expect(cleanTopicParams(new URLSearchParams('q=iluminat&from=2024-13&to=2024-13'))?.toString()).toBe('q=iluminat');
 });
 it('gives the period as years and months, and says it as the sentence does',()=>{
  expect(periodWindow('2024','2025')).toEqual({yearFrom:2024,yearTo:2025});
  expect(periodWindow('2026-06','2026-11')).toEqual({yearFrom:2026,yearTo:2026,monthFrom:6,monthTo:11});
  expect(periodWindow('2024-12','2024')).toBeNull();
  expect(periodBounds({yearFrom:2025,yearTo:2026,monthFrom:12,monthTo:2})).toEqual({from:'2025-12',to:'2026-02'});
  expect(periodBounds({yearFrom:2024,yearTo:2024})).toEqual({from:'2024',to:'2024'});
  expect([periodText('2024','2024'),periodText('2023','2024'),periodText('2024-12','2024-12'),periodText('2026-06','2026-11'),periodText('2025-12','2026-02')])
   .toEqual(['2024','2023–2024','dec. 2024','iun.–nov. 2026','dec. 2025 – feb. 2026']);
 });
 it('allows a single year, and punctuation remains data',()=>{expect(parseTopicScope(new URLSearchParams('from=2022&to=2022&q=%25%27')).q).toBe("%'");});
});
describe('short answer hero',()=>{
 it('never shows a zero total as the answer',()=>{
  expect(answerShape({value:0,count:0})).toBe('empty');
  expect(answerShape({value:0,count:3})).toBe('count-only');
  expect(answerShape({value:109_500_000,count:816})).toBe('value');
  expect(answerShape(null)).toBe('none');
 });
});

describe('an address with filters /cauta cannot read (UX audit Z1-31)',()=>{
 it('keeps the words and the filters it reads, and leaves out the others',()=>{
  const out=cleanTopicParams(new URLSearchParams('q=iluminat&type=zzz&place=county:cluj&from=2020&to=2019&page=2'));
  expect(out?.toString()).toBe('q=iluminat&place=county%3Acluj&page=2');
  expect(parseTopicScope(out!)).toMatchObject({q:'iluminat',place:'county:cluj',from:'',type:'all',page:2});
 });
 it('changes nothing in an address that reads, and gives up on words that cannot be searched',()=>{
  expect(cleanTopicParams(new URLSearchParams('q=iluminat&type=da'))).toBeNull();
  expect(cleanTopicParams(new URLSearchParams('q=x&type=zzz'))).toBeNull();
 });
});
