import { afterEach, describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { getEntityPartnersPaged, getEntityTransactions } from "./marts";

const globalDb = globalThis as unknown as { __seapSql?: DbSql };
const previous = globalDb.__seapSql;
afterEach(() => { if (previous) globalDb.__seapSql = previous; else delete globalDb.__seapSql; });

function database() {
  const statements: { query: string; values: unknown[] }[] = [];
  class Fragment {
    constructor(public query: string, public values: unknown[] = []) {}
    then(resolve: (rows: unknown[]) => unknown) {
      if (this.query.includes("core.canonical_entity_id")) return Promise.resolve(resolve([{ id: this.values[0] }]));
      statements.push(this);
      return Promise.resolve(resolve(this.query.includes("count(*)::int c") ? [{ c: 2 }] : []));
    }
  }
  const sql = ((chunks: TemplateStringsArray, ...params: unknown[]) => {
    const values: unknown[] = [];
    const query = chunks.reduce((result, part, i) => {
      if (i >= params.length) return result + part;
      const value = params[i];
      if (value instanceof Fragment) { values.push(...value.values); return result + part + value.query; }
      values.push(value); return result + part + "?";
    }, "");
    return new Fragment(query, values);
  }) as unknown as DbSql;
  Object.assign(sql, { array: (values: unknown[]) => values });
  globalDb.__seapSql = sql;
  return statements;
}

describe("entity source pagination", () => {
  it.each(["value", "date", "gap"] as const)("orders %s ties by channel, numeric record and consortium member", async (sort) => {
    const statements = database();
    await getEntityTransactions("123", "authority", { page: 3, pageSize: 10, sort, years: ["2025"] });
    expect(statements).toHaveLength(2);
    const page = statements[0]!;
    expect(page.query).toContain("src asc, rid::bigint asc, cp_id asc nulls last");
    expect(page.values.slice(-2)).toEqual([10, 20]);
    for (const { query, values } of statements) {
      expect(query).toContain("where t.authority_id = ? and t.closing_value > 0");
      expect(query).toContain("closing_value > 0 and closing_value <= 2000000");
      expect(values).toContainEqual(["2025"]);
    }
  });
  it("keeps excluded DA records accessible without adding contracts to that scope", async () => {
    const statements = database();
    await getEntityTransactions("123", "supplier", { src: "contracts", excluded: true });
    for (const { query } of statements) {
      expect(query).toContain("supplier_id = ?");
      expect(query).toContain("closing_value is null or closing_value <= 0 or closing_value > 2000000");
      expect(query).not.toContain("from marts.contract_transactions");
    }
  });
  it("counts the unidentified partner group even on a page past the end", async () => {
    const statements = database();
    const result = await getEntityPartnersPaged("123", "authority", 9, 10);
    expect(result).toEqual({ rows: [], total: 2 });
    expect(statements[0]?.query).toContain("order by t desc nulls last, pid asc nulls last");
    expect(statements[0]?.values.slice(-2)).toEqual([10, 80]);
    expect(statements[1]?.query).toContain("select count(*)::int c from (select pid from (");
    expect(statements[1]?.query).toContain("group by pid) partners");
    expect(statements[1]?.query).not.toContain("count(distinct pid)");
  });
});
