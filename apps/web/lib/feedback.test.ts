import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { feedbackInput, feedbackSourcePath } from "./feedback-shared";
import { feedbackClientKey } from "./feedback";
import { feedbackBody } from "./feedback-http";
const input = () => ({ id:randomUUID(),category:"data",message:"Valoarea afișată pare diferită de sursă.",sourcePath:"/contracte/123?token=secret#x" });
describe("anonymous feedback input", () => {
  it("retains public context without query strings or hashes", () => expect(feedbackInput(input())).toMatchObject({ sourcePath:"/contracte/123" }));
  it.each(["/anchete/private-id", "/anchete/invitatie/token", "/admin/conturi", "/login?next=/", "//evil.test", "https://evil.test/", "/\\evil.test", "/contracte/%31"])("does not attach private or unsafe context %s", path => expect(feedbackSourcePath(path)).toBeNull());
  it("keeps an anonymous report on a private route, without attaching its identifiers", () => expect(feedbackInput({ ...input(),sourcePath:"/anchete/private-id" })).toMatchObject({ sourcePath:null }));
  it.each([{ message:"short" },{message:"x".repeat(3001)},{ category:"unknown" },{id:"bad"},{userId:"account"},{email:"user@example.invalid"},{website:"spam"},{message:"valid length but nul\0 character"}])("rejects invalid or identifying fields %j", patch => expect(feedbackInput({...input(),...patch})).toHaveProperty("error"));
  it("limits the actual streamed request body, even without Content-Length", async () => {
    const request=new Request("http://localhost/api/feedback",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:"x".repeat(17000)})});
    await expect(feedbackBody(request)).rejects.toThrow("size");
  });
  it("accepts Romanian text and rejects malformed JSON", async () => {
    const request=(body:string)=>new Request("http://localhost/api/feedback",{method:"POST",headers:{"Content-Type":"application/json"},body});
    expect(await feedbackBody(request(JSON.stringify(input())))).toMatchObject({category:"data"});
    await expect(feedbackBody(request("{"))).rejects.toThrow();
  });
  it("uses only the trusted overwritten header and rotates pseudonymous rate keys", () => {
    const req=(forwarded:string)=>new Request("https://cinecastiga.ro/api/feedback",{headers:{"x-feedback-client-ip":"192.0.2.1","x-forwarded-for":forwarded}});
    const date=new Date("2026-09-30T12:00:00Z");
    const key=feedbackClientKey(req("evil"),"fixture-secret",true,date);
    expect(key).toBe(feedbackClientKey(req("other"),"fixture-secret",true,date));
    expect(key).not.toContain("192.0.2.1");
    expect(key).not.toBe(feedbackClientKey(req("evil"),"fixture-secret",true,new Date("2026-09-30T13:00:00Z")));
  });
});
