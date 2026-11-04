import { createDb, type DbSql } from "@seap/db";
import type { TedAward } from "./marts";
import { FOREIGN, TED_COLUMNS } from "./ted-columns";
import { tedCountryFilter, tedPagination, TED_COUNTRY_UNRESOLVED } from "./ted";
import { channelWhere, facetOf, normalizedPattern, type Channel, type FacetRequest, type FilterSource, type Fragment } from "./table-filters/server/query";
import type { Facet, FilterState } from "./table-filters/types";

/*
 * /supra-prag's award table (marts.ted_awards, ~4 million lot results) filtered by its column funnels (owner decision
 * of 4 November 2026). Every filter has an index (0098 adds the procedure and the winners'); a funnel counts within
 * FACET_BUDGET_MS and finishes in the background past it (lib/table-filters/server/query.ts).
 */

const g = globalThis as unknown as { __seapSql?: DbSql };
const db = (): DbSql => (g.__seapSql ??= createDb().sql);

/** A funnel of this table answers within this time, or with its options unnumbered. */
export const TED_FACET_BUDGET_MS = 1500;

/** Only lei amounts of a payable or a contract value compare; the sort by value keeps to them too. */
const comparable = (sql: DbSql): Fragment => sql`t.currency = 'RON' and t.amount_kind in ('payable', 'contract_value')`;

const entityNames = (sql: DbSql) => ({
  lookup: (ids: string[]): Fragment => sql`select id::text v, name_display l from core.entities where id = any(${sql.array(ids.filter((v) => /^\d+$/.test(v)))}::bigint[])`,
});

/** The award table as one channel of the column filters. */
export function tedSource(sql: DbSql): FilterSource {
  const names = entityNames(sql);
  const matching = (term: string): Fragment => sql`(select id from core.entities where name_normalized like ${normalizedPattern(term)})`;
  const channel: Channel = {
    name: "ted",
    from: sql`marts.ted_awards t`,
    where: sql`true`,
    bindings: {
      autoritate: {
        kind: "list", value: sql`t.buyer_entity_id`,
        match: (ids) => sql`t.buyer_entity_id = any(${sql.array(ids)}::bigint[])`,
        names: { ...names, search: (term) => sql`t.buyer_entity_id in ${matching(term)}` },
      },
      castigator: {
        kind: "list", value: sql`unnest(t.winner_entity_ids)`,
        match: (ids) => sql`t.winner_entity_ids && ${sql.array(ids)}::bigint[]`,
        names: { ...names, search: (term) => sql`t.winner_entity_ids && array${matching(term)}::bigint[]`, matches: (term) => sql`v::bigint in ${matching(term)}` },
      },
      tara: {
        kind: "list",
        // a foreign winner's row: „străin”, its countries other than Romania, and „de verificat” when it has none
        value: sql`unnest(array[${FOREIGN}::text] || coalesce(array(
          select distinct upper(btrim(c)) from unnest(t.winner_countries) c where nullif(btrim(c), '') is not null and upper(btrim(c)) <> 'RO'
        ), array[]::text[]) || case when ${tedCountryFilter(sql, TED_COUNTRY_UNRESOLVED)} then array[${TED_COUNTRY_UNRESOLVED}::text] else array[]::text[] end)`,
        only: sql`t.is_foreign`,
        match: (values) => {
          const parts: Fragment[] = values.map((v) => v === FOREIGN ? sql`t.is_foreign` : sql`(t.is_foreign and ${tedCountryFilter(sql, v)})`);
          return parts.reduce((a, b) => sql`${a} or ${b}`);
        },
      },
      cpv: {
        kind: "list", value: sql`t.cpv_code`,
        names: {
          lookup: (codes) => sql`select code v, name_ro l from core.cpv_codes where code = any(${sql.array(codes)}::text[])`,
          search: (term) => /^\d/.test(term)
            ? sql`t.cpv_code like ${`${term.replace(/[^\d-]/g, "")}%`}`
            : sql`t.cpv_code in (select code from core.cpv_codes where lower(unaccent(name_ro)) like ${normalizedPattern(term)})`,
        },
      },
      potrivire: { kind: "list", value: sql`t.label` },
      oferte: {
        kind: "list",
        value: sql`case when t.is_single_bidder then 'unu' when t.tenders_received > 1 then 'mai_multe' when t.tenders_received is null then 'necunoscut' end`,
        match: (values) => {
          const parts: Fragment[] = [];
          if (values.includes("unu")) parts.push(sql`t.is_single_bidder`);
          if (values.includes("mai_multe")) parts.push(sql`(t.tenders_received > 1 and t.is_single_bidder is not true)`);
          if (values.includes("necunoscut")) parts.push(sql`(t.tenders_received is null and t.is_single_bidder is not true)`);
          return parts.length ? parts.reduce((a, b) => sql`${a} or ${b}`) : sql`false`;
        },
      },
      procedura: { kind: "list", value: sql`t.procedure_type` },
      valoare: { kind: "range", value: sql`t.awarded_value`, guard: comparable(sql) },
    },
  };
  return { columns: TED_COLUMNS, channels: [channel] };
}

