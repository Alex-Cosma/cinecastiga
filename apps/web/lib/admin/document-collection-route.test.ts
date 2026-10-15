import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),status:vi.fn(),change:vi.fn()}));
vi.mock('@/lib/auth',()=>({auth:{api:{getSession:mocks.session}}}));
vi.mock('@/lib/admin/collection-origin',()=>import('./collection-origin'));
vi.mock('@/lib/admin/collection',()=>({CollectionConflict:class extends Error{}}));
vi.mock('@/lib/admin/document-collection',()=>({documentCollectionStatus:mocks.status,changeDocumentCollection:mocks.change}));
import {GET,POST} from '../../app/api/admin/documents/route';
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue(null);});
const req=(origin='http://localhost')=>new Request('http://localhost/api/admin/documents',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'start',revision:0})});
it.each([null,{user:{id:'reader',role:'user'}}])('rejects non-admin reads and commands',async session=>{
 mocks.session.mockResolvedValue(session);
 expect((await GET(new Request('http://localhost/api/admin/documents'))).status).toBe(403);
 expect((await POST(req())).status).toBe(403);expect(mocks.change).not.toHaveBeenCalled();expect(mocks.status).not.toHaveBeenCalled();
});
it('requires same origin for commands and never caches private status',async()=>{
 mocks.session.mockResolvedValue({user:{id:'admin',role:'admin',name:'Admin'}});
 expect((await POST(req('https://untrusted.test'))).status).toBe(403);expect(mocks.change).not.toHaveBeenCalled();
 mocks.change.mockResolvedValue({revision:1});expect((await POST(req())).status).toBe(200);
 expect(mocks.change).toHaveBeenCalledWith({id:'admin',name:'Admin'},{action:'start',revision:0});
 mocks.status.mockResolvedValue({});expect((await GET(new Request('http://localhost/api/admin/documents'))).headers.get('cache-control')).toContain('no-store');
});
