import {afterEach,describe,expect,it,vi} from 'vitest';
import {requestSourceCsv} from './source-csv';
afterEach(()=>vi.unstubAllGlobals());
const signal=()=>new AbortController().signal;
function csv(headers:Record<string,string>={}){return new Response('suma,sursa\n123.456789,https://example.test/source\n',{headers:{'content-type':'text/csv','x-total-rows':'1','x-exported-rows':'1','content-disposition':'attachment; filename="randuri-1.csv"',...headers}});}
describe('source CSV download contract',()=>{
 it('preserves the exact selection, signal and decimal text from the server',async()=>{
  const fetch=vi.fn().mockResolvedValue(csv());vi.stubGlobal('fetch',fetch);
  const body={spec:{block:'stat'},scope:{years:[2025]},search:'text',stream:'contracts'},s=signal();
  const file=await requestSourceCsv(body,s);
  expect(fetch).toHaveBeenCalledWith('/api/ask/rows/csv',expect.objectContaining({body:JSON.stringify(body),signal:s,method:'POST'}));
  expect(await file.blob.text()).toContain('123.456789');expect(file.filename).toBe('randuri-1.csv');expect(file.message).toContain('1 înregistrare exportată');
 });
 it('announces partial exports using the server counts, never a page count',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(csv({'x-total-rows':'200001','x-exported-rows':'100000'})));
  expect((await requestSourceCsv({},signal())).message).toContain('Export parțial: primele 100.000 din 200.001');
 });
 it('does not treat an HTTP 200 JSON timeout as a downloaded CSV',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({error:'Restrânge întrebarea.'})));
  await expect(requestSourceCsv({},signal())).rejects.toThrow('Restrânge întrebarea.');
 });
 it('rejects missing totals rather than claiming a complete empty export',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{headers:{'content-type':'text/csv'}})));
  await expect(requestSourceCsv({},signal())).rejects.toThrow('verificat');
 });
 it.each([{'x-total-rows':'0','x-exported-rows':'1'},{'x-exported-rows':'-1'},{'x-total-rows':'NaN'}])('rejects inconsistent metadata %j',async headers=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(csv(headers)));
  await expect(requestSourceCsv({},signal())).rejects.toThrow('verificat');
 });
});
