import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type DbSql } from "@seap/db";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
const { readCoverage } = await import("./coverage");

const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1))) throw new Error("Coverage tests require an isolated seap_test_* database");
const connection = url ? createDb(url) : null;
afterAll(async () => { await connection?.sql.end(); });

// Audit F17: windowed-import windows are decoded as the importers encoded the requested days
// (SEAP `T00:00:00+03:00`, TED UTC), and run times are Bucharest days, whatever the session zone.
describe.runIf(!!connection)("public collection record", () => {
  let q: DbSql;
  beforeEach(async () => {
    q = connection!.sql;
    await q`truncate app.collection_tasks, app.collection_batches, app.collection_requests cascade`;
    await q`truncate core.scrape_runs`;
  });

  it("decodes import windows per source and adds the collector record", async () => {
    // As written by scrape/elicitatie/direct-acquisitions.ts for the 2020 window and scrape/ted/notices.ts:
    // as in production, the last started TED import is a January 2018 backfill; June 2026 finished
    // earlier, and a later July window failed.
    await q`insert into core.scrape_runs(source, window_start, window_end, started_at, finished_at, status, fetched_count, reported_total, deviation)
      values ('elicitatie:das', '2020-01-01T00:00:00+03:00', '2020-12-31T23:59:59+03:00', '2026-07-17T10:20:20Z', '2026-07-17T20:58:03Z', 'completed', 494650, null, null),
        ('ted:can-standard', '2026-06-01T00:00:00Z', '2026-06-30T23:59:59Z', '2026-07-17T09:00:00Z', '2026-07-17T09:01:00Z', 'completed', 1996, 1996, 0),
        ('ted:can-standard', '2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z', '2026-07-17T10:32:22Z', '2026-07-17T10:33:00Z', 'failed', 10, null, null),
        ('ted:can-standard', '2018-01-01T00:00:00Z', '2018-01-31T23:59:59Z', '2026-07-17T12:12:39Z', '2026-07-17T12:13:05Z', 'completed', 0, 0, 0)`;
    await q`insert into app.collection_batches(id, end_day, status, created_at) values ('current', '2026-09-25', 'collecting', '2026-09-26T19:54:56Z')`;
    await q`insert into app.collection_tasks(batch_id, key, partition, stream, kind, params, status, finished_at)
      values ('current', 'da-1', 'p', 'da', 'da', '{}'::jsonb, 'complete', '2026-10-02T04:11:13Z')`;
    const reserved = await q.reserve();
    try {
      await reserved.unsafe("set time zone 'Pacific/Honolulu'");
      const coverage = await readCoverage(reserved as unknown as DbSql);
      const bySource = Object.fromEntries(coverage.collections.map(row => [row.source, row]));
      expect(bySource["elicitatie:das"]).toMatchObject({ completed_window_from: "2020-01-01 00:00:00", completed_window_to: "2020-12-31 23:59:59", completed_fetched: 494650, last_success: "2026-07-17 23:58:03", latest_started: "2026-07-17 13:20:20" });
      // The newest window a completed import covered, with that import's counts; not the last started one.
      expect(bySource["ted:can-standard"]).toMatchObject({ latest_started: "2026-07-17 15:12:39", latest_status: "completed", last_success: "2026-07-17 15:13:05",
        completed_window_from: "2026-06-01 00:00:00", completed_window_to: "2026-06-30 23:59:59", completed_fetched: 1996, completed_reported: 1996, completed_deviation: 0 });
      expect(coverage.collector.streams).toEqual([{ stream: "da", lastSuccessAt: "2026-10-02T07:11:13+03:00", inBatch: true, open: false, gaps: false }]);
    } finally { reserved.release(); }
  });
});
