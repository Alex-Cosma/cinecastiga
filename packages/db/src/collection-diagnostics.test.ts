import {describe,it,expect} from 'vitest';
import {diagnosticError,sanitizeDiagnostics,responseDiagnosticBody} from './collection-diagnostics.js';
describe('failure diagnostic preservation',()=>{
 it('retains causes, stack and socket error codes without credentials',()=>{
  const cause=Object.assign(new Error('connect failed https://user:private@host/path'),{code:'ECONNRESET',syscall:'read'});
  const d=diagnosticError(new Error('fetch failed',{cause})) as any;
  expect(d.cause.code).toBe('ECONNRESET');expect(d.cause.syscall).toBe('read');expect(d.stack).toContain('fetch failed');expect(JSON.stringify(d)).not.toContain('private');
 });
 it('keeps useful headers, complete JSON body and filters but redacts secrets recursively',()=>{
  const value=sanitizeDiagnostics({headers:{'Content-Type':'application/json','Set-Cookie':'sensitive',Authorization:'Bearer secret'},body:{pageIndex:1,token:'hidden',noticeDocumentUrl:'privateURL',items:[{id:42}]}});
  expect(value).toMatchObject({headers:{'Content-Type':'application/json','Set-Cookie':'[redacted]'},body:{pageIndex:1,items:[{id:42}]}});
  for(const secret of ['sensitive','Bearer secret','hidden','privateURL'])expect(JSON.stringify(value)).not.toContain(secret);
 });
 it('redacts anti-CSRF fields in HTML error/challenge pages, independent of attribute order',()=>{
  const body=responseDiagnosticBody(Buffer.from('<input value="privateA" name="csrfToken"><meta name="csrf" content="privateB">'),true);
  expect(JSON.stringify(body)).not.toMatch(/privateA|privateB/);
  expect(sanitizeDiagnostics({headers:{'X-CSRF':'privateC'}})).toEqual({headers:{'X-CSRF':'[redacted]'}});
 });
 it('marks interrupted bodies as incomplete and preserves received bytes',()=>{
  const d=responseDiagnosticBody(Buffer.from('partial response'),false);
  expect(d).toMatchObject({body:'partial response',complete:false,receivedBytes:16});
 });
 it('redacts textual tokens, transient URLs and null bytes in malformed responses',()=>{
  const d=responseDiagnosticBody(Buffer.from('password=secret Bearer xyz /noticedoc/abcdef \u0000'),false);
  expect(JSON.stringify(d)).not.toMatch(/secret|xyz|abcdef|\\u0000/);
 });
});
