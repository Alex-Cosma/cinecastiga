import {describe,it,expect} from 'vitest';
import {diagnosticError,sanitizeDiagnostics,responseDiagnosticBody,retryableProxyTransport,seapInternalErrorLocation,seapInternalErrorRedirect,seapSystemError} from './collection-diagnostics.js';
describe('failure diagnostic preservation',()=>{
 it('recognizes SEAP system errors answered as HTTP 400, nothing else',()=>{
  expect(seapSystemError({response:{body:['Eroare de sistem 261019-49','\r\nThe underlying provider failed on EnlistTransaction.']}})).toBe(true);
  expect(seapSystemError({response:{body:' Eroare de sistem 261017-24'}})).toBe(true);
  for(const body of ['Cerere invalidă',['Missing Authorization header'],{message:'Eroare de sistem'},undefined])expect(seapSystemError({response:{body}})).toBe(false);
  expect(seapSystemError(undefined)).toBe(false);
 });
 it('recognizes a redirect to SEAP\'s internal error page (15 November 2026), nothing else',()=>{
  const at='/assets/errors/internal-error.htm?aspxerrorpath=/api-pub/PublicDirectAcquisition/getView/123334025';
  expect(seapInternalErrorRedirect(302,{response:{status:302,headers:{date:'Sun, 15 Nov 2026 09:17:51 GMT',server:'SICAP',location:at}}})).toBe(true);
  expect(seapInternalErrorRedirect(302,{response:{headers:{Location:'https://e-licitatie.ro/assets/errors/internal-error.htm'}}})).toBe(true);
  expect(seapInternalErrorLocation('https://www.e-licitatie.ro/assets/errors/internal-error.htm#x')).toBe(true);
  // A login, a challenge or another site is not SEAP's error page; a 200 or a 500 is not a redirect.
  for(const location of ['/pub/login','/assets/errors/forbidden.htm','https://evil.example/assets/errors/internal-error.htm','/assets/errors/internal-error.html',null,undefined])
   expect(seapInternalErrorRedirect(302,{response:{headers:{location}}})).toBe(false);
  expect(seapInternalErrorRedirect(200,{response:{headers:{location:at}}})).toBe(false);
  expect(seapInternalErrorRedirect(500,{response:{headers:{location:at}}})).toBe(false);
  expect(seapInternalErrorRedirect(302,undefined)).toBe(false);
 });
 it('distinguishes network failures from invalid data and unexpected errors',()=>{
  const socket=Object.assign(new Error('private proxy endpoint'),{code:'ECONNRESET'});
  expect(retryableProxyTransport(new TypeError('fetch failed',{cause:socket}))).toBe(true);
  expect(retryableProxyTransport(new SyntaxError('Invalid JSON response'))).toBe(false);
  expect(retryableProxyTransport(new Error('Source response exceeds budget'))).toBe(false);
  expect(retryableProxyTransport(new Error('unknown failure'))).toBe(false);
 });
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
