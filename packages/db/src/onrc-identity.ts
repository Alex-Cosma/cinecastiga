import type { DbSql } from './client.js';
type Query = DbSql | Parameters<Parameters<DbSql['begin']>[1]>[0];

/**
 * When an ONRC birth date may identify a person (audit F37, 21 October 2026).
 *
 * ONRC publishes no CNP, so a legal representative is identified by name +
 * birth date (+ birth locality in `person_key`). That only holds when the date
 * is real. The register also carries dates that identify nobody:
 * - placeholders: 1910-01-01 (404 rows on the 2026-07-08 snapshot, mostly
 *   insolvency practitioners with birth locality "-") and 1910-10-10 (63);
 * - implausible dates: before 1910 (incl. the 1900-01-01 and 1901-01-01
 *   placeholders, 0002-06-20, 959) or a representative under 16 in the
 *   snapshot year (which covers future dates such as 2074 and 9999-01-01).
 * With such a date, two namesakes (e.g. a common name on 25 firms under
 * 1910-01-01) would share one `person_key`. These rows are treated like rows
 * without a birth date: they never link two firms (net_shared_admin, shared
 * administrators in Radiografie and investigations, "alte firme", the persons
 * typeahead, "conduse de"). The site shows them as "dată de naștere ONRC
 * neplauzibilă" (`onrcBirthYear` in apps/web/lib/format.ts, same constants).
 * The stored dates and `person_key` are unchanged.
 */
export const ONRC_BIRTH_YEAR_MIN = 1910;
export const ONRC_REPRESENTATIVE_MIN_AGE = 16;
export const ONRC_PLACEHOLDER_BIRTH_DATES: readonly string[] = ['1910-01-01', '1910-10-10'];

/** Boolean SQL: the reference.company_reps row `alias` has a birth date that
 * may identify a person (see above). A missing snapshot date falls back to the
 * current year, as on the site. */
export function onrcIdentityBirthDate(q: Query, alias = 'r') {
  return q`(${q(alias)}.birth_date is not null
    and ${q(alias)}.birth_date <> all(${ONRC_PLACEHOLDER_BIRTH_DATES as string[]}::text[]::date[])
    and extract(year from ${q(alias)}.birth_date) >= ${ONRC_BIRTH_YEAR_MIN}::int
    and extract(year from ${q(alias)}.birth_date) <= coalesce(extract(year from ${q(alias)}.snapshot_date), extract(year from current_date))
      - ${ONRC_REPRESENTATIVE_MIN_AGE}::int)`;
}

/** Same rule for a birth date read as text (YYYY-MM-DD, `birth_date::text`). */
export function isOnrcIdentityBirthDate(
  birthDate: string | null | undefined,
  snapshotDate?: string | null,
): boolean {
  if (!birthDate) return false;
  const m = /^(\d{4,})-\d{2}-\d{2}$/.exec(birthDate.trim());
  if (!m || ONRC_PLACEHOLDER_BIRTH_DATES.includes(birthDate.trim())) return false;
  const year = Number(m[1]);
  const snapshot = snapshotDate ? /^(\d{4,})-/.exec(snapshotDate.trim()) : null;
  const reference = snapshot ? Number(snapshot[1]) : new Date().getUTCFullYear();
  return year >= ONRC_BIRTH_YEAR_MIN && year <= reference - ONRC_REPRESENTATIVE_MIN_AGE;
}
