import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
const mocks=vi.hoisted(()=>({ session:vi.fn(),list:vi.fn(),remove:vi.fn(),submit:vi.fn() }));
vi.mock("@/lib/auth",()=>({auth:{api:{getSession:mocks.session}}}));
vi.mock("@/lib/admin/collection-origin",()=>import("./admin/collection-origin"));
vi.mock("@/lib/feedback-shared",()=>import("./feedback-shared"));
vi.mock("@/lib/feedback-http",()=>import("./feedback-http"));
vi.mock("@/lib/feedback",async()=>({...await import("./feedback"),feedbackStore:()=>mocks}));
import { GET,DELETE } from "../app/api/admin/feedback/route";
import { POST } from "../app/api/feedback/route";
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue(null)});
const req=(method:string,origin="http://localhost",query="")=>new Request(`http://localhost/api/admin/feedback${query}`,{method,headers:{origin}});
describe("feedback API access",()=>{
  it.each([null,{user:{id:"watchdog",role:"watchdog"}}])("denies reads and deletion for non-admin sessions %j",async(session)=>{
    mocks.session.mockResolvedValue(session);
    expect((await GET(req("GET"))).status).toBe(403);expect((await DELETE(req("DELETE","http://localhost",`?id=${randomUUID()}`))).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("allows admins, rejects cross-origin deletion and validates identifiers",async()=>{
    mocks.session.mockResolvedValue({user:{id:"admin",role:"admin"}});mocks.list.mockResolvedValue({items:[],total:0,page:1,pages:1});
    const response=await GET(req("GET"));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await GET(req("GET","http://localhost","?page=0"))).status).toBe(400);
    expect((await DELETE(req("DELETE","https://evil.invalid",`?id=${randomUUID()}`))).status).toBe(403);
    expect((await DELETE(req("DELETE","http://localhost","?id=bad"))).status).toBe(400);
    const id=randomUUID();expect((await DELETE(req("DELETE","http://localhost",`?id=${id}`))).status).toBe(200);expect(mocks.remove).toHaveBeenCalledWith(id);
  });
  it("accepts anonymous submissions without looking up an account",async()=>{
    vi.stubEnv("BETTER_AUTH_SECRET","fixture-secret");
    try {
      const response=await POST(new Request("http://localhost/api/feedback",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json"},body:JSON.stringify({id:randomUUID(),category:"bug",message:"Tabelul se încarcă fără să apară rezultatele.",sourcePath:"/intreaba"})}));
      expect(response.status).toBe(201);expect(mocks.session).not.toHaveBeenCalled();expect(mocks.submit).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllEnvs(); }
  });
  it("rejects foreign submissions before touching the store",async()=>{
    expect((await POST(req("POST","https://evil.invalid"))).status).toBe(403);expect(mocks.submit).not.toHaveBeenCalled();
  });
});
