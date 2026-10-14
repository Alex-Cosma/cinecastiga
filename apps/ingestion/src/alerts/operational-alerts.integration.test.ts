import {afterAll,beforeEach,describe,expect,it} from 'vitest';
import {createDb} from '@seap/db';
import {deliverOperationalAlerts,type SendAlert} from './operational-alerts.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;afterAll(async()=>{await connection?.sql.end();});
const origin='https://example.invalid';
describe.skipIf(!connection)('operational alerts',()=>{
 beforeEach(async()=>{
  const q=connection!.sql;
  await q`truncate app.operational_alerts,app.processing_runs,app.collection_audit`;
  await q`delete from auth.users where id like 'alert-fixture-%'`;
  await q`update app.collection_control set blocked_reason=null where id=1`;
 });
 it('mails each incident once to verified admins and reopens a cleared collection stop',async()=>{
  const q=connection!.sql,sent:Parameters<SendAlert>[0][]=[];
  const send:SendAlert=async m=>{sent.push(m);};
  await q`insert into auth.users(id,name,email,email_verified,role,banned) values
   ('alert-fixture-1','Admin','admin@example.invalid',true,'admin',false),
   ('alert-fixture-2','Neconfirmat','pending@example.invalid',false,'admin',false),
   ('alert-fixture-3','Watchdog','watch@example.invalid',true,'watchdog',false)`;
  await q`insert into app.processing_runs(scheduled_day,scope,status,stage,control_revision,before_control,completed_at,error)
   values('2026-10-14','daily','failed','identity-repair',1,'{}',now()-interval '1 hour','x'),
         ('2026-09-01','daily','failed','normalize',1,'{}',now()-interval '30 days','x')`;
  await q`insert into app.processing_runs(scheduled_day,trigger,scope,stage,control_revision,before_control,heartbeat_at)
   values('2026-10-13','manual','full','marts',1,'{}',now()-interval '20 minutes')`;
  await q`insert into app.collection_audit(actor_id,actor_name,action,before,after)
   values('system:stream-circuit','Sistem','stream-auto-paused','{}','{"stream":"documents","reason":"3 proxy-uri"}')`;
  await q`update app.collection_control set blocked_reason='Eroare de transport.' where id=1`;

  expect(await deliverOperationalAlerts(q,send,origin)).toBe(4);
  expect(sent.map(m=>m.to)).toEqual(Array(4).fill(['admin@example.invalid']));
  const subjects=sent.map(m=>m.subject).join('\n');
  for(const expected of ['2026-10-14','2026-10-13','„documents”','Colectarea'])expect(subjects).toContain(expected);
  expect(sent.some(m=>m.subject.includes('2026-09-01'))).toBe(false);
  expect(sent.find(m=>m.subject.includes('2026-10-14'))!.text).toContain(`${origin}/admin/procesare`);
  // Nothing new: no repeated mail while the same incidents persist.
  expect(await deliverOperationalAlerts(q,send,origin)).toBe(0);
  expect(sent).toHaveLength(4);
  // A cleared stop closes its incident; the next stop is a new one.
  await q`update app.collection_control set blocked_reason=null where id=1`;
  await deliverOperationalAlerts(q,send,origin);
  await q`update app.collection_control set blocked_reason='Răspuns 429.' where id=1`;
  expect(await deliverOperationalAlerts(q,send,origin)).toBe(1);
  expect(sent.at(-1)!.text).toContain('Răspuns 429.');
  expect((await q`select count(*)::int n from app.operational_alerts where kind='collection-blocked' and resolved_at is not null`)[0]!.n).toBe(1);
 });
 it('retries a failed delivery a bounded number of times and never throws',async()=>{
  const q=connection!.sql,logs:string[]=[];
  await q`insert into auth.users(id,name,email,email_verified,role) values('alert-fixture-1','Admin','admin@example.invalid',true,'admin')`;
  await q`update app.collection_control set blocked_reason='Eroare de transport.' where id=1`;
  const failing:SendAlert=async()=>{throw Error('smtp down');};
  for(let i=0;i<7;i++)expect(await deliverOperationalAlerts(q,failing,origin,m=>logs.push(m))).toBe(0);
  const [row]=await q`select status,attempts,error from app.operational_alerts`;
  expect(row).toMatchObject({status:'failed',attempts:5,error:'smtp down'});
  // Unconfigured SMTP keeps the incident pending without consuming attempts.
  await q`truncate app.operational_alerts`;
  expect(await deliverOperationalAlerts(q,null,origin,m=>logs.push(m))).toBe(0);
  expect((await q`select attempts from app.operational_alerts`)[0]!.attempts).toBe(0);
  expect(logs.at(-1)).toContain('SMTP is not configured');
 });
});
