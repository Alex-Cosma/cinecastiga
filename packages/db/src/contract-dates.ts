import type { DbSql } from './client.js';
type Query = DbSql | Parameters<Parameters<DbSql['begin']>[1]>[0];

/** First calendar day (Romanian time) the archive covers: the SICAP award
 * notices behind every contract start in January 2018. A contract date before
 * it is a source date we cannot place on a year (often a typed year such as
 * 2000-01-20 for a contract numbered "Data 20.01.2020"). The source date is
 * never rewritten, from the title or from the notice; it stays visible on the
 * contract page, and the amount still counts in totals. It only gets no
 * calendar year: no year bar, coverage start, activity range or history. */
export const CONTRACT_DATE_FLOOR = '2018-01-01';

/** True when the contract date can be attributed to a year; null when absent. */
export function contractDatePlausible(q: Query, alias = 'c') {
  return q`((${q(alias)}.contract_date at time zone 'Europe/Bucharest') >= ${CONTRACT_DATE_FLOOR}::date)`;
}
