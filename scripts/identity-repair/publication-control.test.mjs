import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDb} from '../../packages/db/dist/index.js';
import {claim,control,pending} from './publication-control.mjs';
const url=process.env.IDENTITY_TEST_DATABASE_URL;
if(url&&!/^seap_test_identity_/.test(new URL(url).pathname.slice(1)))throw Error('Isolated identity fixture database required');
test('publication refuses drift and preserves operator request/schedule settings',{skip:!url},async()=>{
 const {sql}=createDb(url),database=new URL(url).pathname.slice(1),rollback=Error('verified rollback');
 try{await sql.begin(async q=>{
  await q`insert into app.collection_control(id,revision,paused,maintenance,min_seconds,max_seconds,processing_time,risk_weekday)
   values(1,78,true,false,40,60,'05:00',0)`;
  await q`insert into app.monitoring_refreshes(kind,status,completed_at) values('coordinated','ready',now())`;
  await assert.rejects(claim(q,77,database),/Control changed/);
  const before=await claim(q,78,database);
  assert.equal(before.paused,true);assert.equal(before.revision,78);
  const work=await pending(q),boundary={revision:79,rawBoundary:work.raw,lastRequest:work.request};
  const guarded=await control(q,boundary,database);
  assert.equal(guarded.min_seconds,40);assert.equal(guarded.max_seconds,60);
  assert.equal(guarded.processing_time,'05:00');assert.equal(guarded.risk_weekday,0);
  await assert.rejects(control(q,boundary,'seap'),/boundary changed/);
  await assert.rejects(control(q,{...boundary,rawBoundary:'-1'},database),/boundary changed/);
  await assert.rejects(control(q,{...boundary,lastRequest:'-1'},database),/boundary changed/);
  await q`insert into app.collection_requests(stream,worker,method,endpoint) values('da','fixture','GET','fixture-only')`;
  await assert.rejects(control(q,boundary,database),/boundary changed/);
  await q`update app.collection_control set revision=80 where id=1`;
  await assert.rejects(control(q,boundary,database),/boundary changed/);
  throw rollback;
 }).catch(e=>{if(e!==rollback)throw e;});}finally{await sql.end({timeout:5});}
});