/** One page of the awards under the filters, newest first or by value in lei. */
export async function getTedAwards(q: { filters: FilterState; sort: "value" | "date"; page: number; pageSize: number }): Promise<{ rows: TedAward[]; total: number; page: number }> {
  const sql = db();
  const [channel] = tedSource(sql).channels;
  const none: Fragment = sql`false`;
  const filtered = channelWhere(sql, channel!, q.filters) ?? none;
  // Comparing currencies or framework ceilings to offers would be misleading.
  const where: Fragment = q.sort === "value" ? sql`${filtered} and ${comparable(sql)}` : filtered;
  const order = q.sort === "value" ? sql`t.awarded_value desc nulls last, t.ted_lot_result_id` : sql`t.award_date desc nulls last, t.ted_lot_result_id`;
  const [count] = (await sql`select count(*)::int c from marts.ted_awards t where ${where}`) as unknown as { c: number }[];
  const total = Number(count?.c ?? 0);
  const { page, pageSize, offset } = tedPagination(q.page, q.pageSize, total);
  const rows = (await sql`
    select ted_lot_result_id, publication_number, buyer_entity_id, buyer_name,
           buyer_county, winner_names, winner_entity_ids, to_jsonb(winner_countries) as winner_countries,
           is_foreign, cpv_code, cpv_name, title, awarded_value, currency,
           award_date, procedure_type, is_single_bidder, eu_funded, label,
           matched_contract_id, amount_kind, amount_details, lot_id, winner_selection_status, tenders_received
    from marts.ted_awards t
    where ${where}
    order by ${order}
    limit ${pageSize} offset ${offset}
  `) as unknown as Record<string, unknown>[];
  return {
    total, page,
    rows: rows.map((r) => ({
      tedLotResultId: String(r["ted_lot_result_id"]),
      publicationNumber: (r["publication_number"] as string | null) ?? null,
      buyerEntityId: r["buyer_entity_id"] != null ? String(r["buyer_entity_id"]) : null,
      buyerName: (r["buyer_name"] as string | null) ?? null,
      buyerCounty: (r["buyer_county"] as string | null) ?? null,
      winnerNames: (r["winner_names"] as string[] | null) ?? [],
      winnerEntityIds: ((r["winner_entity_ids"] as (string | number)[] | null) ?? []).map(String),
      winnerCountries: (r["winner_countries"] as (string | null)[] | null) ?? [],
      isForeign: Boolean(r["is_foreign"]),
      cpvCode: (r["cpv_code"] as string | null) ?? null,
      cpvName: (r["cpv_name"] as string | null) ?? null,
      title: (r["title"] as string | null) ?? null,
      awardedValue: r["awarded_value"] != null ? String(r["awarded_value"]) : null,
      amountKind: (r["amount_kind"] as string | null) ?? null,
      amountDetails: (r["amount_details"] as import("@seap/db").TedAmountDetails | null) ?? null,
      lotId: (r["lot_id"] as string | null) ?? null,
      winnerSelectionStatus: (r["winner_selection_status"] as string | null) ?? null,
      tendersReceived: r["tenders_received"] == null ? null : Number(r["tenders_received"]),
      currency: (r["currency"] as string | null) ?? null,
      awardDate: (r["award_date"] as string | null) ?? null,
      procedureType: (r["procedure_type"] as string | null) ?? null,
      isSingleBidder: r["is_single_bidder"] == null ? null : Boolean(r["is_single_bidder"]),
      euFunded: r["eu_funded"] == null ? null : Boolean(r["eu_funded"]),
      label: String(r["label"]),
      matchedContractId: r["matched_contract_id"] != null ? String(r["matched_contract_id"]) : null,
    })),
  };
}

/** One funnel of the award table, within its budget. */
export function getTedFacet(key: string, filters: FilterState, request: FacetRequest = {}): Promise<Facet> {
  const sql = db();
  return facetOf(sql, tedSource(sql), key, filters, { budgetMs: TED_FACET_BUDGET_MS, cache: "ted", ...request });
}
