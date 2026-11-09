import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "../src/client.js";
import { shadowText } from "../src/shadow.js";
import { dropShadowSchemas, rollbackShadowSwap, swapShadowSchemas } from "../src/shadow-swap.js";

// Renames the database's own core / marts / reference schemas: only on a dedicated, disposable database.
const url = process.env["SHADOW_TEST_DATABASE_URL"];
if (url && !/^seap_test_shadow_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1))) throw new Error("Shadow swap tests require a dedicated seap_test_shadow_* database");
const writer = url ? createDb(url, { max: 2 }) : null;
// The site's side: a separate pool whose statements are prepared before the swap.
const reader = url ? createDb(url, { max: 1 }) : null;
afterAll(async () => { await writer?.sql.end(); await reader?.sql.end(); });

const DDL = `
create schema core; create schema marts; create schema reference;
create table core.entities (id bigint primary key, name text not null);
create table core.entity_redirects (from_id bigint primary key, to_id bigint not null);
create table marts.touches (n bigint);
create table reference.uat (siruta int primary key, name text);
create function core.canonical_entity_id(bigint) returns bigint language sql stable
  as $$ select coalesce((select to_id from core.entity_redirects where from_id = $1), $1) $$;
create function marts.touched() returns trigger language plpgsql set search_path = pg_catalog, pg_temp
  as $$ begin insert into marts.touches select count(*) from core.entities; return null; end $$;
create trigger entities_touched after insert on core.entities for each statement execute function marts.touched();
create materialized view marts.entity_count as select count(*) n from core.entities;
`;

describe.skipIf(!writer)("blue/green swap of the shadow schemas (owner, 9 November 2026)", () => {
  let q: DbSql;
  beforeEach(async () => {
    q = writer!.sql;
    for (const s of ["core", "marts", "reference"]) for (const suffix of ["", "_next", "_prev"]) await q.unsafe(`drop schema if exists ${s}${suffix} cascade`);
    await q.unsafe(DDL);
    await q`insert into core.entities values (1, 'ieri')`;
    await q`insert into reference.uat values (1, 'ieri')`;
    await q.unsafe("refresh materialized view marts.entity_count");
    // The build's copy: the same structure under _next (as the prepared DDL), its own data.
    await q.unsafe(shadowText(DDL).replace(/create schema (core|marts|reference);/g, "create schema $1_next;"));
    await q.unsafe(shadowText("insert into core.entities values (1, 'azi'), (2, 'nou'); insert into core.entity_redirects values (2, 1); insert into reference.uat values (1, 'azi');"));
    await q.unsafe(shadowText("refresh materialized view marts.entity_count"));
  });

  it("swaps in one transaction: open connections read the new data, functions and triggers work on the new schemas", async () => {
    const r = reader!.sql;
    const names = () => r`select string_agg(name, ',' order by id) v from core.entities`.then((x) => x[0]!["v"]);
    expect(await names()).toBe("ieri");
    let checkpoint = false;
    const report = await swapShadowSchemas(q, async (tx) => { checkpoint = (await tx`select count(*)::int n from core.entities`)[0]!["n"] === 2; });
    expect(checkpoint).toBe(true);
    expect(report.functionsRestored).toBe(2);
    expect(await names()).toBe("azi,nou");
    expect((await r`select name from reference.uat`)[0]!["name"]).toBe("azi");
    expect((await r`select n::int n from marts.entity_count`)[0]!["n"]).toBe(2);
    expect((await r`select core.canonical_entity_id(2)::int id`)[0]!["id"]).toBe(1);
    // Function bodies name the live schemas again, and the trigger writes the new live table, not yesterday's.
    const bodies = await q`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('core', 'marts')`;
    expect(bodies.every((b) => !String(b["prosrc"]).includes("_next"))).toBe(true);
    // The build's insert fired the trigger into the shadow (2); after the swap the live insert lands in the new live table
    // (3), and yesterday's table keeps only yesterday's row (1).
    await q`insert into core.entities values (3, 'după swap')`;
    expect((await q`select n::int n from marts.touches order by n`).map((x) => x["n"])).toEqual([2, 3]);
    expect((await q`select n::int n from marts_prev.touches`).map((x) => x["n"])).toEqual([1]);
  });

  it("refuses a second swap while yesterday's schemas remain, rolls back instantly, and drops one suffix only", async () => {
    await swapShadowSchemas(q);
    await expect(swapShadowSchemas(q)).rejects.toThrow(/Shadow schemas missing|Previous schemas still present/);
    await rollbackShadowSwap(q);
    expect((await reader!.sql`select name from core.entities`).map((x) => x["name"])).toEqual(["ieri"]);
    expect(await dropShadowSchemas(q, "next")).toEqual(["core_next", "marts_next", "reference_next"]);
    expect((await q`select count(*)::int n from pg_namespace where nspname in ('core', 'marts', 'reference')`)[0]!["n"]).toBe(3);
    await expect(rollbackShadowSwap(q)).rejects.toThrow(/Nothing to roll back to/);
  });

  it("changes nothing when the publication inside the swap fails", async () => {
    await expect(swapShadowSchemas(q, async () => { throw new Error("checkpoint refused"); })).rejects.toThrow("checkpoint refused");
    expect((await reader!.sql`select name from core.entities`).map((x) => x["name"])).toEqual(["ieri"]);
    expect((await q`select count(*)::int n from pg_namespace where nspname like '%\\_next'`)[0]!["n"]).toBe(3);
  });
});
