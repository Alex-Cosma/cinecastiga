import {afterEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {GATE_TTL_MS,proxy} from './proxy';

// The proxy reuses one connection from globalThis; each case injects a fake one.
const g=globalThis as unknown as {maintenanceSql?:unknown;maintenanceGate?:unknown};
let calls=0;
function database(result:unknown[]|Error){
 calls=0;delete g.maintenanceGate;
 g.maintenanceSql=(..._query:unknown[])=>{calls++;return result instanceof Error?Promise.reject(result):Promise.resolve(result);};
}
const control=(maintenance:boolean,running:unknown[]=[])=>[{maintenance,revision:8,running}];
const run=(stage:string,maintenanceBefore:unknown=false)=>({stage,controlRevision:8,maintenanceBefore});
const request=(path:string)=>proxy(new NextRequest(`https://cinecastiga.ro${path}`));
const opened=(response:Response)=>response.headers.get('x-middleware-next')==='1';
afterEach(()=>{delete g.maintenanceSql;delete g.maintenanceGate;vi.restoreAllMocks();});

describe('public maintenance gate',()=>{
 it.each(['/admin','/admin/procesare','/api/admin/collection','/api/admin/feedback','/login','/api/health','/api/auth/get-session'])
 ('keeps %s reachable without reading the gate',async path=>{
  database(control(true));
  expect(opened(await request(path))).toBe(true);expect(calls).toBe(0);
 });
 it('serves pages and API routes without maintenance',async()=>{
  database(control(false));
  expect(opened(await request('/domenii'))).toBe(true);
  expect(opened(await request('/api/search'))).toBe(true);
 });
 it.each(['drain','backup'])('serves readers while the run is in %s',async stage=>{
  database(control(true,[run(stage)]));
  expect(opened(await request('/domenii'))).toBe(true);
  expect(opened(await request('/api/search'))).toBe(true);
  expect(opened(await request('/anchete'))).toBe(true);
 });
 const closed:[string,unknown[]|Error][]=[
  ['backup verified',control(true,[run('backup-verified')])],
  ['normalize',control(true,[run('normalize')])],
  ['reopen',control(true,[run('reopen')])],
  ['failed run or operator maintenance (no running run)',control(true)],
  ['recovery or run claimed on a closed site',control(true,[run('drain',true)])],
  ['run claimed before the rule',control(true,[run('backup',null)])],
  ['missing control row',[]],
  ['database error',Error('connection refused')],
 ];
 it.each(closed)('answers 503 for %s',async(_case,result)=>{
  database(result);
  const page=await request('/domenii');
  expect(page.status).toBe(503);expect(opened(page)).toBe(false);
  expect(page.headers.get('content-type')).toContain('text/html');
  expect(page.headers.get('cache-control')).toContain('no-store');
  const html=await page.text();
  expect(html).toContain('Actualizăm datele');expect(html).toContain('<p>Revino puțin mai târziu.</p>');expect(html).not.toContain('Anchetele');
  // The owner enters through this link during maintenance.
  expect(html).toContain('<a href="/admin">Acces administrator</a>');
  const api=await request('/api/search');
  expect(api.status).toBe(503);expect(await api.json()).toHaveProperty('error');
 });
 it('reads the gate once for every request of a short window, then again (launch audit, 12 November 2026)',async()=>{
  const now=vi.spyOn(Date,'now').mockReturnValue(1_000_000);
  database(control(false));
  await Promise.all([request('/domenii'),request('/api/search'),request('/entitati/1')]);
  expect(calls).toBe(1);
  now.mockReturnValue(1_000_000+GATE_TTL_MS-1);
  expect(opened(await request('/domenii'))).toBe(true);expect(calls).toBe(1);
  now.mockReturnValue(1_000_000+GATE_TTL_MS);
  expect(opened(await request('/domenii'))).toBe(true);expect(calls).toBe(2);
 });
 it('keeps a closed answer, an error included, for the same window: the site stays prudent',async()=>{
  const now=vi.spyOn(Date,'now').mockReturnValue(2_000_000);
  database(Error('too many clients'));
  expect((await request('/domenii')).status).toBe(503);
  expect((await request('/semnale')).status).toBe(503);expect(calls).toBe(1);
  now.mockReturnValue(2_000_000+GATE_TTL_MS);
  g.maintenanceSql=(..._query:unknown[])=>{calls++;return Promise.resolve(control(false));};
  expect(opened(await request('/domenii'))).toBe(true);expect(calls).toBe(2);
 });
});
