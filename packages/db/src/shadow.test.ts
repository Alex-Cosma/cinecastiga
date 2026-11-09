import { describe, expect, it } from "vitest";
import type { DbSql } from "./client.js";
import { shadowSql, shadowText } from "./shadow.js";

describe("shadowText: the build's SQL text goes to the shadow schemas (owner, 9 November 2026)", () => {
  it("rewrites unquoted and quoted (drizzle) schema-qualified names", () => {
    expect(shadowText("select * from core.contracts c join marts.entity_profile p on true")).toBe(
      "select * from core_next.contracts c join marts_next.entity_profile p on true");
    expect(shadowText('update "core"."entities" set x = 1 from "reference"."uat"')).toBe(
      'update "core_next"."entities" set x = 1 from "reference_next"."uat"');
    expect(shadowText("to_regclass('marts.agg_years'), 'core.contracts'::regclass, core.canonical_entity_id(1)")).toBe(
      "to_regclass('marts_next.agg_years'), 'core_next.contracts'::regclass, core_next.canonical_entity_id(1)");
    expect(shadowText('select count(*) from core."quoted table", marts.*')).toBe('select count(*) from core_next."quoted table", marts_next.*');
    expect(shadowText("pg_get_indexdef(to_regclass('marts.' || i.name))")).toBe("pg_get_indexdef(to_regclass('marts_next.' || i.name))");
  });

  it("leaves every other name alone and is idempotent", () => {
    const untouched = "select a.core, x.marts, raw.raw_documents, app.collection_audit, score_core.x, mycore.t, core_next.t, \"x\".core.y";
    expect(shadowText(untouched)).toBe(untouched);
    expect(shadowText(shadowText("from core.t"))).toBe("from core_next.t");
    expect(shadowText("select 'core' as k, marts as m from t")).toBe("select 'core' as k, marts as m from t");
  });
});

describe("shadowSql: every way a connection sends SQL text", () => {
  type Call = { kind: string; text: string; values: unknown[] };
  function fake(calls: Call[]): DbSql {
    const tag = (chunks: TemplateStringsArray | string, ...values: unknown[]) => {
      if (typeof chunks === "string") { calls.push({ kind: "identifier", text: chunks, values }); return chunks; }
      calls.push({ kind: "template", text: chunks.join("?"), values });
      calls.push({ kind: "raw", text: chunks.raw.join("?"), values });
      return Promise.resolve([]);
    };
    return Object.assign(tag, {
      unsafe: (text: string, values: unknown[] = []) => { calls.push({ kind: "unsafe", text, values }); return Promise.resolve([]); },
      begin: (...args: unknown[]) => (args[args.length - 1] as (q: DbSql) => unknown)(fake(calls)),
      savepoint: (fn: (q: DbSql) => unknown) => fn(fake(calls)),
      reserve: async () => Object.assign(fake(calls), { release: () => calls.push({ kind: "release", text: "", values: [] }) }),
      array: (values: unknown[]) => ({ array: values }),
    }) as unknown as DbSql;
  }

  it("rewrites templates (cooked and raw), unsafe text, and inside transactions, savepoints and reserved connections", async () => {
    const calls: Call[] = [];
    const q = shadowSql(fake(calls));
    await q`select ${"core.x as a bind"} from core.contracts`;
    await q.unsafe("truncate marts.da_transactions", ["marts.value"]);
    await q.begin("isolation level repeatable read", async (tx) => {
      await tx`delete from marts.t`;
      await tx.savepoint(async (sp) => { await sp`insert into reference.authority_uat values (1)`; });
    });
    const reserved = await q.reserve();
    await reserved`select pg_advisory_lock(1); select * from core.entities`;
    reserved.release();
    expect(q("core.identifier") as unknown).toBe("core.identifier");
    expect(calls.filter((c) => c.kind !== "identifier" && c.kind !== "release").map((c) => c.text)).toEqual([
      "select ? from core_next.contracts", "select ? from core_next.contracts",
      "truncate marts_next.da_transactions",
      "delete from marts_next.t", "delete from marts_next.t",
      "insert into reference_next.authority_uat values (1)", "insert into reference_next.authority_uat values (1)",
      "select pg_advisory_lock(1); select * from core_next.entities", "select pg_advisory_lock(1); select * from core_next.entities",
    ]);
    // Bind values are data: never rewritten.
    expect(calls[0]!.values).toEqual(["core.x as a bind"]);
    expect(calls.find((c) => c.kind === "unsafe")!.values).toEqual(["marts.value"]);
    expect(calls.some((c) => c.kind === "release")).toBe(true);
  });
});
