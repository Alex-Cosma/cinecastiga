import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "../src/client.js";
import { collectorCoverage } from "../src/collection-coverage.js";

const url = process.env["TEST_DATABASE_URL"];
if (url && !/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1))) throw new Error("Collector coverage tests require an isolated seap_test_* database");
const connection = url ? createDb(url) : null;
afterAll(async () => { await connection?.sql.end(); });

// Audit F17: the public "when was data collected" panel read only core.scrape_runs, which the
// continuous collector never writes, and showed a July windowed import as the latest collection.
describe.skipIf(!connection)("continuous collector coverage", () => {
  let q: DbSql;
  beforeEach(async () => {
    q = connection!.sql;
    await q`truncate app.collection_tasks, app.collection_batches, app.collection_requests cascade`;
    await q`truncate core.scrape_runs`;
  });
  async function task(batch: string, stream: string, key: string, status: string, priority = 10, finishedAt: string | null = null) {
    await q`insert into app.collection_tasks(batch_id, key, partition, stream, kind, params, status, priority, finished_at)
      values (${batch}, ${key}, 'p', ${stream}, 'list', '{}'::jsonb, ${status}, ${priority}, ${finishedAt}::timestamptz)`;
  }
  async function inZone<T>(zone: string, read: (sql: DbSql) => Promise<T>) {
    const reserved = await q.reserve();
    try {
      await reserved.unsafe(`set time zone '${zone}'`);
      return await read(reserved as unknown as DbSql);
    } finally { reserved.release(); }
  }

  it("reports nothing rather than a windowed import when the collector never ran", async () => {
    await q`insert into core.scrape_runs(source, started_at, finished_at, status, fetched_count)
      values ('elicitatie:das', '2026-07-17T10:20:20Z', '2026-07-17T20:58:03Z', 'completed', 494650)`;
    expect(await collectorCoverage(q)).toEqual({ batch: null, streams: [] });
  });

  it("dates each stream by its newest ordinary completed task, in Bucharest time with the offset", async () => {
    await q`insert into core.scrape_runs(source, started_at, finished_at, status, fetched_count)
      values ('elicitatie:das', '2026-07-17T10:20:20Z', '2026-07-17T20:58:03Z', 'completed', 494650)`;
    // Requests alone are not a completed collection; only tasks are read.
    await q`insert into app.collection_requests(stream, worker, method, endpoint, outcome, started_at, finished_at)
      values ('da', 'fixture', 'GET', 'https://fixture.invalid', 'success', '2026-10-05T10:00:00Z', '2026-10-05T10:00:02Z')`;
    await q`insert into app.collection_batches(id, end_day, status, created_at) values ('older', '2026-08-31', 'collected', '2026-09-01T00:00:00Z')`;
    await q`insert into app.collection_batches(id, end_day, status, follow_latest, created_at) values ('current', '2026-09-25', 'collecting', true, '2026-09-26T19:54:56Z')`;
    // 22:30 UTC on 1 October is already 2 October in Bucharest (+03:00).
    await task("current", "da", "da-1", "complete", 10, "2026-10-01T22:30:00Z");
    await task("current", "da", "da-2", "pending");
    // A failed task finishing later is not a collection.
    await task("current", "da", "da-3", "failed", 10, "2026-10-02T03:00:00Z");
    // Winter time: +02:00. The newest ordinary completion is in an older batch.
    await task("older", "awards", "aw-old", "complete", 10, "2026-01-15T22:30:00Z");
    await task("current", "awards", "aw-1", "deferred", 2);
    // Background historical backfill (priority >= 50) neither dates nor opens the stream.
    await task("current", "awards", "aw-bg", "complete", 60, "2026-10-03T12:00:00Z");
    await task("current", "awards", "aw-bg2", "pending", 60);
    await task("current", "catalogue", "cat-1", "complete", 10, "2026-10-04T10:00:00Z");

    const coverage = await inZone("Pacific/Honolulu", collectorCoverage);
    expect(coverage.batch).toEqual({ id: "current", endDay: "2026-09-25", status: "collecting", followLatest: true });
    expect(coverage.streams).toEqual([
      { stream: "da", lastSuccessAt: "2026-10-02T01:30:00+03:00", inBatch: true, open: true, gaps: true },
      { stream: "awards", lastSuccessAt: "2026-01-16T00:30:00+02:00", inBatch: true, open: false, gaps: true },
    ]);
    expect(Date.parse(coverage.streams[0]!.lastSuccessAt!)).toBe(Date.parse("2026-10-01T22:30:00Z"));
  });

  it("lists a stream with only background work in the batch, without a collection date", async () => {
    await q`insert into app.collection_batches(id, end_day, status, created_at) values ('current', '2026-09-25', 'collecting', '2026-09-26T19:54:56Z')`;
    await task("current", "ted", "ted-bg", "complete", 60, "2026-10-03T12:00:00Z");
    expect((await collectorCoverage(q)).streams).toEqual([
      { stream: "ted", lastSuccessAt: null, inBatch: true, open: false, gaps: false },
    ]);
  });
});
