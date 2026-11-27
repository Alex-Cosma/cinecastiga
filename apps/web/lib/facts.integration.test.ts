import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { adminFacts, decideFact, publicFact, publicFacts } from "./facts";

// „Știați că” (owner, 26 November 2026; migration 0118): a proposal nobody touches stays unpublished; a fact is public
// when it is approved and its day has come. Runs only against a dedicated, migrated seap_test_* database.
const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Fact fixtures require a dedicated seap_test_* database");

describe.skipIf(!url)("the facts of „Știați că” (isolated PostgreSQL)", () => {
  let sql: DbSql;
  const ids: Record<string, string> = {};
  const data = JSON.stringify({ firms: 34006, one: 5998, share: 5998 / 34006 });
  beforeAll(async () => {
    sql = createDb(url).sql;
    await sql`delete from app.facts where key like 'fixture:%'`;
    for (const key of ["a", "b", "c", "unknown"]) {
      const [row] = await sql`insert into app.facts (key, recipe, kind, data, entity_ids) values (${"fixture:" + key}, ${key === "unknown" ? "no_such_recipe" : "firms_one_client"}, 'share', ${data}::jsonb, ${sql.array(key === "c" ? [] : ["991"])}::bigint[]) returning id::text id`;
      ids[key] = String(row!.id);
    }
  });
  afterAll(async () => { if (sql) { await sql`delete from app.facts where key like 'fixture:%'`; await sql.end(); } });
  const mine = async () => (await publicFacts(sql)).filter((f) => Object.values(ids).includes(f.id)).map((f) => f.id);

  it("publishes nothing by itself, and shows the console the default words of each proposal", async () => {
    expect(await mine()).toEqual([]);
    const listed = (await adminFacts(sql)).facts.filter((f) => f.key.startsWith("fixture:"));
    // A recipe this version does not know has no words: it is not offered.
    expect(listed.map((f) => f.key).sort()).toEqual(["fixture:a", "fixture:b", "fixture:c"]);
    expect(listed[0]).toMatchObject({ status: "proposed", figure: "17,6%", published: false, edited: false, checkStatus: "ok" });
  });

  it("makes a fact public today with the words shown, and gives it its own address", async () => {
    expect(await decideFact(ids.a!, "publish", {}, "test", sql)).toBe(true);
    expect(await mine()).toEqual([ids.a]);
    expect(await publicFact(ids.a!, sql)).toMatchObject({ id: ids.a, figure: "17,6%", statement: "din firmele cu peste 1 milion de lei din contracte publice au un singur client public." });
    expect(await publicFact(ids.b!, sql)).toBeNull();
    expect(await publicFact("abc", sql)).toBeNull();
  });

  it("keeps a scheduled fact out until its day, and warns when the same entity comes again within 30 days", async () => {
    expect(await decideFact(ids.b!, "schedule", { publishOn: "2999-01-01" }, "test", sql)).toBe(true);
    expect(await mine()).toEqual([ids.a]);
    await sql`update app.facts set publish_on = (now() at time zone 'Europe/Bucharest')::date + 3 where id = ${ids.b!}`;
    const listed = (await adminFacts(sql)).facts;
    expect(listed.find((f) => f.id === ids.b)).toMatchObject({ status: "approved", published: false, repeats: true });
    expect(listed.find((f) => f.id === ids.c)).toMatchObject({ repeats: false });
    // A day in the past is today at the earliest.
    expect(await decideFact(ids.b!, "schedule", { publishOn: "2000-01-01" }, "test", sql)).toBe(true);
    expect((await mine()).sort()).toEqual([ids.a, ids.b].sort());
  });

  it("saves corrected words, and an emptied context stays empty", async () => {
    expect(await decideFact(ids.c!, "edit", { statement: "  propoziție corectată.  ", context: "" }, "test", sql)).toBe(true);
    expect((await adminFacts(sql)).facts.find((f) => f.id === ids.c)).toMatchObject({ statement: "propoziție corectată.", context: null, edited: true, status: "proposed" });
    expect(await decideFact(ids.c!, "edit", { statement: " " }, "test", sql)).toBe(false);
    expect(await decideFact(ids.c!, "publish", {}, "test", sql)).toBe(true);
    expect(await publicFact(ids.c!, sql)).toMatchObject({ statement: "propoziție corectată.", context: null });
  });

  it("follows only the choices that fit a fact's state", async () => {
    expect(await decideFact(ids.a!, "reject", {}, "test", sql)).toBe(false);   // published: it is withdrawn, not rejected
    expect(await decideFact(ids.a!, "withdraw", {}, "test", sql)).toBe(true);
    expect(await publicFact(ids.a!, sql)).toBeNull();
    expect(await decideFact(ids.a!, "publish", {}, "test", sql)).toBe(false);  // withdrawn: restored first
    expect(await decideFact(ids.a!, "restore", {}, "test", sql)).toBe(true);
    expect((await adminFacts(sql)).facts.find((f) => f.id === ids.a)).toMatchObject({ status: "proposed", publishOn: null });
    expect(await decideFact(ids.unknown!, "publish", {}, "test", sql)).toBe(false);
    expect(await decideFact("999999999", "publish", {}, "test", sql)).toBe(false);
  });
});
