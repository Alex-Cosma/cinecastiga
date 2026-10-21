import type { DbSql } from "@seap/db";

/**
 * Historical quarantine rows whose cause the resolver no longer has (audit F21,
 * 21 October 2026). Between 14 and 22 July 2026, award-contracts envelopes failed
 * when a winner's SICAP id led to a CUI-less placeholder and the backfill tried
 * to give it a CUI another entity already owned (`entities_cui_canonical_uq`).
 * Since 7 October `resolveEntity()` resolves such a record by its exact valid CUI
 * instead. Migration 0062 kept rows older than the last ready publication as
 * history (`retry_required=false`), so these envelopes were never retried and
 * their notices had no contracts at all.
 *
 * This reopens exactly that failure class for the ordinary retry, nothing else:
 * only award-contracts:v1, only that statement + constraint, only the latest
 * envelope of its notice (a newer envelope already supersedes an older one; an
 * older payload must never overwrite it). A retry that fails again stays pending
 * and counts against the publication's quarantine ceiling, like any other.
 * Idempotent: a reopened row is no longer `retry_required=false`.
 */
export const FIXED_BACKFILL_ERROR_PREFIX =
  'Failed query: update "core"."entities" set "cui_canonical" = coalesce(';
export const FIXED_BACKFILL_ERROR_CAUSE =
  '| cause: duplicate key value violates unique constraint "entities_cui_canonical_uq"';

export async function reopenFixedQuarantine(sql: DbSql): Promise<string[]> {
  const rows = await sql`
    update core.quarantine q set retry_required = true
    from raw.raw_documents r
    where r.id = q.raw_id
      and q.endpoint_version = 'award-contracts:v1'
      and r.endpoint_version = 'award-contracts:v1'
      and not q.retry_required
      and q.resolved_at is null
      and starts_with(q.zod_error, ${FIXED_BACKFILL_ERROR_PREFIX})
      and strpos(q.zod_error, ${FIXED_BACKFILL_ERROR_CAUSE}) > 0
      and not exists (
        select 1 from raw.raw_documents newer
        where newer.source = r.source
          and newer.external_id = r.external_id
          and newer.endpoint_version = r.endpoint_version
          and newer.id > r.id
      )
    returning q.raw_id::text raw_id`;
  return [...new Set(rows.map((row) => String(row.raw_id)))];
}
