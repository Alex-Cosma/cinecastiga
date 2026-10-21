import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "../src/client.js";
import { collectorCoverage } from "../src/collection-coverage.js";

const url = process.env["TEST_DATABASE_URL"];
if (url && !/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1))) throw new Error("Collector coverage tests require an isolated seap_test_* database");
const connection = url ? createDb(url) : null;
afterAll(async () => { await connection?.sql.end(); });

// Audit F17: the public "when was data collected" panel read core.scrape_runs, which the
// continuous collector never writes, and showed a July legacy import as the latest collection.
describe.skipIf(!connection)("continuous collector coverage", () => {
  let q: DbSql;
  beforeEach(async () => {
    q = connection!.sql;
    await q`truncate app.collection_tasks, app.collection_batches, app.collection_requests cascade`;
    await q`truncate core.scrape_runs`;
  });
  async function request(stream: string, outcome: string, startedAt: string) {
    await q`insert into app.collection_requests(stream, worker, method, endpoint, outcome, started_at, finished_at)
      values (${stream}, 'fixture', 'GET', 'https://fixture.invalid', ${outcome}, ${startedAt}::timestamptz, ${startedAt}::timestamptz + interval '2 seconds')`;
  }
  async function task(batch: string, stream: string, key: string, status: string, priority = 1) {
    await q`insert into app.collection_tasks(batch_id, key, partition, stream, kind, params, status, priority)
      values (${batch}, ${key}, 'p', ${stream}, 'list', '{}'::jsonb, ${status}, ${priority})`;
  }

  it("reports nothing rather than a legacy import when the collector never ran", async () => {
    await q`insert into core.scrape_runs(source, started_at, finished_at, status, fetched_count)
      values ('elicitatie:das', '2026-07-17T10:20:20Z', '2026-07-17T20:58:03Z', 'completed', 494650)`;
    expect(await collectorCoverage(q)).toEqual({ batch: null, streams: [] });
  });

  it("takes each stream's last collection from the collector, in Bucharest days, ignoring the legacy log", async () => {
    await q`insert into core.scrape_runs(source, started_at, finished_at, status, fetched_count)
      values ('elicitatie:das', '2026-07-17T10:20:20Z', '2026-07-17T20:58:03Z', 'completed', 494650)`;
    await q`insert into app.collection_batches(id, end_day, status, created_at) values ('older', '2026-08-31', 'collected', '2026-09-01T00:00:00Z')`;
    await q`insert into app.collection_batches(id, end_day, status, follow_latest, created_at) values ('current', '2026-09-25', 'collecting', true, '2026-09-26T19:54:56Z')`;
    // 22:30 UTC on 1 October is already 2 October in Bucharest; a later failure is not a collection.
    await request("da", "success", "2026-10-01T22:30:00Z");
    await request("da", "failed", "2026-10-02T03:00:00Z");
    await request("awards", "success", "2026-10-01T10:00:00Z");
    await request("catalogue", "success", "2026-10-02T10:00:00Z");
    await task("current", "da", "da-1", "complete");
    await task("current", "da", "da-2", "pending");
    await task("current", "awards", "aw-1", "complete");
    await task("current", "awards", "aw-2", "deferred", 2);
    // Background historical backfill is not the batch's own work.
    await task("current", "awards", "aw-bg", "pending", 60);
    await task("older", "awards", "aw-old", "pending");

    const reserved = await q.reserve();
    try {
      await reserved`set time zone 'Pacific/Honolulu'`;
      const coverage = await collectorCoverage(reserved as unknown as DbSql);
      expect(coverage.batch).toEqual({ id: "current", endDay: "2026-09-25", status: "collecting", followLatest: true });
      expect(coverage.streams.map(s => ({ ...s, lastSuccessAt: s.lastSuccessAt?.slice(0, 16) ?? null }))).toEqual([
        { stream: "da", lastSuccessAt: "2026-10-02 01:30", open: true, gaps: false },
        { stream: "awards", lastSuccessAt: "2026-10-01 13:00", open: false, gaps: true },
      ]);
    } finally { reserved.release(); }
  });
});
