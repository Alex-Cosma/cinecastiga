import type { DbSql } from './client.js';

/** Daily source protection, independent of manual pauses and publication maintenance.
 * Use the database clock in production. `at` exists for deterministic policy tests.
 * On autumn clock change, wait through both occurrences of 03:00; in spring,
 * PostgreSQL resolves the missing 03:30 to 04:30. Never reopen between repeated hours.
 */
export async function collectionQuietWindow(q: DbSql, at?: Date) {
 const [row] = await q`
  with instant as (select coalesce(${at?.toISOString() ?? null}::timestamptz, clock_timestamp()) t),
  bounds as (
   select t,
    ((t at time zone 'Europe/Bucharest')::date + time '02:59') at time zone 'Europe/Bucharest' starts_at,
    ((t at time zone 'Europe/Bucharest')::date + time '03:30') at time zone 'Europe/Bucharest' resumes_at
   from instant
  ) select t >= starts_at and t < resumes_at active, starts_at, resumes_at from bounds`;
 if (!row) throw Error('Programul pauzei SEAP nu poate fi verificat.');
 return {active: row.active === true, starts_at: new Date(row.starts_at).toISOString(), resumes_at: new Date(row.resumes_at).toISOString()};
}
