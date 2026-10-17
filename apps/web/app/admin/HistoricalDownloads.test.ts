import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import type {CollectionStatus} from '@/lib/admin/collection';
import {backfillForecast,type HistoricalStatus} from '../../lib/admin/historical-forecast';
import HistoricalDownloads from './HistoricalDownloads';
const historical=():HistoricalStatus=>({
 awards:{parts:[{part:'lots',pending:900,running:0,complete:100,failed:0,lastHour:50},{part:'root',pending:0,running:0,complete:1000,failed:10,lastHour:50}],
  errors:[{error:'Detaliu SEAP indisponibil (HTTP 400); celelalte anunțuri continuă.',n:10}],lastEnqueue:{at:'2026-10-17T07:00:00Z',auto:true,queued:1000,remaining:500,pilot:false},lanes:10},
 ted:{latest:{ojs:'202600131',day:'2026-07-10'},packages:9,notices:1008,matched:9,gaps:0,behind:70,lastFinishedAt:'2026-10-17T06:25:00Z',inFlight:false,spacingMinutes:30,failedAttempt:null},
});
const snapshot=(h=historical(),control:Record<string,unknown>={})=>({historical:h,control:{paused:false,blocked_reason:null,paused_streams:[],maintenance:false,collection_during_maintenance:false,server_now:'2026-10-17T07:00:00Z',...control}});
const render=(data:ReturnType<typeof snapshot>,stale=false)=>renderToStaticMarkup(createElement(HistoricalDownloads,{data:data as unknown as CollectionStatus,stale}));
describe('historical downloads',()=>{
 it('estimates the SEAP backfill from queued parts and the unscheduled notices',()=>{
  // One root left none pending; 1000 lots for 1000 roots → 2 tasks per notice; 500 unscheduled → 1000 more.
  const f=backfillForecast(historical().awards);
  expect(f).toMatchObject({queued:900,unscheduled:500,left:1900,done:1100,rate:100,perNotice:2});
  expect(f.percent).toBe(Math.floor(1100/(1100+10+1900)*100));expect(f.hours).toBe(19);
  const pending=historical().awards;pending.parts[1]!.pending=100;
  // Each queued root still brings its part.
  expect(backfillForecast(pending).left).toBe(900+100+100+1000);
 });
 it('shows both downloads with their pace, gaps and estimate',()=>{
  const html=render(snapshot());
  expect(html).toContain('Descărcări istorice');expect(html).toContain('≈ 36%');expect(html).toContain('1.000 / 1.010');expect(html).toContain('10 nepreluate');
  expect(html).toContain('500');expect(html).toContain('automat');expect(html).toContain('HTTP 400');
  expect(html).toContain('OJ S 131/2026');expect(html).toContain('10 iulie 2026');expect(html).toContain('≈ 70 numere rămase');expect(html).toContain('un pachet la 30 min');
  expect(html).toContain('9 identice');expect(html).not.toContain('cu diferențe');expect(html).toContain('Recuperare');
 });
 it('suspends each estimate while its stream is paused or background lanes are off',()=>{
  const html=render(snapshot(historical(),{paused_streams:['ted']}));
  expect(html).toContain('Termen suspendat cât timp fluxul TED e pe pauză.');expect(html).toContain('după reluarea fluxului');expect(html).toContain('rămase · încheiere estimată');
  const off=historical();off.awards.lanes=0;
  expect(render(snapshot(off))).toContain('Termen suspendat cât timp lucrul în fundal e oprit.');
 });
 it('reports a finished backfill and a TED stream that is up to date',()=>{
  const h=historical();h.awards.parts=[{part:'root',pending:0,running:0,complete:5,failed:0,lastHour:0}];h.awards.lastEnqueue!.remaining=0;h.ted.behind=0;h.ted.gaps=2;
  const html=render(snapshot(h));
  expect(html).toContain('Încheiată');expect(html).toContain('Toate anunțurile programate au fost preluate.');expect(html).not.toContain('programează automat');
  expect(html).toContain('La zi');expect(html).toContain('2 cu diferențe');
 });
 it('says when the unscheduled count is not known yet',()=>{
  const h=historical();h.awards.lastEnqueue!.remaining=null;
  expect(render(snapshot(h))).toContain('se numără la următoarea reîncărcare');
 });
});
