import {describe,it,expect} from 'vitest';
import {parseTopicScope,topicParams,documentScope} from './shared';
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
 it('allows a single year, and punctuation remains data',()=>{expect(parseTopicScope(new URLSearchParams('from=2022&to=2022&q=%25%27')).q).toBe("%'");});
});
