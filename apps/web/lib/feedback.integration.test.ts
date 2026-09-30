import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "@seap/db";
import { feedbackStore, FeedbackConflictError, FeedbackLimitError } from "./feedback";
import type { FeedbackInput } from "./feedback-shared";
const url=process.env.TEST_DATABASE_URL;
if(url && !/^seap_test_feedback_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1))) throw new Error("Feedback tests require an isolated seap_test_feedback_* database");
const connection=url ? createDb(url) : null;
afterAll(async()=>{await connection?.sql.end()});
const input=():FeedbackInput=>({id:randomUUID(),category:"data",message:"Diferență de valoare între tabel și sursă.",sourcePath:"/contracte/123"});
describe.runIf(!!connection)("anonymous feedback persistence",()=>{
  beforeEach(async()=>{await connection!.sql`truncate app.feedback,app.feedback_limits`});
  it("stores only report fields, deduplicates retries and rejects changed retry content",async()=>{
    const store=feedbackStore(connection!.sql), report=input();
    await Promise.all([store.submit(report,"one"),store.submit(report,"one")]);
    expect((await store.list(1)).total).toBe(1);
    const [row]=await connection!.sql`select * from app.feedback`;
    expect(Object.keys(row!).sort()).toEqual(["category","created_at","id","message","source_path"]);
    await expect(store.submit({...report,message:"Different message with the same identifier."},"one")).rejects.toBeInstanceOf(FeedbackConflictError);
  });
  it("enforces client limits atomically across concurrent requests",async()=>{
    const store=feedbackStore(connection!.sql);
    const results=await Promise.allSettled(Array.from({length:8},()=>store.submit(input(),"same-client")));
    expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(5);
    expect((await store.list(1)).total).toBe(5);
    await expect(store.submit(input(),"same-client")).rejects.toBeInstanceOf(FeedbackLimitError);
  });
  it("reopens expired buckets and keeps a global ceiling",async()=>{
    const q=connection!.sql,store=feedbackStore(q);
    await q`insert into app.feedback_limits(key,count,expires_at) values ('client:expired',5,now()-interval '1 minute'),('global',100,now()+interval '1 hour')`;
    await expect(store.submit(input(),"expired")).rejects.toBeInstanceOf(FeedbackLimitError);
    await q`update app.feedback_limits set expires_at=now()-interval '1 minute'`;
    await store.submit(input(),"expired");
    expect((await store.list(1)).total).toBe(1);
  });
  it("paginates at ten, deletes permanently and clamps the last page after deletion",async()=>{
    const store=feedbackStore(connection!.sql);
    for(let i=0;i<11;i++) await store.submit(input(),`client-${i}`);
    const first=await store.list(1),last=await store.list(2);
    expect(first.items).toHaveLength(10);expect(last.items).toHaveLength(1);
    await store.remove(last.items[0]!.id);await store.remove(last.items[0]!.id);
    expect(await store.list(2)).toMatchObject({total:10,page:1,pages:1});
    expect((await store.list(1)).items.map(x=>x.id)).not.toContain(last.items[0]!.id);
  });
});
