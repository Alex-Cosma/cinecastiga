import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@seap/db";
import { recipeStore } from "./recipes";
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
      expect(await store.list(other)).not.toContainEqual(expect.objectContaining({ id:first.id }));
      expect(await store.open(other,first.id)).toBeNull();
      expect(await store.revise(other,first.id,{ ...input,expectedVersion:1 })).toEqual({ error:"missing" });
      const versions = await Promise.all([store.revise(uid,first.id,{ ...input,title:"First tab",expectedVersion:1 }),store.revise(uid,first.id,{ ...input,title:"Second tab",expectedVersion:1 })]);
      expect(versions.filter(r => "error" in r)).toEqual([{ error:"conflict" }]);
      expect(versions.filter(r => "version" in r)).toEqual([{ id:first.id,version:2 }]);
      const original = await store.open(uid,first.id,1);
      expect(original).toMatchObject({ title:input.title,version:1,currentVersion:2,spec:input.spec });
      expect(original!.revisions.map(v => v.version)).toEqual([2,1]);
      expect(await store.open(uid,first.id,999)).toBeNull();
      await expect(store.create(uid,{ ...input,title:"x".repeat(161) })).rejects.toThrow();
      expect((await store.list(uid)).map(r => r.id)).toEqual([first.id]);
    } finally { await sql`delete from auth.users where id in (${uid},${other})`; }
  },15000);
});
