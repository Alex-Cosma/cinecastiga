import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import type {CollectionStatus} from '@/lib/admin/collection';
import RecoveryOverview from './RecoveryOverview';
const snapshot=()=>({
 control:{paused:false,blocked_reason:null,paused_streams:[],maintenance:true,collection_during_maintenance:true,daily_limit:null},
 workers:[{alive:true,kind:'ingestion'}],quietWindow:{active:false},timeoutRetry:null,today:{attempts:10},
 recovery:{batch:{end_day:'2026-10-07',follow_latest:true}},
 forecast:{pending:100,failed:0,deferred:0,state:'learning',percent:null,knownPercent:50,minutesLow:5,minutesHigh:10,etaBasis:'known',rate:28800,completed:100,known:200,remainingLow:null,remainingHigh:null,calculatedAt:'2026-10-08T06:00:00Z'},
});
const render=(data:ReturnType<typeof snapshot>,stale=false)=>renderToStaticMarkup(createElement(RecoveryOverview,{data:data as unknown as CollectionStatus,stale}));
describe('recovery estimate while archive collection continues during maintenance',()=>{
 it('shows the measured ETA despite public maintenance',()=>{
  const html=render(snapshot());expect(html).toContain('rămase');expect(html).toContain('Încheiere estimată:');expect(html).not.toContain('Estimare suspendată');
 });
 it.each(['ordinary-maintenance','pause','block','quiet','no-worker','stale','daily-limit','stream-pause','retry'])('still suspends for %s',reason=>{
  const data=snapshot();
  if(reason==='ordinary-maintenance')data.control.collection_during_maintenance=false;
  if(reason==='pause')data.control.paused=true;
  if(reason==='block')Object.assign(data.control,{blocked_reason:'source failure'});
  if(reason==='quiet')data.quietWindow.active=true;
  if(reason==='no-worker')data.workers=[];
  if(reason==='daily-limit')Object.assign(data.control,{daily_limit:10});
  if(reason==='stream-pause')Object.assign(data.control,{paused_streams:['awards']});
  if(reason==='retry')Object.assign(data,{timeoutRetry:{task_id:'fixture'}});
  const html=render(data,reason==='stale');expect(html).toContain('Estimare suspendată');expect(html).not.toContain('Încheiere estimată:');
 });
});

it('shows empty executable queue as a gap, without a fictitious ETA',()=>{
 const data=snapshot();Object.assign(data.forecast,{pending:0,failed:7,deferred:51601,percent:null,knownPercent:78,minutesLow:null,minutesHigh:null});
 const html=render(data);expect(html).toContain('Nu mai sunt cereri executabile');expect(html).toContain('Colectarea nu este completă');expect(html).not.toContain('Încheiere estimată:');
});
