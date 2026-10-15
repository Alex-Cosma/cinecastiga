import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {task,planResponse} from './plan.js';
import {DA_STRATEGY,cpvChildren} from './da-partition.js';
const day='2026-10-08';
const root=task('fixture','da','da',{from:day,to:day,daScan:'2026-10-09',daStrategy:DA_STRATEGY,page:0});
const item=(id:number,cpv='33690000-3')=>({directAcquisitionId:id,cpvCode:cpv+' - Titlu',finalizationDate:day+'T12:00:00+03:00'});
const leaf=(prefix:string)=>task('fixture','da','da',{...root.params,cpvPrefix:prefix});
describe('national DA discovery, source substring filters and exact ownership',()=>{
 it('collects a small national day in one request',()=>{
  const p=planResponse(root,{total:1,items:[item(1)]},[],day);expect(p.status).toBe('complete');expect(p.docs).toHaveLength(1);expect(p.children).toEqual([]);
 });
 it('splits a capped day into exhaustive official divisions, never archives capped rows',()=>{
  const p=planResponse(root,{total:2000,items:[item(1)],searchTooLong:true},[],day);
  expect(p.status).toBe('split');expect(p.docs).toEqual([]);expect(p.children).toHaveLength(46);
  const codes=JSON.parse(readFileSync(new URL('../../../../packages/db/seed/cpv_2008.json',import.meta.url),'utf8')) as {code:string}[];
  for(const {code} of codes)expect(p.children.filter(c=>code.startsWith(c.params.cpvPrefix!))).toHaveLength(1);
  expect(p.children.every(c=>c.params.daScan===root.params.daScan&&c.params.authorityId===undefined)).toBe(true);
 });
 it('archives each code only under its own prefix despite substring matches',()=>{
  const response={total:3,items:[item(1),item(2,'15332290-3'),item(3,'44333000-3')]};
  const p=planResponse(leaf('33'),response,[],day);expect(p.docs.map(d=>d.externalId)).toEqual(['da:1']);expect(p.result).toMatchObject({total:1,sourceTotal:3,ids:[1]});
  expect(planResponse(leaf('15'),{total:1,items:[response.items[1]]},[],day).docs.map(d=>d.externalId)).toEqual(['da:2']);
  expect(planResponse(leaf('44'),{total:1,items:[response.items[2]]},[],day).docs.map(d=>d.externalId)).toEqual(['da:3']);
 });
 it('retains the SEAP placeholder code without requiring a check digit',()=>{
  const t=leaf('00000000');const row={...item(1),cpvCode:'00000000 Coduri CPV (Rev.2)'};
  expect(planResponse(t,{total:1,items:[row]},[],day).docs[0]?.externalId).toBe('da:1');
 });
 it('recursively refines only saturated prefixes, retaining dates and scan identity',()=>{
  const p=planResponse(leaf('33'),{total:2000,items:[],searchTooLong:false},[],day);
  expect(p.children.map(c=>c.params.cpvPrefix)).toEqual(cpvChildren('33'));
  expect(p.children.every(c=>c.params.from===day&&c.params.daScan===root.params.daScan)).toBe(true);
 });
 it('falls back to a fresh authority inventory for an overflowing exact code',()=>{
  const p=planResponse(leaf('33690000'),{total:2000,items:[],searchTooLong:true},[],day);
  const fallback=p.children[0]!;expect(fallback).toMatchObject({kind:'catalogue',params:{daFallback:true,cpvPrefix:'33690000'}});
  const inventory=planResponse(fallback,{total:1,items:[{id:77}]},[],day);
  expect(inventory.children[0]).toMatchObject({kind:'da',params:{authorityId:77,daFallback:true,cpvPrefix:'33690000',from:day,to:day}});
  expect(()=>planResponse(inventory.children[0]!,{total:2000,items:[],searchTooLong:true},[],day)).toThrow('instituție');
 });
 it('falls back for unknown taxonomy without silently dropping records',()=>{
  const p=planResponse(root,{total:2000,items:[item(1,'99999999-9')],searchTooLong:true},[],day);
  expect(p.children[0]).toMatchObject({kind:'catalogue',params:{daFallback:true}});expect(p.children[0]?.params.cpvPrefix).toBeUndefined();
  const unknown=planResponse(leaf('33'),{total:1,items:[item(1,'33333333-3')]},[],day);
  expect(unknown.children[0]?.params.cpvPrefix).toBeUndefined();
  expect(planResponse(root,{total:1,items:[item(1,'99999999-9')]},[],day).docs).toHaveLength(1);
 });
 it('rejects missing rows, duplicate IDs, foreign dates and invalid scopes',()=>{
  expect(()=>planResponse(root,{total:2,items:[item(1)]},[],day)).toThrow('Numărul');
  expect(()=>planResponse(root,{total:2,items:[item(1),item(1)]},[],day)).toThrow('repetați');
  expect(()=>planResponse(root,{total:1,items:[{...item(1),finalizationDate:'2026-10-09T12:00:00+03:00'}]},[],day)).toThrow('Filtrul');
  expect(()=>task('fixture','da','da',{...root.params,to:'2026-10-09'})).toThrow('singură zi');
  expect(()=>leaf('99')).toThrow('nomenclator');
  expect(()=>planResponse(leaf('45'),{total:1,items:[item(1)]},[],day)).toThrow('Filtrul CPV');
 });
 it('validates the complete source vocabulary and stops on a changed catalogue',()=>{
  const t=task('fixture','catalogue','cpv-catalogue',{from:day,to:day,page:0});
  const codes=JSON.parse(readFileSync(new URL('../../../../packages/db/seed/cpv_2008.json',import.meta.url),'utf8')) as {code:string}[];
  const items=codes.slice(0,50).map((c,i)=>({id:i+1,text:c.code+' Label'}));
  const p=planResponse(t,{total:9455,items},[],day);expect(p.children[0]?.params.page).toBe(1);expect(p.docs).toEqual([]);
  expect(()=>planResponse(t,{total:9456,items},[],day)).toThrow('modificat');
  expect(()=>planResponse(t,{total:9455,items:[...items.slice(1),items[1]]},[],day)).toThrow('repetate');
  expect(()=>planResponse(t,{total:9455,items:[...items.slice(1),{id:99999,text:'99999999 New code'}]},[],day)).toThrow('coduri noi');
  expect(()=>planResponse(p.children[0]!,{total:9455,items},[p.result as any],day)).toThrow('repetate');
 });
 it('keeps independent scans and old authority work in separate identities',()=>{
  expect(task('fixture','da','da',{...root.params,daScan:'2026-10-10'}).key).not.toBe(root.key);
  expect(task('fixture','da','da',{from:day,to:day,page:0}).key).not.toBe(root.key);
 });
 it('requires source evidence for disappeared records and preserves changed details',()=>{
  const t=task('fixture','da','da-detail',{...root.params,noticeId:7});
  const d={directAcquisitionID:7,finalizationDate:null,sysDirectAcquisitionStateID:5};
  expect(planResponse(t,d,[],day).docs[0]).toMatchObject({externalId:'da:7',endpointVersion:'da-detail:v1'});
  expect(()=>planResponse(t,{...d,directAcquisitionID:8},[],day)).toThrow('Identitatea');
  expect(()=>planResponse(t,{...d,sysDirectAcquisitionStateID:7},[],day)).toThrow('Data');
  expect(()=>planResponse(t,{...d,finalizationDate:day+'T12:00:00+03:00'},[],day)).toThrow('omite');
  expect(planResponse(t,{...d,finalizationDate:'2026-10-09T12:00:00+03:00'},[],day).docs).toHaveLength(1);
  const scoped=task('fixture','da','da-detail',{...t.params,cpvPrefix:'33'});
  expect(()=>planResponse(scoped,{...d,cpvCode:{text:'Medicamente',localeKey:'33690000-3'},finalizationDate:day+'T12:00:00+03:00'},[],day)).toThrow('omite');
 });
});
