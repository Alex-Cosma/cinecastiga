import type { DbSql } from './client.js';

/** Collector streams behind the public inventory: direct awards, procedure awards/contracts and TED award notices. */
export const PUBLIC_COLLECTION_STREAMS = ['da', 'awards', 'ted'] as const;
export type PublicCollectionStream = typeof PUBLIC_COLLECTION_STREAMS[number];
/** Tasks at or above this priority are background historical backfill (`BACKGROUND_PRIORITY` in apps/ingestion collection/plan.ts). */
export const COLLECTION_BACKGROUND_PRIORITY = 50;
const TASK_STATUSES = ['pending', 'running', 'complete', 'split', 'deferred', 'failed'];

export interface CollectorStreamCoverage {
  stream: PublicCollectionStream;
  /**
   * When the newest ordinary (non-background) collector task of the stream completed, as
   * Europe/Bucharest wall-clock time with its UTC offset (`2026-10-02T07:11:13+03:00`), or null.
   * The first ten characters are the Bucharest day; `Date.parse` gives the instant.
   */
  lastSuccessAt: string | null;
  /** The current batch has tasks for this stream. */
  inBatch: boolean;
  /** The current batch still has queued or running ordinary work for this stream. */
  open: boolean;
  /** The current batch has failed or deferred ordinary work for this stream. */
  gaps: boolean;
}
export interface CollectorCoverage {
  batch: { id: string; endDay: string; status: string; followLatest: boolean } | null;
  streams: CollectorStreamCoverage[];
}

/**
 * Freshness of the continuous collector (`app.collection_tasks`/`collection_batches`).
 * `core.scrape_runs` is the separate log of the windowed import commands (`pnpm scrape`,
 * `scrape-ted`, `scrape-ted-bulk`); the collector never writes it (audit F17).
 * Background historical backfill (priority >= 50) is excluded from the last collection and the
 * batch state alike, as in the admin progress: a completed 2018 backfill page is not a fresh
 * collection of the stream.
 * Every lookup is an index range on `collection_task_queue` (batch_id, status, stream, priority):
 * the batch state probes the lowest priority per status, so a stream without tasks reads no rows.
 */
export async function collectorCoverage(q: DbSql): Promise<CollectorCoverage> {
  const [batch] = await q`select id, end_day, status, follow_latest from app.collection_batches
    order by created_at desc, id desc limit 1`;
  const batchId = batch ? String(batch['id']) : null;
  const rows = await q`select s.stream, last.success_at last_success_at, probe.statuses
    from unnest(${[...PUBLIC_COLLECTION_STREAMS]}::text[]) with ordinality s(stream, position)
    cross join lateral (
      select to_char(n.local, 'YYYY-MM-DD"T"HH24:MI:SS') || '+' || to_char(n.local - (n.finished at time zone 'UTC'), 'HH24:MI') success_at
      from (select f.finished, f.finished at time zone 'Europe/Bucharest' local
        from (select max(x.finished_at) finished from app.collection_batches b
          cross join lateral (select max(t.finished_at) finished_at from app.collection_tasks t
            where t.batch_id = b.id and t.status = 'complete' and t.stream = s.stream
              and t.priority < ${COLLECTION_BACKGROUND_PRIORITY}) x) f) n
    ) last
    cross join lateral (
      select coalesce(jsonb_object_agg(st.status, p.min_priority) filter (where p.min_priority is not null), '{}'::jsonb) statuses
      from unnest(${TASK_STATUSES}::text[]) st(status)
      cross join lateral (select min(t.priority) min_priority from app.collection_tasks t
        where t.batch_id = ${batchId} and t.status = st.status and t.stream = s.stream) p
    ) probe
    order by s.position`;
  const ordinary = (statuses: Record<string, number>, ...names: string[]) =>
    names.some(name => statuses[name] !== undefined && statuses[name] < COLLECTION_BACKGROUND_PRIORITY);
  return {
    batch: batch ? { id: String(batch['id']), endDay: String(batch['end_day']), status: String(batch['status']), followLatest: batch['follow_latest'] === true } : null,
    streams: rows.flatMap(row => {
      const statuses = row['statuses'] as Record<string, number>;
      const inBatch = Object.keys(statuses).length > 0;
      // A stream the collector never ran is omitted, not reported as fresh or stale.
      if (row['last_success_at'] === null && !inBatch) return [];
      return [{
        stream: row['stream'] as PublicCollectionStream,
        lastSuccessAt: row['last_success_at'] === null ? null : String(row['last_success_at']),
        inBatch,
        open: ordinary(statuses, 'pending', 'running'),
        gaps: ordinary(statuses, 'failed', 'deferred'),
      }];
    }),
  };
}
