import { contractKind, contractRonValue, createDb, type DbSql } from "@seap/db";
import { LOT_COLUMNS } from "./notice-lots-columns";
import { facetOf, normalizedPattern, type Channel, type FacetRequest, type FilterSource, type Fragment } from "./table-filters/server/query";
import type { Facet, FilterState } from "./table-filters/types";

/*
 * An award notice's records (core.contracts of one ca_notice_id) as one channel of the column filters (owner decision
 * of 4 November 2026). getAwardNoticeDetail (marts.ts) reads its page through it.
 */

const g = globalThis as unknown as { __seapSql?: DbSql };
const db = (): DbSql => (g.__seapSql ??= createDb().sql);

const winnersOf = (sql: DbSql): Fragment => sql`(select cw.entity_id from core.contract_winners cw where cw.contract_id = c.id)`;

export function noticeLotsSource(sql: DbSql, caNoticeId: string): FilterSource {
  const winners = winnersOf(sql);
  // Wrapped, so the shared helpers' fragments take this module's fragment type from the context.
  const kind: Fragment = sql`${contractKind(sql, "c")}`;
  const value: Fragment = sql`${contractRonValue(sql)}`;
  const channel: Channel = {
    name: "loturi",
    from: sql`core.contracts c`,
    where: sql`c.ca_notice_id = ${caNoticeId}`,
    bindings: {
      tip: { kind: "list", value: kind },
      castigator: {
        kind: "list", value: sql`unnest(array${winners})`,
        match: (ids) => sql`exists (select 1 from core.contract_winners cw where cw.contract_id = c.id and cw.entity_id = any(${sql.array(ids)}::bigint[]))`,
        names: {
          lookup: (ids) => sql`select id::text v, name_display l from core.entities where id = any(${sql.array(ids.filter((v) => /^\d+$/.test(v)))}::bigint[])`,
          search: (term) => sql`exists (select 1 from core.contract_winners cw join core.entities e on e.id = cw.entity_id
            where cw.contract_id = c.id and e.name_normalized like ${normalizedPattern(term)})`,
          matches: (term) => sql`v::bigint in (select id from core.entities where name_normalized like ${normalizedPattern(term)})`,
        },
      },
      data: { kind: "dates", date: sql`to_char(c.contract_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD')` },
      valoare: { kind: "range", value },
    },
  };
  return { columns: LOT_COLUMNS, channels: [channel] };
}

/** One funnel of a notice's records. */
export function getNoticeLotsFacet(caNoticeId: string, key: string, filters: FilterState, request: FacetRequest = {}): Promise<Facet> {
  const sql = db();
  const cid = /^\d+$/.test(caNoticeId) ? caNoticeId : "0";
  return facetOf(sql, noticeLotsSource(sql, cid), key, filters, request);
}
