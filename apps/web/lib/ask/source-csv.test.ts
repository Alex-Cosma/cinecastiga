import {afterEach,describe,expect,it,vi} from 'vitest';
import {answerOutdated,DATA_STILL_CHANGING,requestSourceCsv,sourceRefusal,SourceRequestError} from './source-csv';
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
 it('keeps the status of a refusal: a trend whose months moved answers 409 and the answer is reloaded (plan §2.8)',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({ok:false,error:'Datele s-au actualizat; reîncarcă răspunsul.'},{status:409})));
  const refused=await requestSourceCsv({spec:{block:'trend'},months:[1,5]},signal()).catch((e:unknown)=>e);
  expect(refused).toBeInstanceOf(SourceRequestError);
  expect((refused as SourceRequestError).status).toBe(409);
  expect(answerOutdated(refused)).toBe(true);
  expect(answerOutdated(new SourceRequestError('Restrânge întrebarea.',200))).toBe(false);
  expect(answerOutdated(new Error('x'))).toBe(false);
 });
 it('reloads the answer once per reader action: a 409 on the reloaded answer is said, never reloaded again',()=>{
  const outdated=new SourceRequestError('Datele s-au actualizat; reîncarcă răspunsul.',409);
  // AskPanel.reloadOutdated: true the first time (it reloads), false on the answer that reload brought.
  let reloads=0,reloaded=false;
  const onStale=()=>{if(reloaded)return false;reloads++;reloaded=true;return true;};
  expect(sourceRefusal(outdated,onStale,'x')).toBeNull();
  for(let i=0;i<5;i++)expect(sourceRefusal(outdated,onStale,'x')).toBe(DATA_STILL_CHANGING);
  expect(reloads).toBe(1);
  // Without a reload to ask for (another page than the answer), the server's words; any other refusal keeps its own.
  expect(sourceRefusal(outdated,undefined,'x')).toBe('Datele s-au actualizat; reîncarcă răspunsul.');
  expect(sourceRefusal(new SourceRequestError('Restrânge întrebarea.',200),onStale,'x')).toBe('Restrânge întrebarea.');
  expect(sourceRefusal('?',onStale,'Export nereușit.')).toBe('Export nereușit.');
  expect(reloads).toBe(1);
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
