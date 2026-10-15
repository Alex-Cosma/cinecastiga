import {afterAll,beforeAll,describe,it,expect,vi} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {extractSignedContent,runTool,DocumentToolError} from './process';
import {SIGNATURE_VERIFIED,SIGNATURE_UNVERIFIED} from './shared';
let dir:string;const signal=new AbortController().signal;
const body=Buffer.from('%PDF-1.4\nSynthetic procurement text, marker ORIGINAL.\n%%EOF');
beforeAll(async()=>{
 dir=await mkdtemp(join(tmpdir(),'seap-p7s-test-'));
 await writeFile(join(dir,'content'),body);
 await runTool('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key'),'-out',join(dir,'cert'),'-subj','/CN=Fixture','-days','1'],signal);
 await runTool('openssl',['cms','-sign','-binary','-nodetach','-in',join(dir,'content'),'-signer',join(dir,'cert'),'-inkey',join(dir,'key'),'-outform','DER','-out',join(dir,'signed')],signal);
},15000);
afterAll(async()=>{if(dir)await rm(dir,{recursive:true,force:true});});
describe('P7S content and signature are independent',()=>{
 it('preserves bytes and verified status for a valid signature without claiming certificate trust',async()=>{
  const output=join(dir,'valid.pdf');expect(await extractSignedContent(join(dir,'signed'),output,signal)).toBe(SIGNATURE_VERIFIED);
  expect(await readFile(output)).toEqual(body);
 });
 it('extracts a readable payload after cryptographic failure and explicitly records failed verification',async()=>{
  const original=await readFile(join(dir,'signed')),tampered=Buffer.from(original),needle=Buffer.from('ORIGINAL'),offset=tampered.indexOf(needle);
  expect(offset).toBeGreaterThan(0);Buffer.from('MODIFIED').copy(tampered,offset);
  const source=join(dir,'tampered'),output=join(dir,'unverified.pdf');await writeFile(source,tampered);
  expect(await extractSignedContent(source,output,signal)).toBe(SIGNATURE_UNVERIFIED);
  expect((await readFile(output)).toString()).toContain('MODIFIED');expect(await readFile(source)).toEqual(tampered);
 });
 it('does not turn malformed containers into readable files',async()=>{
  const source=join(dir,'malformed');await writeFile(source,'not a CMS container');
  await expect(extractSignedContent(source,join(dir,'invalid-output'),signal)).rejects.toThrow();
 });
 it('does not fall back for a missing executable, timeout or other operational failure',async()=>{
  for(const code of [null,1,2,3]){
   const tool=vi.fn().mockRejectedValue(new DocumentToolError('openssl',code));
   await expect(extractSignedContent('unused',join(dir,'unused'),signal,tool)).rejects.toThrow();expect(tool).toHaveBeenCalledTimes(1);
  }
 });
 it('does not fall back after cancellation even when the verification exit code is four',async()=>{
  const stop=new AbortController(),tool=vi.fn(async()=>{stop.abort();throw new DocumentToolError('openssl',4);});
  await expect(extractSignedContent('unused',join(dir,'cancelled'),stop.signal,tool)).rejects.toThrow();expect(tool).toHaveBeenCalledTimes(1);
 });
 it('still rejects a failed extraction instead of persisting a verification warning as success',async()=>{
  const tool=vi.fn().mockRejectedValue(new DocumentToolError('openssl',4));
  await expect(extractSignedContent('unused',join(dir,'failed-output'),signal,tool)).rejects.toThrow();expect(tool).toHaveBeenCalledTimes(2);
 });
});
