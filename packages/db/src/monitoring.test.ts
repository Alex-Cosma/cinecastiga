import { describe, expect, it } from "vitest";
import type { DbSql } from "./client.js";
import { withMonitoringSnapshot } from "./monitoring.js";

/** Reserved-connection harness: records every statement in order. */
function database() {
  const log: string[] = [];
  const connection = Object.assign(async (chunks: TemplateStringsArray) => {
    const text = chunks.join("?").replace(/\s+/g, " ").trim();
    log.push(text);
    if (text.includes("pg_try_advisory_lock_shared")) return [{ acquired: true }];
    if (text.includes("from app.monitoring_refreshes")) return [{ id: "cp", version: "1", status: "ready" }];
    return [];
  }, { release: () => log.push("release") });
  return { sql: { reserve: async () => connection } as unknown as DbSql, log };
}

describe("analytic snapshot", () => {
  // Regression (C1, 24 Oct 2026): comparisons and relations reuse the same
  // prepared statements on a long-lived pool and fell onto generic plans.
  it("plans every statement of the snapshot for its own values, from the first statement after BEGIN", async () => {
    const db = database();
    await withMonitoringSnapshot(db.sql, async (q) => { await q`select 1 work`; return null; });
    const begin = db.log.indexOf("begin isolation level repeatable read");
    expect(begin).toBeGreaterThan(0);
    expect(db.log[begin + 1]).toBe("set local plan_cache_mode = force_custom_plan");
    expect(db.log.indexOf("select 1 work")).toBeGreaterThan(begin + 1);
    expect(db.log.slice(-3)).toEqual(["commit", "select pg_advisory_unlock_shared(?, ?)", "release"]);
  });
});
