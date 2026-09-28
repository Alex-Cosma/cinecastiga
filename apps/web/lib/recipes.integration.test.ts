import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@seap/db";
import { recipeStore, RecipeTitleTakenError } from "./recipes";
import type { RecipeInput } from "./ask/recipe-input";

const testUrl = process.env["TEST_DATABASE_URL"];
if (testUrl && !/^seap_test_[a-z0-9_]+$/.test(new URL(testUrl).pathname.slice(1))) throw new Error("Recipe fixtures require a dedicated seap_test_* database");
const connection = testUrl ? createDb(testUrl) : null;
afterAll(async () => { await connection?.sql.end(); });

describe.runIf(Boolean(connection))("private recipe persistence", () => {
  it("isolates owners, keeps immutable versions, rejects concurrent stale saves and rolls back failed writes", async () => {
    const sql = connection!.sql, store = recipeStore(sql);
    const uid = `recipes_test_${process.pid}_${Date.now()}`, other = `${uid}_other`;
    await sql`insert into auth.users (id,name,email) values (${uid},'Recipe fixture',${uid+'@example.test'}),(${other},'Other fixture',${other+'@example.test'})`;
    try {
      const input:RecipeInput = { title:"Private question",note:null,spec:{ block:"stat",measure:"value",filters:{ yearFrom:2025 },population:{ operator:"or",groups:[{ operator:"and",conditions:[{ field:"supplier",op:"in",values:["10"] }] }] } } };
      const first = await store.create(uid,input);
      await expect(store.create(uid,{ ...input,title:"  PRIVATE   QUESTION  " })).rejects.toBeInstanceOf(RecipeTitleTakenError);
      const otherOwner = await store.create(other,input);
      expect(otherOwner.id).not.toBe(first.id);
      expect(await store.list(other)).not.toContainEqual(expect.objectContaining({ id:first.id }));
      expect(await store.open(other,first.id)).toBeNull();
      expect(await store.revise(other,first.id,{ ...input,expectedVersion:1 })).toEqual({ error:"missing" });
      const versions = await Promise.all([store.revise(uid,first.id,{ ...input,title:"First tab",expectedVersion:1 }),store.revise(uid,first.id,{ ...input,title:"Second tab",expectedVersion:1 })]);
      expect(versions.filter(r => "error" in r)).toEqual([{ error:"conflict" }]);
      expect(versions.filter(r => "version" in r)).toEqual([expect.objectContaining({ id:first.id,version:2 })]);
      const original = await store.open(uid,first.id,1);
      expect(original).toMatchObject({ title:input.title,version:1,currentVersion:2,spec:input.spec });
      expect(original!.revisions.map(v => v.version)).toEqual([2,1]);
      expect(await store.open(uid,first.id,999)).toBeNull();
      await expect(store.create(uid,{ ...input,title:"x".repeat(161) })).rejects.toThrow();
      expect((await store.list(uid)).map(r => r.id)).toEqual([first.id]);
      const current = await store.open(uid, first.id);
      expect(await store.list(uid, "tab")).toEqual([expect.objectContaining({ id:first.id, title:current!.title, currentVersion:2, spec:input.spec })]);
      expect(await store.list(other, "tab")).toEqual([]);
      expect(await store.list(uid, "%")).toEqual([]);
      expect(await store.list(uid, "_")).toEqual([]);
      expect(await store.list(uid, "unmatched")).toEqual([]);
    } finally { await sql`delete from auth.users where id in (${uid},${other})`; }
  },15000);
  it("keeps names unique under concurrency and checks renames without losing revisions", async () => {
    const sql = connection!.sql, store = recipeStore(sql);
    const uid = `unique_recipe_${process.pid}_${Date.now()}`;
    await sql`insert into auth.users(id,name,email) values (${uid},'Unique fixture',${uid+'@example.test'})`;
    const input:RecipeInput = {title:"Iluminat Buzău",note:null,spec:{block:"stat",measure:"value",filters:{yearFrom:2024}}};
    try {
      const results = await Promise.allSettled([store.create(uid,input),store.create(uid,{...input,title:"  ILUMINAT   BUZĂU "})]);
      expect(results.filter(r=>r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter(r=>r.status === "rejected")).toHaveLength(1);
      const original = (await store.list(uid))[0]!;
      const firstTitle = await store.suggestCopyTitle(uid,input.title);
      expect(firstTitle).toBe("Iluminat Buzău — copie");
      const copy = await store.create(uid,{...input,title:firstTitle});
      expect(await store.suggestCopyTitle(uid,firstTitle)).toBe("Iluminat Buzău — copie 2");
      await expect(store.revise(uid,copy.id,{...input,expectedVersion:1})).rejects.toBeInstanceOf(RecipeTitleTakenError);
      expect(await store.open(uid,copy.id)).toMatchObject({version:1,currentVersion:1,title:firstTitle});
      expect((await store.open(uid,copy.id))!.revisions).toHaveLength(1);
      expect(await store.revise(uid,original.id,{...input,expectedVersion:1})).toMatchObject({id:original.id,version:2});
      await expect(sql`insert into app.query_recipes(owner_user_id,title) values (${uid},'iluminat    buzău')`).rejects.toMatchObject({code:"23505"});
    } finally { await sql`delete from auth.users where id=${uid}`; }
  },15000);

});
