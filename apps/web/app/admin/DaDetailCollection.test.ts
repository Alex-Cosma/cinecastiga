import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import type {CollectionStatus} from '../../lib/admin/collection';
import {daDetailForecast,type DaDetailStatus} from '../../lib/admin/historical-forecast';
import DaDetailCollection from './DaDetailCollection';
const status=(over:Partial<DaDetailStatus>={}):DaDetailStatus=>({pending:9000,running:10,complete:240000,failed:12,lastHour:11000,lastDay:240000,
 days:[{day:'2026-11-10',complete:0},{day:'2026-11-11',complete:240000}],errors:[{error:'Detaliu SEAP indisponibil (HTTP 404); celelalte anunțuri continuă.',n:12}],
 lastEnqueue:{at:'2026-11-11T10:00:00Z',auto:true,queued:50000},
 walk:{floor:'2020-01-01',start:'2026-11-10',forwardTo:'2026-11-10',cursor:{tier:1,day:'2025-03-14'},universe:1000000,remaining:590990},lanes:10,...over});
const render=(h:DaDetailStatus,control:Record<string,unknown>={},stale=false)=>renderToStaticMarkup(createElement(DaDetailCollection,{stale,data:{historical:{daDetails:h},
 control:{paused:false,blocked_reason:null,paused_streams:[],maintenance:false,collection_during_maintenance:false,server_now:'2026-11-11T12:00:00Z',...control}} as unknown as CollectionStatus}));
describe('direct-award lines download',()=>{
 it('forecasts from the queue, the awards not yet scheduled and the last day\'s pace',()=>{
  const f=daDetailForecast(status());
  expect(f).toMatchObject({queued:9010,unscheduled:590990,left:600000,total:1000000,percent:40,perHour:10000,hours:60});
  // Before a day has passed, the last hour's pace.
  expect(daDetailForecast(status({lastDay:11000})).perHour).toBe(11000);
  expect(daDetailForecast(status({lastHour:0,lastDay:0})).hours).toBeNull();
  // Nothing left: done, whatever the pace; work left never reads as 100%.
  expect(daDetailForecast(status({pending:0,running:0,walk:{...status().walk!,cursor:null,remaining:0}}))).toMatchObject({left:0,percent:100,hours:0});
  expect(daDetailForecast(status({pending:1,running:0,walk:{...status().walk!,universe:100000000,remaining:0}})).percent).toBe(99);
 });
 it('shows progress, where the walk is, the pace and the days',()=>{
  const html=render(status());
  expect(html).toContain('Liniile achizițiilor directe');expect(html).toContain('≈ 40%');expect(html).toContain('În curs');
  expect(html).toContain('Grupele de produse · 14 martie 2025');expect(html).toContain('590.990');expect(html).toContain('240.000 · 12 nepreluate');
  expect(html).toContain('11.000 în ultima oră · 240.000 în 24 h');expect(html).toContain('HTTP 404');expect(html).toContain('11 nov');expect(html).toContain('automat');
 });
 it('says why it stands still, and the states before a start and after the floor',()=>{
  expect(render(status({lanes:0}))).toContain('Benzile de fundal sunt oprite.');expect(render(status({lanes:0}))).toContain('Oprită');
  expect(render(status(),{paused_streams:['da']})).toContain('Fluxul „Achiziții directe” e pe pauză.');
  expect(render(status({walk:null,lastEnqueue:null,complete:0}))).toContain('Descărcarea nu e pornită.');
  expect(render(status({walk:null,complete:0}))).toContain('Probă');
  const done=render(status({pending:0,running:0,walk:{...status().walk!,cursor:null,remaining:0}}));
  expect(done).toContain('La zi');expect(done).toContain('Toate zilele, până la 1 ianuarie 2020');
 });
});
