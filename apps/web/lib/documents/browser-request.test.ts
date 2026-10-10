import {afterEach,expect,it,vi} from 'vitest';
import {browserDocumentRequest} from './browser-request';
afterEach(()=>vi.unstubAllGlobals());
it('cancels oversize bodies without returning partial bytes or hiding the HTTP status',async()=>{
 const cancel=vi.fn();let chunks=0;
 vi.stubGlobal('fetch',async()=>({status:429,headers:new Headers({'retry-after':'90'}),body:new ReadableStream({pull(c){chunks++;c.enqueue(new Uint8Array(4));},cancel})}));
 const result=await browserDocumentRequest({url:'https://example.test',method:'GET',body:null,maxFileBytes:6});
 expect(result).toMatchObject({status:429,base64:'',oversized:true,receivedBytes:8,retryAfter:'90'});
 expect(cancel).toHaveBeenCalledOnce();expect(chunks).toBeLessThanOrEqual(3);
});
it('returns complete bytes at the limit, preserving the same-session request semantics',async()=>{
 const fetcher=vi.fn(async()=>new Response('123456',{status:200}));vi.stubGlobal('fetch',fetcher);
 const result=await browserDocumentRequest({url:'https://example.test',method:'GET',body:null,maxFileBytes:6});
 expect(result.oversized).toBe(false);expect(atob(result.base64)).toBe('123456');
 expect(fetcher).toHaveBeenCalledWith('https://example.test',expect.objectContaining({credentials:'include',redirect:'manual',method:'GET'}));
});
