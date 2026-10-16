import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {planResponse,task,type PageResult} from './plan.js';
import {TED_PAGE_SIZE,tedListTask} from './ted.js';
import {tedRequestParameters} from '../scrape/ted/collection-client.js';

const FIXTURE=readFileSync(new URL('../../test/fixtures/ted-298320-2026.xml',import.meta.url),'utf8');
const xmlFor=(pubnum:string)=>{const [n,y]=pubnum.split('-');return FIXTURE.replace('00298320-2026',`${n!.padStart(8,'0')}-${y}`);};
const day='2026-10-15',scan='2026-10-15';
const notices=(from:number,count:number)=>Array.from({length:count},(_,i)=>({'publication-number':`${from+i}-2026`,'publication-date':`${day}+02:00`,'notice-type':'can-standard'}));

describe('TED collection tasks',()=>{
 it('keys one search per day and scan, and one XML per notice and scan',()=>{
  const list=tedListTask('b',day,scan);
  expect(list).toMatchObject({stream:'ted',kind:'ted-list',key:`ted:ted-list::${day}:${day}:scan:${scan}:0`,priority:10});
  expect(tedListTask('b',day,'2026-10-16').key).not.toBe(list.key);
  const xml=task('b','ted','ted-xml',{publicationNumber:'506645-2026',publicationDate:day,tedScan:scan,page:0},2);
  expect(xml.key).toBe(`ted:ted-xml:506645-2026:::scan:${scan}:0`);
  expect(()=>task('b','ted','ted-list',{from:day,to:'2026-10-16',tedScan:scan,page:0})).toThrow(/singură zi/);
  expect(()=>task('b','ted','ted-xml',{publicationNumber:'../x',publicationDate:day,tedScan:scan,page:0})).toThrow(/publicare/);
  expect(()=>task('b','tenders','list',{from:day,to:day,page:0,tedScan:scan})).toThrow(/TED/);
 });

 it('plans XML children and the next page from an exact day population',()=>{
  const t={...tedListTask('b',day,scan),id:1};
  const first=planResponse(t,{totalNoticeCount:150,notices:notices(1,TED_PAGE_SIZE)},[],day);
  expect(first.docs).toEqual([]);
  expect(first.children.filter(c=>c.kind==='ted-xml')).toHaveLength(100);
  const next=first.children.find(c=>c.kind==='ted-list')!;
  expect(next).toMatchObject({priority:0,params:{page:1,from:day,tedScan:scan}});
  const last=planResponse({...next,id:2},{totalNoticeCount:150,notices:notices(101,50)},[first.result as PageResult],day);
  expect(last.children.every(c=>c.kind==='ted-xml')).toBe(true);
  expect(last.children).toHaveLength(50);
 });

 it('fails closed on unstable or foreign search pages',()=>{
  const t={...tedListTask('b',day,scan),id:1};
  const first=planResponse(t,{totalNoticeCount:150,notices:notices(1,100)},[],day).result as PageResult;
  const page1={...t,params:{...t.params,page:1}};
  expect(()=>planResponse(page1,{totalNoticeCount:150,notices:notices(100,50)},[first],day)).toThrow(/paginare instabilă/);
  expect(()=>planResponse(page1,{totalNoticeCount:151,notices:notices(101,50)},[first],day)).toThrow(/totalul/);
  expect(()=>planResponse(page1,{totalNoticeCount:150,notices:notices(101,50)},[],day)).toThrow(/pagină anterioară/);
  expect(()=>planResponse(t,{totalNoticeCount:3,notices:notices(1,2)},[],day)).toThrow(/nu corespunde/);
  expect(()=>planResponse(t,{totalNoticeCount:1,notices:[{'publication-number':'1-2026','publication-date':'2026-10-14+02:00'}]},[],day)).toThrow(/afara zilei/);
  expect(()=>planResponse(t,{notices:[]},[],day)).toThrow(/structura/);
  expect(planResponse(t,{totalNoticeCount:0,notices:[]},[],day).children).toEqual([]);
 });

 it('archives only XML the nightly parser reads back with the same number',()=>{
  const t={...task('b','ted','ted-xml',{publicationNumber:'506645-2026',publicationDate:day,tedScan:scan,page:0},2),id:3};
  const ok=planResponse(t,xmlFor('506645-2026'),[],day);
  expect(ok.docs).toEqual([{source:'ted',externalId:'can-standard:506645-2026',endpointVersion:'ted-eforms:v1',payload:{'publication-number':'506645-2026','notice-type':'can-standard','publication-date':day,'buyer-name':null,xml:xmlFor('506645-2026')}}]);
  expect(()=>planResponse(t,xmlFor('1-2026'),[],day)).toThrow(/alt număr/);
  expect(()=>planResponse(t,'',[],day)).toThrow(/lipsește/);
 });

 it('records only the day, page and publication number in the request ledger',()=>{
  const body=JSON.stringify({query:'buyer-country="ROU" AND notice-type="can-standard" AND publication-date>=20261015 AND publication-date<=20261015 SORT BY publication-date DESC',page:2,limit:100,fields:['x']});
  expect(tedRequestParameters('https://api.ted.europa.eu/v3/notices/search','POST',body)).toEqual({publicationDate:'2026-10-15',page:2,limit:100});
  expect(tedRequestParameters('https://ted.europa.eu/en/notice/506645-2026/xml','GET',undefined)).toEqual({publicationNumber:'506645-2026'});
  expect(()=>tedRequestParameters('https://api.ted.europa.eu/v3/notices/search','GET',undefined)).toThrow();
 });
});
