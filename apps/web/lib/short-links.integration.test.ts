import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { shortLinkCodes } from "./short-links-shared";
import { SHORT_LINK_LIMITS, ShortLinkLimitError, shortLinkStore } from "./short-links";

const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Short link fixtures require a seap_test_* database");
const db = url ? createDb(url, { max: 2 }) : null;
afterAll(async () => { await db?.sql.end(); });

describe.skipIf(!db)("short links (isolated PostgreSQL, owner 9 November 2026)", () => {
  let q: DbSql;
  beforeEach(async () => {
    q = db!.sql;
    await q`delete from app.short_links`;
    await q`delete from app.feedback_limits where key like 'short-link:%'`;
  });

  it("gives the same address the same code without a second row, and opens it", async () => {
    const store = shortLinkStore(q);
    const code = await store.create("/intreaba?spec=YQ%3D%3D", "a");
    expect(code).toBe(shortLinkCodes("/intreaba?spec=YQ%3D%3D")[0]);
    expect(await store.create("/intreaba?spec=YQ%3D%3D", "b")).toBe(code);
    expect((await q`select count(*)::int n from app.short_links`)[0]!["n"]).toBe(1);
    // Only the new row counted against the visitor.
    expect((await q`select count from app.feedback_limits where key = 'short-link:client:a'`)[0]!["count"]).toBe(1);
    expect(await store.open(code)).toBe("/intreaba?spec=YQ%3D%3D");
    expect(await store.open("zzzzzzzz")).toBeNull();
    expect(await store.open("../admin")).toBeNull();
    expect((await q`select opens from app.short_links where code = ${code}`)[0]!["opens"]).toBe(1);
  });

  it("takes one more character when another address holds the code", async () => {
    const [short, longer] = shortLinkCodes("/intreaba?spec=Yg%3D%3D");
    await q`insert into app.short_links (code, target) values (${short!}, '/cauta?q=altceva')`;
    expect(await shortLinkStore(q).create("/intreaba?spec=Yg%3D%3D", "a")).toBe(longer);
  });

  it("refuses new links past a visitor's limit, still giving the ones already made", async () => {
    const store = shortLinkStore(q);
    const [, maximum] = SHORT_LINK_LIMITS[0];
    for (let i = 0; i < maximum; i++) await store.create(`/cauta?q=${i}`, "a");
    await expect(store.create("/cauta?q=one-more", "a")).rejects.toBeInstanceOf(ShortLinkLimitError);
    expect(await store.create("/cauta?q=0", "a")).toBe(shortLinkCodes("/cauta?q=0")[0]);
    expect(await store.create("/cauta?q=one-more", "b")).toBe(shortLinkCodes("/cauta?q=one-more")[0]);
  });
});
