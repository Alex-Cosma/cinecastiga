import type { DbSql } from './client.js';

/** Collector streams behind the public inventory: direct awards, procedure awards/contracts and TED award notices. */
export const PUBLIC_COLLECTION_STREAMS = ['da', 'awards', 'ted'] as const;
export type PublicCollectionStream = typeof PUBLIC_COLLECTION_STREAMS[number];

export interface CollectorStreamCoverage {
  stream: PublicCollectionStream;
  /** Europe/Bucharest wall-clock text of the newest successful source request, or null. */
  lastSuccessAt: string | null;
  /** The current batch still has queued or running work for this stream. */
  open: boolean;
  /** The current batch has failed or deferred work for this stream. */
  gaps: boolean;
}
export interface CollectorCoverage {
  batch: { id: string; endDay: string; status: string; followLatest: boolean } | null;
  streams: CollectorStreamCoverage[];
}

/**
 * Freshness of the continuous collector (`app.collection_requests`/`collection_tasks`).
 * `core.scrape_runs` is the log of the earlier windowed imports; the collector never writes it,
 * so it cannot say when data was last collected (audit F17).
 * Only aggregate metadata is read; the request index keeps the per-stream lookup bounded.
 * Batch work excludes background historical backfill (priority >= 50), as in the admin progress.
 */
export async function collectorCoverage(q: DbSql): Promise<CollectorCoverage> {
  const [batch] = await q`select id, end_day, status, follow_latest from app.collection_batches
    order by created_at desc, id desc limit 1`;
  const batchId = batch ? String(batch['id']) : null;
  const rows = await q`select s.stream,
      (select (r.finished_at at time zone 'Europe/Bucharest')::text from app.collection_requests r
        where r.stream = s.stream and r.outcome = 'success' and r.finished_at is not null
        order by r.started_at desc, r.id desc limit 1) last_success_at,
      exists(select 1 from app.collection_tasks t where t.batch_id = ${batchId} and t.stream = s.stream
        and t.status in ('pending', 'running') and t.priority < 50) open,
      exists(select 1 from app.collection_tasks t where t.batch_id = ${batchId} and t.stream = s.stream
        and t.status in ('failed', 'deferred') and t.priority < 50) gaps,
      exists(select 1 from app.collection_tasks t where t.batch_id = ${batchId} and t.stream = s.stream) in_batch
    from unnest(${[...PUBLIC_COLLECTION_STREAMS]}::text[]) with ordinality s(stream, position)
    order by s.position`;
  return {
    batch: batch ? { id: String(batch['id']), endDay: String(batch['end_day']), status: String(batch['status']), followLatest: batch['follow_latest'] === true } : null,
    // A stream the collector never ran is omitted, not reported as fresh or stale.
    streams: rows.filter(row => row['last_success_at'] !== null || row['in_batch'] === true).map(row => ({
      stream: row['stream'] as PublicCollectionStream,
      lastSuccessAt: row['last_success_at'] === null ? null : String(row['last_success_at']),
      open: row['open'] === true,
      gaps: row['gaps'] === true,
    })),
  };
}
